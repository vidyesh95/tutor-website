CREATE TABLE `tutor_profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`headline` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`photo_key` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
