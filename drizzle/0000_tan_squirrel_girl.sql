CREATE TABLE `ad_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`placement_id` text NOT NULL,
	`city` text NOT NULL,
	`device` text NOT NULL,
	`scene` text NOT NULL,
	`recalled_count` integer NOT NULL,
	`filtered_count` integer NOT NULL,
	`winner_ad_id` text,
	`charge` real,
	`result_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`winner_ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ads` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`brand` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`regions` text NOT NULL,
	`devices` text NOT NULL,
	`scenes` text NOT NULL,
	`billing_mode` text NOT NULL,
	`bid` real NOT NULL,
	`ctr` real NOT NULL,
	`cvr` real NOT NULL,
	`quality` real NOT NULL,
	`budget` real NOT NULL,
	`frequency` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`color` text DEFAULT '#dce8f5' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `advertisers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`advertiser_id` text NOT NULL,
	`name` text NOT NULL,
	`daily_budget` real NOT NULL,
	`spent` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers`(`id`) ON UPDATE no action ON DELETE no action
);
