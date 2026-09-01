CREATE TABLE `operation_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`request_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operation_audit_request` ON `operation_audit_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_operation_audit_resource` ON `operation_audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_operation_audit_created_at` ON `operation_audit_logs` (`created_at`);--> statement-breakpoint
CREATE TRIGGER `operation_audit_logs_no_update`
BEFORE UPDATE ON `operation_audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'operation audit log is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `operation_audit_logs_no_delete`
BEFORE DELETE ON `operation_audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'operation audit log is append-only');
END;
