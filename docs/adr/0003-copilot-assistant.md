# ADR-0003: Copilot SDK and Persistent Chat

Date: 2026-10-26  
Status: Accepted

## Context

The original overview allowed OpenAI or Ollama. During planning, GitHub Copilot
SDK was selected instead, together with durable conversation storage.

## Decision

Use the GitHub Copilot SDK as the only required AI integration in the MVP.
Authenticate with an explicit server-side `COPILOT_GITHUB_TOKEN`; do not borrow
VS Code login state. Configure a model, preserve local chat, and support
continuation after restart.

The user approved sending relevant work-item/PR context to Copilot on demand.
Normal synchronization does not send it to the AI service.

## Alternatives considered

- Direct OpenAI/Ollama providers: not required by the chosen MVP.
- General multi-provider framework: premature while only Copilot is required.
- Ephemeral chat: rejected in favor of persistent local conversations.
- Autonomous agent orchestration/MCP: unnecessary for a small fixed tool surface.

## Consequences

- Account eligibility, organizational policy, model access, usage limits, and
  network availability affect AI generation.
- SDK runtime process/state must be included in packaging and backup design.
- Default CLI capabilities are broader than this app needs; explicit tool
  isolation and permission denial are release requirements.
- Transcript storage and SDK session storage must be managed and cleared together.
- On-demand data transfer is not a promise of local model inference.

## Verification

[AI requirements](../requirements/assistant.md),
[runtime design](../architecture.md#8-copilot-runtime-and-tools), and
[G0](../implementation-plan.md#gate-g0--verify-compatibility-and-high-risk-assumptions).

## Sources

- [SDK overview](https://github.com/github/copilot-sdk/blob/main/README.md)
- [Authentication](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)
- [Session persistence](https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md)

Checked during planning on 2026-10-26; verify against pinned versions.
