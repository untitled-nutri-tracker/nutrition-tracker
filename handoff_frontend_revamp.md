# Handoff: iOS Mobile-First Frontend Revamp & Recharts Dashboard

## Context & Objectives
The goal of this project is to revamp the `nutrition-tracker` frontend from a generic, desktop-first React layout into a highly polished, high-agency, mobile-first experience optimized for iOS (running via Tauri v2). 

The target design aesthetic is **"Cockpit Dark Mode"**:
- **Theme:** Deep Zinc (`#12121A`) backgrounds, subtle lighter cards (`#1C1C22`), and high-radius (`rounded-3xl`) bento-grid layouts with 1px inner borders. No generic cards with heavy drop shadows.
- **Typography:** Premium Sans-Serif (**Geist** or **Outfit**) for standard text, paired with a Premium Monospace (**Geist Mono**) exclusively for data, numbers, and metrics to prevent horizontal layout jumping.
- **Motion:** Liquid layout transitions, magnetic buttons, and pill-navigation utilizing **Framer Motion**.
- **Charts:** High-end, glowing, interactive charts (using **Recharts**) mapping directly to our Rust backend nutrition endpoints.

### Completed Work (Phase 1 ✅)
- **Branch:** `feat/ios-mobile`
- Migrated the application to use **Tailwind CSS v4** (`@tailwindcss/vite`).
- Installed all required layout & animation dependencies: `framer-motion`, `@phosphor-icons/react`, `recharts`, `clsx`, `tailwind-merge`.
- Added `viewport-fit=cover` and disabled scaling in `index.html` to allow the UI to safely draw underneath the iOS notch / Dynamic Island.
- The `app.css` file has been primed with `@import "tailwindcss";`

---

## 🚀 Next Agent Execution: Phase 2 & 3

The next AI agent should pick up the work starting at **Phase 2**. Below is the exact step-by-step task list and implementation strategy.

### Phase 2: Layout & Navigation (Mobile-First)
1. **AppShell Revamp (`src/layout/AppShell.tsx`)**:
   - Create a floating **Pill Bottom Navigation Bar** for mobile breakpoints. 
   - Anchor it to the bottom safely using `pb-[env(safe-area-inset-bottom)]`.
   - Ensure it visually floats slightly off the bottom edge.
   - Integrate the `+` (Log Food) button directly into the right side of this navigation pill. **Note:** Tapping this button should route to the existing `/log` page (do not build a bottom sheet yet).
2. **Desktop Layout**:
   - Maintain the Left Sidebar structure for larger screens, but restyle it to match the premium dark mode aesthetic.
   - Enforce a `max-w-7xl mx-auto` container for the main content area.
3. **Global CSS**:
   - Remove legacy grid maths, custom CSS variables, and global media queries from `src/styles/app.css` and migrate their usage to standard Tailwind classes in the components.

### Phase 3: Dashboard & Recharts Implementation
You must completely swap out the existing manual SVG charts in the AI Advisor and Insights pages with `recharts` wrappers:

1. **`PremiumDonutChart` (using `<PieChart>`)**:
   - Create a reusable circular donut chart component with a glowing track.
   - **Target Data:** Daily Macronutrient Breakdown (Protein vs Carbs vs Fat) from `get_daily_nutrition_totals`.
   - **Replaces:** `GoalVsActualCard` styling.

2. **`PremiumAreaChart` (using `<AreaChart>`)**:
   - Create a glowing line chart with a gradient `fill` underneath.
   - **Target Data:** Caloric Trends over 7/30 days from `get_nutrition_trend`.
   - **Replaces:** `NutritionChartCard`

3. **`StackedProgressBar` (using `<BarChart>`)**:
   - Create horizontal, stacked progress bars.
   - **Target Data:** Goal fulfillment (calories, fat, protein, carbs vs targets).
   
4. **Bento Card Conversion**:
   - Refactor `AiAdvisor.tsx` and `Insights.tsx` to display these new charts inside "Bento" style cards (`bg-zinc-900 rounded-3xl border border-white/5 p-6`).

### Phase 4: "Design Spells" & Motion
- Wrap routing components or tabs with `framer-motion` `<AnimatePresence>` for smooth cross-fades.
- Add an entrance animation (slide up from bottom) for the Pill Navigation bar.
- *Strict Rule:* CPU-heavy perpetual animations must be isolated in their own memoized client components.

### Phase 5: Future Enhancements (Do Not Build Yet)
- **Global "Quick Log" Bottom Sheet:** Converting the `/log` route into a sliding Bottom Sheet overlay triggered by the `+` button.

### Phase 6: iOS Safe-Area + AI Advisor Interaction Polish (Active)
The following issues were observed on iOS simulator/device and should be treated as high-priority polish defects:

1. **Top notch / Dynamic Island overlap still occurs**
   - Ensure mobile content starts below `env(safe-area-inset-top)` and does not render under the notch on all pages.
   - Keep desktop behavior unchanged.

2. **Bottom nav sits slightly too high**
   - Move mobile pill nav closer to the physical bottom edge while still respecting `env(safe-area-inset-bottom)`.
   - Keep tappable area and gesture safety intact.

3. **AI Advisor keyboard/focus scroll glitch**
   - On focusing the AI chat textbox, avoid whole-page scroll jumps.
   - Prevent iOS input-focus zoom side effects (small font-size textareas can trigger this).

4. **AI Advisor composer vertical position**
   - Reduce excessive gap between chat composer and bottom nav on mobile.
   - Maintain legible spacing with the nav and safe-area insets.

## Updated Ordered Next Steps
Use this order to avoid rework and combine overlapping layout concerns:

1. **Shell-safe-area contract first**
   - Finalize and verify top and bottom safe-area CSS variables in `AppShell`.
   - Validate all primary routes (`/`, `/log`, `/insights`, `/ai`, `/settings`) in iPhone simulator.

2. **AI Advisor layout stabilization second (overlaps with Step 1)**
   - Keep outer shell from becoming the active scroll container on AI route.
   - Keep messages panel as the intentional scroll area.
   - Reposition composer and adjust bottom padding to align with nav.

3. **iOS keyboard behavior hardening third**
   - Confirm no viewport zoom on focus for chat input.
   - Confirm no layout jump when toggling keyboard open/close repeatedly.

4. **Decide /log keyboard accessory strategy (native vs accept) fourth**
   - Preferred: evaluate a native iOS override to hide accessory bar.
   - Fallback: accept platform toolbar and optimize focus flow so arrows are not disruptive.
   - Status update: fallback polish is implemented in `/log` (search/barcode Enter now triggers action + blur, iOS keyboard hints/autocorrect settings tightened, and mobile input sizing aligned to avoid zoom-triggered friction).

5. **Cross-page regression sweep fifth**
   - Re-check FoodSearch, DailyLog, Settings for top clipping and bottom-nav overlap.
   - Record any residual safe-area offsets as follow-up tasks.

6. **Only then continue remaining style-debt cleanup**
   - Resume tokenization/inline-style reduction once interaction regressions are closed.

---

## Technical Constraints & Guardrails
- **Tailwind Version:** The app uses **Tailwind v4**. Use the `@theme` directive in CSS if defining global custom colors or fonts, rather than a legacy `tailwind.config.js`.
- **Icons:** STRICTLY use `@phosphor-icons/react`. Do not use Lucide or Unsplash.
- **Data Types:** Ensure charts gracefully map to the existing frontend types in `src/generated/types.ts` (e.g. `NutritionTrendPoint`, `NutritionTotals`). Do not perform massive rewrites of the Rust backend. 
- **Emojis:** 🚫 BANNED. Use Phosphor icons exclusively.
- **Testing:** Verify the layout works by running `npm run tauri ios dev` to boot the iOS Simulator.

**END OF HANDOFF**
