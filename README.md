# Tauri + React + Typescript

## Recommended IDE Setup

This repository contains a Tauri desktop application with a React + TypeScript frontend (Vite).

## Prerequisites

- Node.js (LTS) and npm or yarn
- Rust toolchain (stable) with cargo
- Tauri prerequisites (platform-specific webview tooling)

## Important Commands

- Install frontend deps:

```bash
npm install
```

- Frontend dev (Vite):

```bash
npm run dev
```

- Run the app in dev mode (frontend + Tauri):

```bash
npm run tauri dev
```

- Build frontend for production:

```bash
npm run build
```

- Build Tauri app bundle (native installers):

```bash
npm run tauri build
```

- Build Rust backend only:

```bash
cd src-tauri && cargo build
```

- Run database rust tests exclusively:

```bash
cd src-rust-crates/database && cargo test
```

## Releasing a New Version

To trigger the automated GitHub Actions release build (which creates the macOS `.dmg` and Windows installers), you must bump the version number in `package.json` before pushing/merging to `main`:

The version must be in strict SemVer format (e.g. `0.1.1`), and must be strictly greater than the previous released version tag.
*(Note: `src-tauri/tauri.conf.json` is configured to automatically read the version from `package.json` so you do not need to update it).*
