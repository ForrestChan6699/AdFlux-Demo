import { getD1 } from "../../db";
import type { ChargeEvent } from "../engine";

type AdOwner = { campaign_id: string; advertiser_id: string; daily_budget: number; pacing_mode: "asap" | "even" };
export type Reservation = {
  id: string; request_id: string; advertiser_id: string; campaign_id: string;
  ad_id: string; amount: number; charge_event: ChargeEvent;
  status: "reserved" | "charged" | "released"; expires_at: string;
};

// Even pacing spreads the daily budget across the Shanghai delivery day: at
// 30% of the day the campaign may only have consumed 30% of its budget. The
// ceiling grows linearly with elapsed minutes so spend never sprints ahead.
export function pacingCeiling(dailyBudget: number, pacingMode: "asap" | "even", now: Date): number | null {
  if (pacingMode !== "even") return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai", hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(now);
  const [hour, minute] = parts.split(":").map(Number);
  const elapsedMinutes = (hour % 24) * 60 + minute;
  return dailyBudget * elapsedMinutes / 1440;
}

export async function reserveBudget(input: {
  requestId: string; adId: string; amount: number; chargeEvent: ChargeEvent;
}): Promise<Reservation | undefined> {
  const d1 = getD1();
  const owner = await d1.prepare(`
    SELECT c.id AS campaign_id, c.advertiser_id, c.daily_budget, c.pacing_mode
    FROM ads a JOIN campaigns c ON c.id = a.campaign_id
    JOIN advertisers v ON v.id = c.advertiser_id
    WHERE a.id = ? AND a.status = 'active' AND c.status = 'active' AND v.status = 'active'
  `).bind(input.adId).first<AdOwner>();
  if (!owner || input.amount <= 0) return undefined;

  const reservationId = `rsv_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const ledgerId = `led_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  const amount = Number(input.amount.toFixed(6));
  const ceiling = pacingCeiling(owner.daily_budget, owner.pacing_mode, now);

  await d1.batch([
    d1.prepare(`
      INSERT INTO budget_reservations
        (id, request_id, advertiser_id, campaign_id, ad_id, amount, charge_event, status, expires_at, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?
      FROM campaigns c JOIN advertisers a ON a.id = c.advertiser_id
      WHERE c.id = ? AND c.status = 'active' AND a.status = 'active'
        AND c.spent + ? <= c.daily_budget AND a.balance >= ?
        AND (? IS NULL OR c.spent + ? <= ?)
    `).bind(reservationId, input.requestId, owner.advertiser_id, owner.campaign_id,
      input.adId, amount, input.chargeEvent, expiresAt, now.toISOString(),
      owner.campaign_id, amount, amount, ceiling, amount, ceiling),
    d1.prepare(`UPDATE campaigns SET spent = spent + ? WHERE id = ? AND EXISTS
      (SELECT 1 FROM budget_reservations WHERE id = ? AND status = 'reserved')`)
      .bind(amount, owner.campaign_id, reservationId),
    d1.prepare(`UPDATE advertisers SET balance = balance - ? WHERE id = ? AND EXISTS
      (SELECT 1 FROM budget_reservations WHERE id = ? AND status = 'reserved')`)
      .bind(amount, owner.advertiser_id, reservationId),
    d1.prepare(`INSERT INTO billing_ledger
      (id, reservation_id, advertiser_id, campaign_id, type, amount, idempotency_key, created_at)
      SELECT ?, id, advertiser_id, campaign_id, 'reserve', amount, ?, ?
      FROM budget_reservations WHERE id = ?`)
      .bind(ledgerId, `reserve:${reservationId}`, now.toISOString(), reservationId),
  ]);

  return (await d1.prepare("SELECT * FROM budget_reservations WHERE id = ?")
    .bind(reservationId).first<Reservation>()) ?? undefined;
}

export async function settleReservation(requestId: string, event: ChargeEvent): Promise<boolean> {
  const d1 = getD1();
  const reservation = await d1.prepare(`SELECT * FROM budget_reservations
    WHERE request_id = ? AND status = 'reserved' AND charge_event = ?`)
    .bind(requestId, event).first<Reservation>();
  if (!reservation) return false;

  const settledAt = new Date().toISOString();
  const ledgerId = `led_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const results = await d1.batch([
    d1.prepare(`UPDATE budget_reservations SET status = 'charged', settled_at = ?
      WHERE id = ? AND status = 'reserved'`).bind(settledAt, reservation.id),
    d1.prepare(`INSERT OR IGNORE INTO billing_ledger
      (id, reservation_id, advertiser_id, campaign_id, type, amount, idempotency_key, created_at)
      SELECT ?, id, advertiser_id, campaign_id, 'charge', amount, ?, ?
      FROM budget_reservations WHERE id = ? AND status = 'charged' AND settled_at = ?`)
      .bind(ledgerId, `charge:${reservation.id}`, settledAt, reservation.id, settledAt),
  ]);
  return Number(results[0]?.meta?.changes ?? 0) > 0;
}

export async function releaseExpiredReservations(): Promise<number> {
  const d1 = getD1();
  const now = new Date().toISOString();
  const expired = await d1.prepare(`SELECT * FROM budget_reservations
    WHERE status = 'reserved' AND expires_at <= ? LIMIT 50`).bind(now).all<Reservation>();

  let released = 0;
  for (const item of expired.results) {
    const marker = new Date().toISOString();
    const ledgerId = `led_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
    const results = await d1.batch([
      d1.prepare(`UPDATE budget_reservations SET status = 'released', settled_at = ?
        WHERE id = ? AND status = 'reserved'`).bind(marker, item.id),
      d1.prepare(`UPDATE campaigns SET spent = MAX(0, spent - ?) WHERE id = ? AND EXISTS
        (SELECT 1 FROM budget_reservations WHERE id = ? AND status = 'released' AND settled_at = ?)`)
        .bind(item.amount, item.campaign_id, item.id, marker),
      d1.prepare(`UPDATE advertisers SET balance = balance + ? WHERE id = ? AND EXISTS
        (SELECT 1 FROM budget_reservations WHERE id = ? AND status = 'released' AND settled_at = ?)`)
        .bind(item.amount, item.advertiser_id, item.id, marker),
      d1.prepare(`INSERT OR IGNORE INTO billing_ledger
        (id, reservation_id, advertiser_id, campaign_id, type, amount, idempotency_key, created_at)
        SELECT ?, id, advertiser_id, campaign_id, 'release', -amount, ?, ?
        FROM budget_reservations WHERE id = ? AND status = 'released' AND settled_at = ?`)
        .bind(ledgerId, `release:${item.id}`, marker, item.id, marker),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) > 0) released += 1;
  }
  return released;
}
