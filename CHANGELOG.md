# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---
## [Unreleased]

### Added
- Nutrition aggregation APIs in the database layer for arbitrary date ranges, local-day totals, local-week totals, and trend buckets.
- Shared analytics DTOs in `nutrack-model` for `NutritionTotals`, `NutritionTrendPoint`, and `TrendBucket`.

### Changed
- Tauri command registration now includes nutrition aggregation and trend endpoints exposed from the database crate.
- Meal analytics now compute totals directly from `meals`, `meal_items`, and `nutrition_facts` with timezone-aware day and week boundaries.

## [0.8.0] - 2026-04-02

### Added
- Landing page flow for database selection with distinct create/open entry points.
- Runtime database session commands for creating, opening, closing, and restoring SQLite files across launches.
- App-scoped profile persistence stored inside the selected database instead of browser-local storage.
- Native Tauri dialog integration for opening existing databases and choosing save locations for new ones.

### Changed
- Database-session IPC moved out of `src-tauri` and into `src-rust-crates/database/src/session.rs` so the app crate remains an orchestration layer.
- Desktop window default size updated to `1600x900`.
- Main app routing now waits for an active database session before rendering tracker pages.

## [0.7.0] - 2026-04-03

### Added
- **OS Keychain Integration:** API keys for AI providers are now stored securely in the native OS Keychain (e.g., macOS Keychain) instead of plaintext. Keys are batched into a single encrypted JSON vault and securely cached in memory to minimize intrusive OS password prompts. Includes an AES-256-GCM encrypted file fallback for systems without native keyring support.
- **Barcode Scanner Hardware Lifecycle:** Implemented robust webcam hardware lifecycle management ensuring the system camera is properly released (macOS green light extinguished) upon closing the scanner UI or unmounting the component.
- **API Key Management UI:** Added a comprehensive section in the `Settings` page to manage credentials with masked previews, status badges, and strict one-way syncing (frontend never retrieves plaintext keys).
- **Barcode Validation & UX Improvements:** Added a dedicated UX flow for successful barcode input formatting and a graceful "Product not found" fallback to allow users to pivot cleanly to name-based searches.

## [0.6.0] - 2026-03-22

### Added
- `FoodEntry` type definitions and `foodLogStore` persistence layer (`src/types/foodLog.ts`, `src/lib/foodLogStore.ts`) — localStorage-backed with `USE_TAURI` toggle, ready to connect to Rust CRUD commands.
- `useDailyLog` React hook (`src/hooks/useDailyLog.ts`) — manages daily entry state, add/remove/edit operations, and real-time macro totals.
- `AddEntryModal` component — meal type selection, macro inputs, and form validation.
- `FoodEntryRow` component — displays a single food entry with macro chips and delete action.
- Daily Log page (`src/pages/DailyLog.tsx`) — date navigation, grouped meal sections, daily totals bar, and empty state.
- UI component library (`src/components/ui/`) — `Button`, `Input`, `Select`, `Modal`, `StatCard`, `EmptyState` primitives for consistent styling across all pages.


## [0.5.0] - 2026-03-22

### Added
- **Security & IPC:** `Validate` trait in `nutrack-model` and new `ipc_guards`/`ipc_errors` modules to securely sanitize Tauri command inputs and database errors.
- **Database CRUD:** Full backend implementation of `Food`, `Serving`, `NutritionFacts`, `Meal`, and `MealItem` operations, completely replacing previous stubs (merged from `#66`).
- **Validation Wiring:** IPC validation securely wired into all active database create/update commands.
- Comprehensive unit and integration test suites for both validation rules and database queries.

---

## [0.4.1] - 2026-03-20

### Changed
- `map_network_error` moved from `src-tauri/src/api/network_errors.rs` to `src-tauri/src/utils/network_errors.rs` — now crate-wide utility accessible to all subsystems, not just the API layer.
- A new `utils` module (`src-tauri/src/utils/`) introduced as the home for shared, subsystem-agnostic helpers.
- CI workflow (`.github/workflows/ci.yml`) overhauled: migrated to a multi-stage pipeline and switched to the official Tauri GitHub Action.

---

## [0.4.0] - 2026-03-19

### Added
- `NetworkConfig` singleton (`network_config.rs`) — global feature-flag system with a master network switch and per-feature toggles for `openfoodfacts` and `ai` endpoints.
- `NetworkProvider` / `useNetwork` React context (`NetworkContext.tsx`) — real-time online/offline status via browser `online`/`offline`/`focus` events with no Tauri IPC overhead.
- `network_errors` module (`network_errors.rs`) — centralised `map_network_error` helper that maps `reqwest` errors to user-friendly strings (offline, timeout, bad status, decode failure).
- Offline banner in `AiAdvisor` page — displayed when `useNetwork()` reports the device is offline.
- `get_network_config` Tauri command exposed to the frontend.

### Changed
- `openfoodfacts.rs` and `api/mod.rs` updated to route through `NetworkConfig` feature flags before making HTTP requests.
- `App.tsx` wrapped with `<NetworkProvider>` so all child components can consume network status.

---

## [0.3.0] - 2026-03-19

### Added
- CRUD API signatures and full implementation of `UserProfile` CRUD logic in the database layer.
- Database initialization script integrated into the CRUD module.

---

## [0.2.0] - 2026-03-01

### Added
- CI/CD pipeline via GitHub Actions (`ci.yml`).
- Database initialization script (`init_db`).
- OpenFoodFacts food data fetcher, `.nlog` transpiler, and LLM pipeline for food recognition.
- Auto-generation of TypeScript types and Tauri commands from Rust definitions (`tauri-typegen`).
- Sprints 1.3 and 1.4 frontend and backend features.

### Fixed
- Resolved TypeScript `TS2578` warning during Tauri build.

---

## [0.1.0] - 2026-02-26

### Added
- Local SQLite file storage with database initialization (`init_db`).

---

## [0.0.2] - 2026-02-21

### Added
- Rust data model definitions for `Food`, `Meal`, and `UserProfile`.
- Modular Rust code structure with separate `model` and `database` crates.

---

## [0.0.1] - 2026-02-18

### Added
- Initial Tauri application scaffold with project moved to repository root.
- `.gitignore`, updated `README`, and `package.json` configuration.

---

## [0.0.0] - 2026-02-16

### Added
- Initial project code structure.
- First commit — project bootstrapped.
