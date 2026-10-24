ALTER TABLE `records` ADD `tracking_number` text;--> statement-breakpoint
ALTER TABLE `records` ADD `purchase_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `records_tracking` ON `records` (`tracking_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `records_purchase` ON `records` (`purchase_key`);