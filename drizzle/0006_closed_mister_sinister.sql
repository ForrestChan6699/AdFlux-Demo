CREATE TABLE `experiment_assignments` (
	`request_id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`variant` text NOT NULL,
	`bucket` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `ad_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_experiment_variant` ON `experiment_assignments` (`experiment_id`,`variant`);--> statement-breakpoint
CREATE INDEX `idx_experiment_user` ON `experiment_assignments` (`experiment_id`,`user_id`);--> statement-breakpoint
CREATE TRIGGER `experiment_assignments_no_update`
BEFORE UPDATE ON `experiment_assignments`
BEGIN
  SELECT RAISE(ABORT, 'experiment assignment is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `experiment_assignments_no_delete`
BEFORE DELETE ON `experiment_assignments`
BEGIN
  SELECT RAISE(ABORT, 'experiment assignment is append-only');
END;
