PRAGMA defer_foreign_keys = ON;--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`sdkSessionId` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `conversations` (`id`, `title`, `status`, `sdkSessionId`, `createdAt`, `updatedAt`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
		substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) ||
		substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	COALESCE(
		(SELECT NULLIF(trim(replace(replace(substr(`content`, 1, 80), char(10), ' '), char(13), ' ')), '')
			FROM `messages` WHERE `role` = 'user' ORDER BY `createdAt`, rowid LIMIT 1),
		'Previous conversation'
	),
	CASE WHEN (SELECT `value` FROM `metadata` WHERE `key` = 'cleanupPending') = '1'
		THEN 'removing' ELSE 'active' END,
	(SELECT `value` FROM `metadata` WHERE `key` = 'sdkSession'),
	COALESCE((SELECT min(`createdAt`) FROM `runs`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	COALESCE(
		(SELECT max(`createdAt`) FROM `messages`),
		(SELECT min(`createdAt`) FROM `runs`),
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	)
WHERE EXISTS (SELECT 1 FROM `runs`)
	OR EXISTS (SELECT 1 FROM `metadata` WHERE `key` = 'sdkSession');--> statement-breakpoint
ALTER TABLE `runs` RENAME TO `__legacy_runs`;--> statement-breakpoint
ALTER TABLE `messages` RENAME TO `__legacy_messages`;--> statement-breakpoint
ALTER TABLE `approvals` RENAME TO `__legacy_approvals`;--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`requestMessageId` text,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requestMessageId`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`runId` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`handoffVersionId` text,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`runId`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`handoffVersionId`) REFERENCES `handoff_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
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
CREATE TABLE `handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `handoff_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`handoffId` text NOT NULL,
	`version` integer NOT NULL,
	`format` integer NOT NULL,
	`title` text NOT NULL,
	`reference` text NOT NULL,
	`content` text NOT NULL,
	`retrievedAt` text NOT NULL,
	`sourceIncomplete` integer NOT NULL,
	`originMessageId` text,
	`originRunId` text,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`handoffId`) REFERENCES `handoffs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`originMessageId`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`originRunId`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `runs` (`id`, `conversationId`, `requestMessageId`, `status`, `createdAt`)
SELECT
	r.`id`,
	(SELECT `id` FROM `conversations`),
	(SELECT m.`id` FROM `__legacy_messages` m
		WHERE m.`runId` = r.`id` AND m.`role` = 'user' ORDER BY m.`createdAt`, m.rowid LIMIT 1),
	r.`status`,
	r.`createdAt`
FROM `__legacy_runs` r ORDER BY r.rowid;--> statement-breakpoint
INSERT INTO `messages` (`id`, `conversationId`, `runId`, `role`, `content`, `status`, `createdAt`, `handoffVersionId`)
SELECT `id`, (SELECT `id` FROM `conversations`), `runId`, `role`, `content`, `status`, `createdAt`, NULL
FROM `__legacy_messages` ORDER BY rowid;--> statement-breakpoint
INSERT INTO `approvals` (`id`, `todoId`, `revision`, `title`, `runId`, `expiresAt`, `consumed`)
SELECT `id`, `todoId`, `revision`, `title`, `runId`, `expiresAt`, `consumed`
FROM `__legacy_approvals` ORDER BY rowid;--> statement-breakpoint
DROP TABLE `__legacy_approvals`;--> statement-breakpoint
DROP TABLE `__legacy_messages`;--> statement-breakpoint
DROP TABLE `__legacy_runs`;--> statement-breakpoint
DELETE FROM `metadata` WHERE `key` IN ('sdkSession', 'cleanupPending');--> statement-breakpoint
CREATE INDEX `runs_conversation_idx` ON `runs` (`conversationId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_versions_order` ON `handoff_versions` (`handoffId`,`version`);
