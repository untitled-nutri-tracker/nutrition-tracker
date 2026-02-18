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
