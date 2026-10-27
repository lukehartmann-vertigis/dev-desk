CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`todoId` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`runId` text NOT NULL,
	`expiresAt` text NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`todoId`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`runId`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`runId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`runId`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`result` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`scope` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`data` text NOT NULL,
	`successAt` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`revision` integer NOT NULL,
	`position` integer NOT NULL,
	`completedAt` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`reference` text
);
