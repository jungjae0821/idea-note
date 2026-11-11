CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`topic` text NOT NULL,
	`constraints` text DEFAULT '' NOT NULL,
	`category_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`model_id` text NOT NULL,
	`created_at` text NOT NULL,
	`saved_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ideas_owner_created_idx` ON `ideas` (`owner_id`,`created_at`,`id`);