import { getD1 } from "../../../../../db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) return Response.json({ error: "request id is required" }, { status: 400 });
    const d1 = getD1();
    const [requestResult, auctionResult, reservationResult, eventResult, ledgerResult] = await d1.batch([
      d1.prepare("SELECT * FROM ad_requests WHERE id = ? LIMIT 1").bind(id),
      d1.prepare("SELECT * FROM auction_logs WHERE request_id = ? ORDER BY created_at").bind(id),
      d1.prepare("SELECT * FROM budget_reservations WHERE request_id = ? ORDER BY created_at").bind(id),
      d1.prepare("SELECT * FROM ad_events WHERE request_id = ? ORDER BY occurred_at").bind(id),
      d1.prepare("SELECT l.* FROM billing_ledger l JOIN budget_reservations r ON r.id=l.reservation_id WHERE r.request_id = ? ORDER BY l.created_at").bind(id),
    ]);
    const requestRow = requestResult.results[0];
    if (!requestRow) return Response.json({ error: "request not found" }, { status: 404 });
    return Response.json({ request: requestRow, auction: auctionResult.results[0] ?? null, reservations: reservationResult.results, events: eventResult.results, ledger: ledgerResult.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
