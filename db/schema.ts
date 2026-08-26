import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  resultJson: text("result_json", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_ad_requests_created_at").on(table.createdAt)]);
