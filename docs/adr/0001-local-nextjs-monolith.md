# ADR-0001: Local Next.js Modular Monolith

Date: 2026-10-26  
Status: Accepted

## Context

The dashboard is a local, single-user application with a web UI, SQLite, periodic
Azure DevOps reads, and a server-side AI runtime. Simple deployment is more
important than independent service scaling.

## Decision

Use TypeScript strict and Next.js fullstack on Node.js 24 LTS, deployed through
Docker Compose on Linux/WSL2. Publish the web interface at localhost:3000 only.
Use one modular application, not separately deployed frontend/backend services.

## Alternatives considered

- React/Vite plus Fastify: clear server lifecycle but more frontend/backend wiring;
  Next.js was selected instead.
- Serverless/cloud deployment: conflicts with local SQLite, persistent background
  work, and the chosen local runtime.
- Microservices: adds deployment and failure complexity without a current need.

## Consequences

- Keep domain services separate from Next.js entry points.
- Use the Node runtime; Edge hosting is outside this design.
- A Copilot-managed child process is compatible with a monolith; an exact
  one-process constraint is not intended.
- Background lifecycle and native packaging need production-container proof.

## Verification

[OPS-001](../requirements/experience-and-operations.md#ops-001--local-deployment),
[G0](../implementation-plan.md#gate-g0--verify-compatibility-and-high-risk-assumptions),
and the [polling decision](0004-background-sync.md).
