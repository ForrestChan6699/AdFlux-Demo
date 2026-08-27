import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { adEvents } from "../../../db/schema";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestId = url.searchParams.get("requestId")?.trim();
    const db = getDb();
    const events = requestId
      ? await db.select().from(adEvents).where(eq(adEvents.requestId, requestId))
        .orderBy(desc(adEvents.occurredAt)).limit(100)
      : await db.select().from(adEvents).orderBy(desc(adEvents.occurredAt)).limit(100);
    const stats = await db.select({ type: adEvents.type, count: sql<number>`count(*)` })
      .from(adEvents).groupBy(adEvents.type);
    return Response.json({ events, stats });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
