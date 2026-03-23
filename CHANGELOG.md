# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.0] - 2026-03-22

### Added
- `Validate` trait in `nutrack-model` — IPC input validation for all model structs (`UserProfile`, `Food`, `Serving`, `NutritionFacts`, `Meal`, `MealItem`).
- `ipc_guards` utility module (`src-tauri/src/utils/ipc_guards.rs`) — reusable guard functions for validating primitive IPC arguments (strings, numerics, barcodes).
- `ipc_errors` utility module (`src-tauri/src/utils/ipc_errors.rs`) — sanitises raw database errors before they cross the IPC boundary.
- Validation wired into all create/update database commands with inline documentation.
- Unit tests

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