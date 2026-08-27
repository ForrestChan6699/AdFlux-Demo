CREATE TABLE `auction_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`placement_id` text NOT NULL,
	`auction_type` text NOT NULL,
	`winner_ad_id` text NOT NULL,
	`runner_up_ad_id` text,
	`winner_ecpm` real NOT NULL,
	`runner_up_ecpm` real NOT NULL,
	`floor_ecpm` real NOT NULL,
	`clearing_ecpm` real NOT NULL,
	`charge_event` text NOT NULL,
	`event_charge` real NOT NULL,
	`candidate_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `ad_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`placement_id`) REFERENCES `placements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`runner_up_ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auction_logs_request` ON `auction_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_auction_logs_created_at` ON `auction_logs` (`created_at`);--> statement-breakpoint
CREATE TRIGGER `billing_ledger_no_update`
BEFORE UPDATE ON `billing_ledger`
BEGIN
  SELECT RAISE(ABORT, 'billing ledger is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `billing_ledger_no_delete`
BEFORE DELETE ON `billing_ledger`
BEGIN
  SELECT RAISE(ABORT, 'billing ledger is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `billing_ledger_validate_insert`
BEFORE INSERT ON `billing_ledger`
WHEN NEW.amount = 0
  OR (NEW.type IN ('reserve', 'charge') AND NEW.amount < 0)
  OR (NEW.type IN ('release', 'refund') AND NEW.amount > 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid billing ledger amount');
END;--> statement-breakpoint
CREATE TRIGGER `auction_logs_no_update`
BEFORE UPDATE ON `auction_logs`
BEGIN
  SELECT RAISE(ABORT, 'auction log is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `auction_logs_no_delete`
BEFORE DELETE ON `auction_logs`
BEGIN
  SELECT RAISE(ABORT, 'auction log is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `ad_events_no_update`
BEFORE UPDATE ON `ad_events`
BEGIN
  SELECT RAISE(ABORT, 'ad event is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `ad_events_no_delete`
BEFORE DELETE ON `ad_events`
BEGIN
  SELECT RAISE(ABORT, 'ad event is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `budget_reservations_guard_update`
BEFORE UPDATE ON `budget_reservations`
WHEN OLD.status <> 'reserved'
  OR NEW.status NOT IN ('charged', 'released')
  OR NEW.request_id <> OLD.request_id
  OR NEW.advertiser_id <> OLD.advertiser_id
  OR NEW.campaign_id <> OLD.campaign_id
  OR NEW.ad_id <> OLD.ad_id
  OR NEW.amount <> OLD.amount
  OR NEW.charge_event <> OLD.charge_event
BEGIN
  SELECT RAISE(ABORT, 'invalid budget reservation transition');
END;
