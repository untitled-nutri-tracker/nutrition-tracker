## Plan: AI Memory Lifecycle Integration

Add a conservative memory lifecycle for AI Advisor: auto-save only high-confidence user facts, never auto-delete silently, and surface contradiction updates as user-approval suggestions. Keep Settings UX minimal with View + Add + Delete, plus a compact suggestions strip for approve/dismiss.

**Steps**
1. Phase 1: Data + command surface (foundation)
2. Add memory metadata support in Rust DB layer so memory rows can be managed safely over time: keep `ai_memories` and add fields needed for conservative automation (`updated_at`, `source`, `confidence`) plus indexes for lookup.
3. Add a small pending-suggestion table (`ai_memory_suggestions`) for contradiction/update proposals requiring explicit user action.
4. Add DB commands in [src-rust-crates/database/src/ai.rs](src-rust-crates/database/src/ai.rs) and register them in [src-rust-crates/database/src/lib.rs](src-rust-crates/database/src/lib.rs) + [src-tauri/src/lib.rs](src-tauri/src/lib.rs): list suggestions, approve suggestion, dismiss suggestion, update memory text, and upsert memory.
5. Regenerate bindings in [src/generated/commands.ts](src/generated/commands.ts) and [src/generated/types.ts](src/generated/types.ts) once command signatures are final.
6. Phase 2: Memory inference in AI chat (depends on Phase 1)
7. Introduce a post-response memory extraction path in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) (non-blocking relative to user response): evaluate latest user message + assistant response + current memories and return memory actions.
8. Implement conservative extraction logic in Rust AI layer ([src-tauri/src/api/ai.rs](src-tauri/src/api/ai.rs)): only capture durable profile/preferences/constraints and score confidence; reject transient facts.
9. Add contradiction detection that creates pending suggestions (not auto-removal): example outcomes are `suggest_replace`, `suggest_remove`, `suggest_merge` targeting existing memory IDs.
10. Add strict guardrails: max actions per response, dedup via normalized text, and no destructive write without user approval path.
11. Phase 3: Settings UX (parallel with late Phase 2 once APIs exist)
12. Extend memory section in [src/pages/Settings.tsx](src/pages/Settings.tsx) to support low-clutter Add + Delete + compact suggestion review row.
13. Keep default view simple: memory list with delete controls and a single Add affordance; avoid always-on inline edit to reduce clutter.
14. Add a small “Memory suggestions” area above the list (collapsed when empty) with Approve/Dismiss actions.
15. If needed, include optional edit behind one progressive-disclosure action (“Edit”) only after list row expansion; do not show edit controls by default.
16. Phase 4: AI Advisor integration touchpoints (depends on Phase 2)
17. In [src/pages/AiAdvisor.tsx](src/pages/AiAdvisor.tsx), keep response UX unchanged; memory extraction should be transparent.
18. Add lightweight status feedback only on meaningful events (e.g., “Saved 1 preference”, “1 memory suggestion available”), rate-limited to avoid chat noise.
19. Ensure existing memory context injection into `ask_llm` remains stable and now includes freshness order (updated_at) for better relevance.
20. Phase 5: Safety + rollout hardening (depends on all prior phases)
21. Add unit tests for extraction classifier, dedup/upsert, contradiction suggestion creation, suggestion approval/dismiss flows.
22. Add migration tests to verify existing databases upgrade cleanly.
23. Add UI tests/manual checklist for add/delete/suggestion approve/dismiss and empty/loading/error states.

**Relevant files**
- [src-rust-crates/database/sql/init.sql](src-rust-crates/database/sql/init.sql) — extend schema for memory lifecycle and suggestions.
- [src-rust-crates/database/src/ai.rs](src-rust-crates/database/src/ai.rs) — add upsert/update/suggestion CRUD logic.
- [src-rust-crates/database/src/lib.rs](src-rust-crates/database/src/lib.rs) — register new AI memory commands.
- [src-rust-crates/model/src/ai.rs](src-rust-crates/model/src/ai.rs) — add memory metadata and suggestion model types.
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs) — orchestrate chat + post-response memory processing.
- [src-tauri/src/api/ai.rs](src-tauri/src/api/ai.rs) — extraction/contradiction logic and guardrails.
- [src/generated/commands.ts](src/generated/commands.ts) — generated command bindings updates.
- [src/generated/types.ts](src/generated/types.ts) — generated type updates.
- [src/pages/Settings.tsx](src/pages/Settings.tsx) — low-clutter memory management + suggestions UI.
- [src/pages/AiAdvisor.tsx](src/pages/AiAdvisor.tsx) — optional lightweight memory event feedback.

**Verification**
1. Run frontend build and type checks: `npm run build`.
2. Run Rust tests and add new tests for memory inference/commands: `cargo test -q`.
3. Manual flow: chat with explicit stable preference, verify auto-save appears in Settings memory list.
4. Manual flow: provide contradiction, verify suggestion appears and no auto-delete happens before approval.
5. Manual flow: approve suggestion, verify old memory update/removal and prompt context reflects change.
6. Manual flow: dismiss suggestion, verify memory remains unchanged.
7. Regression: verify existing chat history/session behavior and AI response latency remains acceptable.

**Decisions**
- Automation mode: Conservative.
- User controls: View + Delete + Add.
- Conflict policy: Suggestion-only for contradiction updates/removals; no silent auto-delete.
- UX principle: Progressive disclosure; no always-visible advanced controls.
- Out of scope for first release: full version history UI and autonomous pruning without user approval.

**Further Considerations**
1. Should “Add memory” accept free-text only, or include optional category tags (preference/allergy/goal)? Recommendation: free-text only in v1 for low clutter.
2. Should auto-saved memories display a subtle source badge (“Auto” vs “Manual”)? Recommendation: yes, small muted badge for trust and transparency.
3. Should suggestion approvals trigger a short in-app toast? Recommendation: yes, one-line confirmation only, no modal.