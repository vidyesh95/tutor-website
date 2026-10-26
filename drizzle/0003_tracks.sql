CREATE TABLE `tracks` (
	`slug` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`blurb` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
INSERT INTO `tracks` (`slug`, `label`, `blurb`, `position`) VALUES
	('class-10', 'Class 10', 'Maths and Computer Science', 0),
	('class-11', 'Class 11', 'Maths and Computer Science', 1),
	('class-12', 'Class 12', 'Maths and Computer Science', 2),
	('engineering', 'Engineering', 'C, C++, Java and Python', 3),
	('pro', 'Professionals', 'AI, cloud and backend engineering', 4);
