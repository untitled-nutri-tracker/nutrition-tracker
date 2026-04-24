# UI/UX Polish Implementation Plan

This plan captures the UI/UX critique and establishes exactly how we will level up the app's perceived performance, aesthetic consistency, and ease of use in preparation for the MVP.

## 1. Addressing the Tailwind Question

> **Recommendation:** **Do NOT switch to Tailwind right before the MVP.**

While Tailwind is excellent for standardizing a design system from scratch, I strongly recommend avoiding the migration right now for the following reasons:
1.  **Migration Cost:** You have over 1,000 lines of highly specific, polished CSS in `ai-advisor.css` alone. Ripping all of that out right now is an enormous and risky time commitment.
2.  **Complex Gradients:** Tailwind struggles with multi-stop radial gradients and glassmorphic overlays. Converting your custom widgets into arbitrary utility values (e.g. `bg-[radial-gradient(circle_at_10%_12%,_rgba(68,81,124,0.20),_transparent_42%)]`) will result in unreadable React components.

**The Alternative Approach (CSS Variables):** We will implement a strict vanilla CSS custom properties (variables) framework in `app.css`. This achieves the same goal as Tailwind (standardizing colors, elevations, and enabling dark mode) without touching the React HTML markup at all.

---

## Proposed Changes

### Phase 1: CSS Architecture, Theme Tokens & Seamless Dark Mode
We will introduce a global `theme.css` framework mapped to CSS variables to replace all hardcoded `rgba()` values. This allows us to map distinct colors for `light` and `dark` themes effortlessly.

- **[NEW] `src/styles/theme.css`**: Define `--bg-base`, `--surface-glass`, `--border-dim`, `--accent-primary`, etc. Define root for default variables and `[data-theme="dark"]` / `[data-theme="light"]` for explicit overrides.
- **[NEW] `src/lib/ThemeProvider.tsx` & `useTheme()`**: Build a context provider that reads from `localStorage` (falling back to the OS `prefers-color-scheme` rule) and attaches the `data-theme` attribute to the `document.documentElement` smoothly to prevent flickering. 
- **[MODIFY] `src/pages/Settings.tsx`**: Add a polished Segmented Control or Toggle switch allowing users to explicitly force "Light", "Dark", or "System" mode.
- **[MODIFY] `src/styles/ai-advisor.css` & `src/styles/app.css`**: Search and replace the hardcoded RGBA gradients with the new `var(--surface-glass)` style variables. 

### Phase 2: Typography & Scale Adjustments
We need to remove the "Developer Dashboard" density and make the app more legible and inviting.

- **[MODIFY] `index.html`**: Import a modern variable font (like Google Fonts' `Inter` or `Outfit`) and set it as the default `font-family`.
- **[MODIFY] `src/styles/app.css`**: Bump base `font-size` on the `body` from ~12px to `14px/15px`.
- **[MODIFY] Component CSS**: Widen paddings inside pills/chips (`.ai-advisor-chip`) so tap targets are larger for mobile/desktop users.

### Phase 3: Optimistic UI Architecture
We will speed up the perceived performance of the app by instantly giving visual feedback instead of freezing the UI during backend requests.

- **[MODIFY] `src/components/ConfirmLogCard.tsx`**: 
  - Instead of blocking the UI on `tauriInvoke`, push the state to "Approved" immediately.
  - Implement a `useTransition` or simple state toggle coupled with a CSS animation that gracefully dismisses the `ConfirmLogCard` once clicked, sliding it away organically.
- **[MODIFY] `src/hooks/useDailyLog.ts`**: Update the local state instantly with the new macro tally *before* the DB acknowledges the save. If it fails, catch and display a small, elegant toast to undo it.

### Phase 4: Wait States & Skeleton Loaders (Solves #46)
We need to remove classic spinning loaders which cause "wait anxiety" and replace them with sleek UI shimmers.

- **[NEW] `src/components/ui/SkeletonCard.tsx`**: Build a shimmering glassmorphic shape that matches the exact dimensions of the AI generated candidate card.
- **[MODIFY] `src/pages/AiAdvisor.tsx`**: Instead of showing `Spinning...` while the LLM generates the JSON candidate, render the `SkeletonCard`.
- **[MODIFY] App-wide**: Apply CSS keyframe animations `shimmer` linearly across a subtle gradient to trick the eye into thinking data is already rendering.

---

## User Review Required

> [!WARNING]
> Please confirm you agree with this finalized plan. If approved, my first step will be setting up `ThemeProvider.tsx` and the Settings toggle, followed by auditing the CSS stylesheets to extract token variables.

## Verification Plan

### Automated Tests
* Run `npm run build` to ensure no Typescript errors exist. 
* Run `cargo test` to verify no Tauri IPC layers were functionally broken during optimistic UI patching.

### Manual Verification
* Go to the Settings page and toggle between Light, Dark, and System modes. Verify colors transition instantly.
* Start the local Vite server and generate a standard food log entry. Verify that the card instantly enters the "Success" state.
