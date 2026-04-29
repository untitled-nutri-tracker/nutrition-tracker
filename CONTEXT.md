# NutriLog — Project Context

> **Audience:** Human developers and AI coding agents.
> This is a living document describing the overall architecture, tech stack, and established patterns of the NutriLog application.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Desktop Shell** | Tauri v2 | Rust backend providing local system access. |
| **Frontend** | React 19 + TypeScript + Vite | Running on port 1420 during development. |
| **Routing** | react-router-dom v7 | Client-side routing. |
| **Database** | SQLite via `rusqlite` | Fully local DB; no remote sync. |
| **HTTP Client** | `reqwest` | Used in Tauri *only* for external API calls (e.g., OpenFoodFacts). |
| **Async Runtime**| `tokio` | Drives async Tauri commands. |
| **AI Pipeline** | Vercel AI SDK + Ollama | Standalone background module (`src-ai/`). |
| **Type Gen** | `tauri-typegen` | Synchronizes Rust models to TS interfaces. |

---

## Repository Structure

```
/
├── src/                        # React frontend
│   ├── components/             # Reusable UI elements
│   ├── hooks/                  # Custom React hooks (e.g., useUserProfile)
│   ├── lib/                    # Shared logic, stores, and context providers
│   ├── pages/                  # Route-level views
│   ├── bindings/              # Auto-generated TS bindings from Rust (Do not edit manually)
│   └── types/                  # Additional TypeScript definitions
├── src-tauri/                  # Tauri app orchestration
│   └── src/
│       ├── lib.rs              # App entry point and command registration
│       ├── network_config.rs   # Global feature flags for external APIs
│       ├── api/                # External network integrations (reqwest)
│       └── utils/              # Shared crate-wide helpers (e.g., network_errors.rs)
├── src-rust-crates/            # Core Rust logic (Workspace crates)
│   ├── model/                  # Shared Serde data models
│   └── database/               # SQLite connection management and CRUD operations
└── src-ai/                     # Standalone AI analysis pipelines (Node.js)
```

---

## Core Architecture Patterns

### 1. Local-First Database Strategy
The app is designed to be **offline-first and local-first**. The database is a local SQLite file managed directly by the Rust backend.
- **Singleton Access:** The SQLite connection is process-wide, held in `DatabaseConnectionManager::global()`.
- **Session Switching:** The singleton can be connected, disconnected, and reconnected to different SQLite files at runtime via the `session` commands in `nutrack-database`.
- **Last Database Restore:** The active database path is remembered in app data and restored on startup when possible, so users normally return directly to their previous workspace.
- **Command Structure:** Database operations are isolated in private `_with_conn(&Connection)` helper functions, which are then wrapped by thin `pub fn` Tauri commands. This separates DB logic from IPC concerns.

### 2. Tauri IPC and Type Safety
Communication between the React frontend and Rust backend strictly uses Tauri commands.
- **Rust to TS:** `tauri-typegen` automatically generates `src/bindings/types.ts` and `src/bindings/commands.ts` from the Rust backend. When modifying Rust structs or command signatures, running `cargo build` updates the frontend bindings.
- **Frontend Call Site Rule:** React/TypeScript code should call the generated functions from `src/bindings/` rather than using raw `@tauri-apps/api/core` `invoke(...)` calls directly. If a command is missing from the generated bindings, fix the Rust export/typegen flow instead of adding a new manual invoke wrapper.
- **Error Propagation:** Tauri commands should return `Result<T, String>`. Use `.map_err(|e| e.to_string())` to pass errors cleanly across the IPC boundary so they can be caught and displayed by the React UI.

### 3. External Network & API Handling
While the core app is fully local, specific features (like barcode lookups) require external network access.
- **Fail Gracefully:** Any `reqwest` HTTP failures (DNS, timeout, status errors) should be intercepted via `.map_err(map_network_error)` (from `crate::utils::network_errors`) to provide clean, user-friendly strings to the frontend (e.g., "You're currently offline.").
- **Feature Toggles:** External APIs are securely gated behind internal feature flags managed in `NetworkConfig`.
- **Frontend Awareness:** The `NetworkProvider` context allows the React frontend to adapt its UI (like disabling buttons or showing warnings) natively via `navigator.onLine`.

### 4. IPC Input Validation
Every Tauri command must validate its inputs before processing. Two mechanisms are available:
- **Model structs:** Implement the `Validate` trait (from `nutrack_model::validate`) and call `.validate()?` as the first line of the command. This covers all CRUD operations.
- **Primitive args** (strings, numerics): Use guard functions from `crate::utils::ipc_guards` (e.g., `sanitize_string`, `require_positive_i64`, `validate_barcode`). This covers API search, AI advice, and barcode lookup commands.

Validation errors return clean, user-friendly strings — never raw database or system errors. The `crate::utils::ipc_errors::sanitize_db_error` helper is available for wrapping raw SQLite errors at the IPC boundary.

### 5. Rust Workspace & Modularization
The Rust backend is intentionally split into separate crates and modules to isolate domains of logic:
- **`nutrack-model` (Library Crate):** Contains pure Rust structs and Enums (e.g., `Food`, `UserProfile`) with `serde` implementations. No business or database logic. Completely pure, safe to share anywhere.
- **Shared Analytics DTOs:** `nutrack-model::meal` also defines analytics-facing transport types such as `NutritionTotals`, `NutritionTrendPoint`, `TrendBucket`, and shared time constants so both the database crate and generated frontend bindings use the same shapes.
- **`nutrack-database` (Library Crate):** Contains the SQLite schema, connection manager, and all database CRUD operations. The CRUD operations are split cleanly into separate files/modules (`food.rs`, `meal.rs`, `user_profile.rs`) to prevent monoliths.
- **Aggregation Queries:** `src-rust-crates/database/src/meal.rs` now owns not only meal CRUD, but also nutrition aggregation and trend queries built from `meals`, `meal_items`, and `nutrition_facts`. Daily and weekly rollups are timezone-aware via caller-provided `offset_minutes`.
- **Database Session Layer:** `src-rust-crates/database/src/session.rs` owns database-file session management, last-path persistence, and the app-scoped profile stored inside the selected SQLite file.
- **`src-tauri` (App Crate):** The Tauri application shell. It imports the database and model crates, acting only as the orchestrator. It handles IPC (commands), external APIs (`openfoodfacts.rs`), and system-level configuration.
This separation of concerns makes unit testing the database layer extremely fast and decoupled from Tauri infrastructure.

### 6. UI Error Handling Convention
The frontend relies on consistent error presentation. Caught backend errors or local validations should be displayed contextually within the active page or component, typically using the standardized error card styling established in components like `Settings` and `AiAdvisor`.

### 7. Frontend Data Persistence Pattern
The frontend uses a dual-mode persistence pattern for all local state:
- **`USE_TAURI = false`:** Data is stored in `localStorage` using versioned keys (e.g., `nutrilog.foodLog.v1.YYYY-MM-DD`). This allows the full UI to work without any Rust backend.
- **`USE_TAURI = true`:** A single flag flip switches all reads/writes to Tauri IPC commands. No other code changes are required.
- This pattern is established in `profileStore.ts` (Sprint 1.4) and `foodLogStore.ts` (Sprint 2.1), and should be followed by all future frontend data layers.
- **Current App Behavior:** The production desktop flow now requires an active selected database. The landing page uses `DatabaseSessionContext` to gate the main app until a database is created or opened.

### 8. UI Component Library
Shared UI primitives live in `src/components/ui/` and must be used instead of writing one-off inline styles:
- `Button` — variants: `primary`, `secondary`, `ghost`, `danger`. Sizes: `sm`, `md`, `lg`.
- `Input` / `Select` — with `label`, `error`, and `hint` props.
- `Modal` — handles ESC close, backdrop click, and body scroll lock.
- `StatCard` — for displaying numeric metrics with optional accent color.
- `EmptyState` — for zero-data views with optional CTA button.
### 9. Secure Credential Management
API Keys and secrets are never stored in plaintext on disk, and the React frontend never receives plaintext keys from the backend.
- **OS Native Vault (`keyring`):** Keys are stored as a single JSON blob under `__nutrilog_vault__` in the OS Keychain (macOS Keychain, Windows Credential Manager).
- **AES-GCM Fallback:** Systems without a native keyring use an AES-256-GCM encrypted file (`credentials.vault`), keyed via PBKDF2 from a machine-specific identifier.
- **Memory Caching:** To prevent aggressive macOS security prompts, the vault is decrypted exactly once via a lazy-loaded `Mutex` and cached in memory for the duration of the session.
- **Frontend Previews:** The Tauri IPC layer strictly enforces that only masked string previews (e.g., `sk-abc...xyz`) are sent back to the React UI layer.

### 10. AI Architecture (Bring-Your-Own-Model)
NutriLog is designed to respect user privacy and avoid vendor lock-in by completely decoupling the AI advisor logic from any single external API.
- **Provider Agnostic:** Supports OpenAI, Google Gemini, Anthropic, and local inference via Ollama.
- **Deep Verification:** Provider API keys are not merely stored; they undergo a runtime inference test (`verification` via a `max_tokens: 5` generation call) to guarantee sufficient quota and billing before the UI allows the user to interact with the LLM.
- **Agentic Frontend Directives:** The AI generates JSON-like `[FRONTEND_ACTION: ...]` payload strings that are intercepted by the `AiAdvisor` React component to automatically perform side effects (e.g., calling `invoke('create_meal', ...)` to auto-log proposed meal plans).
- **Configuration Storage:** User AI settings (selected provider, specific model string, and custom local endpoints) are preserved in a backend Rust singleton `AiConfigManager` backed by a `nutrition_ai_config.json` file inside the OS app data directory, ensuring settings persist securely between sessions.
**Note on Changelogs:**
For a historical record of updates, features, and version bumps, please refer to [`CHANGELOG.md`](./CHANGELOG.md).
