CREATE TABLE `ad_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`ad_id` text NOT NULL,
	`type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`valid` integer DEFAULT true NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `ad_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ad_events_idempotency` ON `ad_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_ad_events_request_type` ON `ad_events` (`request_id`,`type`);--> statement-breakpoint
CREATE TABLE `billing_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`advertiser_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `budget_reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_billing_ledger_idempotency` ON `billing_ledger` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_billing_ledger_reservation` ON `billing_ledger` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `budget_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`advertiser_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`ad_id` text NOT NULL,
	`amount` real NOT NULL,
	`charge_event` text NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`settled_at` text,
	FOREIGN KEY (`request_id`) REFERENCES `ad_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budget_reservations_request` ON `budget_reservations` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_budget_reservations_expiry` ON `budget_reservations` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `placements` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`auction_type` text DEFAULT 'gsp' NOT NULL,
	`floor_ecpm` real DEFAULT 0 NOT NULL,
	`slots` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ad_requests` ADD `auction_type` text;--> statement-breakpoint
ALTER TABLE `ad_requests` ADD `clearing_ecpm` real;--> statement-breakpoint
ALTER TABLE `ad_requests` ADD `charge_event` text;--> statement-breakpoint
ALTER TABLE `ad_requests` ADD `tracking_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ad_requests_tracking_token` ON `ad_requests` (`tracking_token`);