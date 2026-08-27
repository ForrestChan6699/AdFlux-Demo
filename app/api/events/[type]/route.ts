import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adEvents, adRequests } from "../../../../db/schema";
import { settleReservation } from "../../../server/budget";
import type { ChargeEvent } from "../../../engine";

const eventTypes: ChargeEvent[] = ["impression", "click", "conversion"];

async function recordEvent(request: Request, typeValue: string) {
  if (!eventTypes.includes(typeValue as ChargeEvent)) {
    return Response.json({ error: "unsupported event type" }, { status: 404 });
  }
  const type = typeValue as ChargeEvent;
  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = url.searchParams.get("token") || bearer;
  if (!token) return Response.json({ error: "tracking token is required" }, { status: 400 });

  const db = getDb();
  const [adRequest] = await db.select().from(adRequests)
    .where(eq(adRequests.trackingToken, token)).limit(1);
  if (!adRequest || !adRequest.winnerAdId) {
    return Response.json({ error: "invalid tracking token" }, { status: 404 });
  }

  let payload: { eventId?: string; occurredAt?: string; adId?: string } = {};
  if (request.method === "POST") {
    payload = await request.json().catch(() => ({}));
  }
  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  const requestedAt = new Date(adRequest.createdAt);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 300_000
    || occurredAt.getTime() < requestedAt.getTime() - 300_000
    || occurredAt.getTime() > requestedAt.getTime() + 7 * 86_400_000) {
    return Response.json({ error: "occurredAt is invalid" }, { status: 400 });
  }
  if (payload.adId && payload.adId !== adRequest.winnerAdId) {
    return Response.json({ error: "adId does not match the auction winner" }, { status: 409 });
  }

  const prerequisite = type === "click" ? "impression" : type === "conversion" ? "click" : null;
  if (prerequisite) {
    const [prior] = await db.select({ id: adEvents.id }).from(adEvents).where(and(
      eq(adEvents.requestId, adRequest.id), eq(adEvents.type, prerequisite), eq(adEvents.valid, true),
    )).limit(1);
    if (!prior) {
      return Response.json({
        error: `${prerequisite} event is required before ${type}`,
        requestId: adRequest.id, requiredEvent: prerequisite,
      }, { status: 409 });
    }
  }

  const eventId = payload.eventId?.trim() || `evt_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  if (eventId.length > 96) return Response.json({ error: "eventId is too long" }, { status: 400 });
  const clientKey = request.headers.get("idempotency-key")?.trim() || "default";
  if (clientKey.length > 128) return Response.json({ error: "idempotency key is too long" }, { status: 400 });
  const idempotencyKey = `${adRequest.id}:${type}:${clientKey}`;
  const inserted = await db.insert(adEvents).values({
    id: eventId, requestId: adRequest.id, adId: adRequest.winnerAdId,
    type, idempotencyKey, valid: true, occurredAt: occurredAt.toISOString(),
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing({ target: adEvents.idempotencyKey }).returning({ id: adEvents.id });

  const duplicate = inserted.length === 0;
  const charged = duplicate ? false : await settleReservation(adRequest.id, type);
  return Response.json({
    eventId: duplicate ? null : eventId, requestId: adRequest.id,
    adId: adRequest.winnerAdId, type, duplicate, charged,
    chargeEvent: adRequest.chargeEvent,
    billing: { charged, trigger: adRequest.chargeEvent },
  }, { status: duplicate ? 200 : 201 });
}

export async function POST(request: Request, context: { params: Promise<{ type: string }> }) {
  return recordEvent(request, (await context.params).type);
}

export async function GET(request: Request, context: { params: Promise<{ type: string }> }) {
  return recordEvent(request, (await context.params).type);
}
