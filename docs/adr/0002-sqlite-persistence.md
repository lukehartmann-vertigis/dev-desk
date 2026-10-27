# ADR-0002: SQLite and Persistent Local Storage

Date: 2026-10-26  
Status: Accepted

## Context

Todos, cached integration data, and chat history must survive application
restarts. One local user does not justify operating a separate database service.

## Decision

Use SQLite through Drizzle ORM and better-sqlite3, with reviewed versioned SQL
migrations and a persistent Docker volume. Persist application records in SQLite;
also preserve SDK-owned conversation state required by the selected Copilot
runtime.

## Alternatives considered

- Browser/localStorage persistence: insufficient for server-side AI, durable
  integration caching, and consistent multi-tab state.
- JSON files: weak fit for transactional ordering, revisions, and retry receipts.
- PostgreSQL: viable later, but adds an unnecessary service for the MVP.
- Transcript-only persistence: does not establish that the SDK can resume context.

## Consequences

- Use short transactions and test revision conflicts/retry safety.
- Native dependencies must work in the actual Node/Docker image.
- Migration, backup, restore, and SDK state lifecycle need explicit procedures.
- The application does not provide database encryption; host storage protection
  remains required.

## Verification

[TODO-002](../requirements/todos.md#todo-002--persistence-without-daily-behavior),
[OPS-004](../requirements/experience-and-operations.md#ops-004--durable-storage),
[OPS-008](../requirements/experience-and-operations.md#ops-008--backup-and-recovery),
and [AI-002](../requirements/assistant.md#ai-002--persistent-conversation).
