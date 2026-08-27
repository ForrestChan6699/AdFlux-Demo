import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const advertisers = sqliteTable("advertisers", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  balance: real("balance").notNull().default(0),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  advertiserId: text("advertiser_id").notNull().references(() => advertisers.id),
  name: text("name").notNull(), dailyBudget: real("daily_budget").notNull(),
  spent: real("spent").notNull().default(0),
  status: text("status", { enum: ["active", "paused", "ended"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const placements = sqliteTable("placements", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  auctionType: text("auction_type", { enum: ["first_price", "gsp"] }).notNull().default("gsp"),
  floorEcpm: real("floor_ecpm").notNull().default(0),
  slots: integer("slots").notNull().default(1),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ads = sqliteTable("ads", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  brand: text("brand").notNull(), title: text("title").notNull(), category: text("category").notNull(),
  regions: text("regions", { mode: "json" }).$type<string[]>().notNull(),
  devices: text("devices", { mode: "json" }).$type<string[]>().notNull(),
  scenes: text("scenes", { mode: "json" }).$type<string[]>().notNull(),
  billingMode: text("billing_mode", { enum: ["CPM", "CPC", "CPA", "oCPM"] }).notNull(),
  bid: real("bid").notNull(), ctr: real("ctr").notNull(), cvr: real("cvr").notNull(),
  quality: real("quality").notNull(), budget: real("budget").notNull(),
  frequency: integer("frequency").notNull().default(0),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  color: text("color").notNull().default("#dce8f5"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_ads_status").on(table.status)]);

export const adRequests = sqliteTable("ad_requests", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(),
  placementId: text("placement_id").notNull(), city: text("city").notNull(),
  device: text("device").notNull(), scene: text("scene").notNull(),
  recalledCount: integer("recalled_count").notNull(), filteredCount: integer("filtered_count").notNull(),
  winnerAdId: text("winner_ad_id").references(() => ads.id), charge: real("charge"),
  auctionType: text("auction_type", { enum: ["first_price", "gsp"] }),
  clearingEcpm: real("clearing_ecpm"),
  chargeEvent: text("charge_event", { enum: ["impression", "click", "conversion"] }),
  trackingToken: text("tracking_token"),
  resultJson: text("result_json", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_ad_requests_created_at").on(table.createdAt),
  uniqueIndex("idx_ad_requests_tracking_token").on(table.trackingToken),
]);

export const budgetReservations = sqliteTable("budget_reservations", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => adRequests.id),
  advertiserId: text("advertiser_id").notNull().references(() => advertisers.id),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  adId: text("ad_id").notNull().references(() => ads.id),
  amount: real("amount").notNull(),
  chargeEvent: text("charge_event", { enum: ["impression", "click", "conversion"] }).notNull(),
  status: text("status", { enum: ["reserved", "charged", "released"] }).notNull().default("reserved"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  settledAt: text("settled_at"),
}, (table) => [
  uniqueIndex("idx_budget_reservations_request").on(table.requestId),
  index("idx_budget_reservations_expiry").on(table.status, table.expiresAt),
]);

export const billingLedger = sqliteTable("billing_ledger", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => budgetReservations.id),
  advertiserId: text("advertiser_id").notNull().references(() => advertisers.id),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  type: text("type", { enum: ["reserve", "charge", "release", "refund", "adjustment"] }).notNull(),
  amount: real("amount").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_billing_ledger_idempotency").on(table.idempotencyKey),
  index("idx_billing_ledger_reservation").on(table.reservationId),
]);

export const adEvents = sqliteTable("ad_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => adRequests.id),
  adId: text("ad_id").notNull().references(() => ads.id),
  type: text("type", { enum: ["impression", "click", "conversion"] }).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  valid: integer("valid", { mode: "boolean" }).notNull().default(true),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_ad_events_idempotency").on(table.idempotencyKey),
  index("idx_ad_events_request_type").on(table.requestId, table.type),
]);
