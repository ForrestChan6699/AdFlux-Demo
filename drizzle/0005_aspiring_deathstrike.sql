CREATE TABLE `strategy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`config_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`activated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_strategy_versions_status` ON `strategy_versions` (`status`);