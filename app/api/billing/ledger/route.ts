import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { advertisers, auctionLogs, billingLedger, budgetReservations, campaigns } from "../../../../db/schema";

export async function GET() {
  try {
    const db = getDb();
    const [accounts, plans, reservations, ledger, auctions] = await Promise.all([
      db.select().from(advertisers),
      db.select().from(campaigns),
      db.select().from(budgetReservations).orderBy(desc(budgetReservations.createdAt)).limit(30),
      db.select().from(billingLedger).orderBy(desc(billingLedger.createdAt)).limit(50),
      db.select().from(auctionLogs).orderBy(desc(auctionLogs.createdAt)).limit(50),
    ]);
    return Response.json({ accounts, campaigns: plans, reservations, ledger, auctions });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
