CREATE TABLE `azure_settings` (
	`organization` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`boards` text NOT NULL,
	`repositories` text NOT NULL
);
