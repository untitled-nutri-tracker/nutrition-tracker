# NutriLog Pivot Draft: Seed Narrative + Zero-Friction Logging Spec

Date: 2026-04-18
Audience: Founders, PM, Engineering, Design, GTM, Seed Investors

## Executive Position

NutriLog must stop behaving like a developer tool and start behaving like a daily consumer habit product.

The winning position is not "local-first" as a technical claim. The winning position is:

- Fastest daily nutrition logging in the market
- Private AI coach users can trust with sensitive health data
- Personalization that compounds with every correction

If logging does not become near-effortless, privacy messaging alone will not carry retention.

## Part 1: Investor-Ready Seed Narrative

## 1) The Story in One Sentence

NutriLog is building the private AI operating system for daily nutrition habits, starting with the highest-friction problem in consumer health: meal logging.

## 2) The Market Problem

Current leaders have two structural weaknesses:

1. Logging friction remains too high, so users churn once motivation drops.
2. Personalization is shallow, so recommendations do not meaningfully improve adherence.
3. Trust is weak, because users are asked to trade intimate health data for opaque AI outputs.

## 3) Why Now

1. AI UX has reached the point where multimodal capture (photo, voice, text, barcode) can be near-instant.
2. Consumers are more privacy-aware and increasingly skeptical of data resale models.
3. Incumbents are large but slow to rebuild architecture around user-owned and explainable personalization.

## 4) Wedge Market

Primary wedge (first 12 months):

- Data-driven fitness optimizers (22-40)
- They already track, already pay for performance tools, and hate logging overhead
- They are vocal in communities and can drive referral growth

Secondary segment (post-wedge):

- Privacy-sensitive professionals focused on sustainable body recomposition

## 5) Product Wedge

Core product promise:

- Capture meal in seconds
- Confirm in one tap
- Improve automatically from user corrections

Core experience principles:

1. One dominant action per screen.
2. Ask only one clarifying question when confidence is low.
3. Learn silently from corrections and reduce future edits.
4. Make privacy controls visible but not burdensome.

## 6) Business Model (Recommended)

Pricing architecture:

1. Free tier
- Manual log, barcode, basic trends, local-only mode
- Limited AI assists per week

2. Pro subscription
- Unlimited AI logging and adaptive macro coaching
- Advanced insights and wearable integrations
- Priority model quality and faster response budget

3. Optional power-user setting
- Bring-your-own-model-key hidden under advanced settings
- Not part of default onboarding or core user journey

Illustrative pricing to test:

- Pro monthly: 14.99
- Pro annual: 119.99

## 7) Unit Economics Guardrails

Non-negotiable thresholds:

1. AI inference COGS per paid user below 30 percent of subscription revenue.
2. Gross margin above 70 percent by end of Q2.
3. Paid conversion must outpace model-cost growth.

Cost control levers:

- Model routing by task complexity
- Aggressive caching of repeated foods and user-specific meals
- Fallback to smaller models for extraction and only escalate when confidence is low

## 8) 2-Quarter Operating Targets (Draft)

Assume current stage: pre-scale, early product, no strong retention proof yet.

### Quarter 1 Targets (0-90 days)

- New installs: 15,000
- Activation rate (first confirmed log within 2 minutes): 50 percent
- Week-1 retention: 35 percent
- D30 retention (activated users): 18 percent
- Weekly active users: 3,000
- Average confirmed logs per active user per week: 4.0
- AI-assisted log acceptance rate: 70 percent
- Paid conversion from activated users: 8 percent
- End-of-quarter paid subscribers: 900
- End-of-quarter monthly recurring revenue: 12,000
- Gross margin on paid cohort: 65 percent

### Quarter 2 Targets (91-180 days)

- New installs: 30,000
- Activation rate: 60 percent
- Week-1 retention: 42 percent
- D30 retention (activated users): 25 percent
- Weekly active users: 8,000
- Average confirmed logs per active user per week: 5.0
- AI-assisted log acceptance rate: 78 percent
- Paid conversion from activated users: 11 percent
- End-of-quarter paid subscribers: 2,800
- End-of-quarter monthly recurring revenue: 40,000
- Gross margin on paid cohort: 72 percent

## 9) Seed Round Readiness Criteria

For a strong Seed narrative in this category, you need evidence of compounding behavior, not just top-funnel downloads.

Minimum credible fundraise package:

1. Three consecutive months of 10+ percent monthly growth in active users.
2. D30 retention at or above 25 percent in wedge cohort.
3. Clear free-to-paid conversion with stable payback assumptions.
4. Downward trend in AI COGS per retained paid user.
5. Proof that correction memory increases user stickiness over time.

Suggested raise narrative:

- Raise to scale distribution and deepen personalization moat
- Capital primarily into growth loops, food intelligence quality, and model cost optimization

## 10) What Investors Will Challenge You On

Expect hard questions on:

1. Why incumbents cannot replicate this quickly.
2. Whether privacy actually drives retention or only acquisition.
3. Whether AI unit economics remain healthy at 10x usage.
4. How you avoid becoming a commodity logging utility.

Your answer must be evidence-based:

- Faster logging speed versus incumbents
- Better retention in data-driven cohorts
- Higher personalization lift from correction memory

## 11) Brutal Kill Criteria

If these are not met after two major iterations, change strategy immediately:

1. D30 retention stays below 15 percent.
2. Confirmed logs per active week do not improve by cohort.
3. Paid conversion remains below 5 percent despite improved activation.
4. AI COGS per paid user cannot be controlled under target margin.

## Part 2: Product Spec - Zero-Friction Logging Loop

## 1) Objective

Reduce meal logging effort to under 10 seconds for common meals while maintaining macro trust and auditability.

Primary north-star metric:

- Confirmed logs per active user per week

Supporting metrics:

- Time to first confirmed log
- AI suggestion acceptance rate
- Edits per confirmed log
- Repeat-meal auto-match rate

## 2) User Scope (V1)

In scope:

- Solo consumer users
- iOS, Android, desktop parity via shared logic where possible
- Input methods: photo, voice, barcode, text

Out of scope:

- Coach dashboard
- Household shared accounts
- Medical-grade clinical recommendations

## 3) UX Principles

1. One-tap confirmation is the default path.
2. Clarification prompts are surgical and singular.
3. Every correction improves future suggestions.
4. Offline behavior is graceful and transparent.
5. Privacy controls are discoverable from logging context.

## 4) End-to-End User Flow

### Step A: Capture

User can start from a single prominent action: Log meal.

Input options in one sheet:

- Snap photo
- Speak meal
- Scan barcode
- Type natural language

### Step B: AI Parse and Candidate Generation

System creates a meal candidate with:

- Food items
- Estimated portions
- Estimated macros and calories
- Confidence score per item and overall meal

Latency target:

- P95 under 2.5 seconds for first candidate

### Step C: Confidence-Gated Interaction

High confidence (0.85+):

- Show candidate and confirm button
- No clarifying question

Medium confidence (0.60 to 0.84):

- Ask exactly one disambiguation question
- Example: "Was this one or two tablespoons of olive oil?"

Low confidence (below 0.60):

- Show top three likely interpretations
- Offer quick fallback to manual edit

### Step D: Confirmation and Learn

After confirm:

- Persist meal and nutrition
- Save correction deltas to user preference memory
- Update future ranking for similar meals

### Step E: Lightweight Feedback

Optional subtle post-confirm feedback:

- "Saved. I will remember this portion next time."

No modal interruptions.

## 5) Functional Requirements

FR1 Unified logging entry point

- All four input modes accessible from one primary log action.

FR2 Candidate card

- Must show meal name, items, portions, calories, protein, carbs, fat.
- Must support quick inline edits before confirm.

FR3 Clarification engine

- Must enforce max one follow-up question before confirm path.
- Must skip questions on high-confidence candidates.

FR4 Learning memory

- Corrections must persist as user-specific preferences.
- Similar future meals should apply learned defaults.

FR5 Offline-first behavior

- If network unavailable, allow draft capture and queue enrichment.
- User can still confirm with local estimate and reconcile later.

FR6 Explainability

- Every AI-generated estimate should expose brief rationale on demand.

FR7 Privacy controls

- Per-feature toggles for cloud assist versus local mode.
- Clear data deletion and export actions.

## 6) Non-Functional Requirements

1. Reliability: crash-free sessions above 99.5 percent.
2. Performance: capture-to-candidate P95 under 2.5 seconds online, under 4.0 seconds offline fallback.
3. Consistency: macro totals must remain internally consistent after edits.
4. Security: sensitive data encrypted at rest and in transit when synced.

## 7) Telemetry and Event Schema

Core events:

1. log_flow_started
2. input_mode_selected
3. candidate_generated
4. candidate_confidence_bucket
5. clarification_prompt_shown
6. candidate_edited
7. log_confirmed
8. log_abandoned
9. memory_correction_saved
10. repeat_meal_auto_applied

Required dimensions:

- Input mode
- Confidence bucket
- Time-to-confirm
- New user versus retained user
- Local-only mode versus cloud-assist mode

## 8) Experiment Plan (First 8 Weeks)

Experiment 1: Clarification policy

- Variant A: one question max
- Variant B: two question max
- Success: higher confirmations with no retention drop

Experiment 2: Candidate UI density

- Variant A: compact card
- Variant B: expanded item details by default
- Success: lower abandonment and lower edit burden

Experiment 3: Confirmation CTA wording

- Variant A: Confirm meal
- Variant B: Save and learn
- Success: faster confirms and better trust sentiment

## 9) Release Plan

### Milestone 1 (Weeks 1-3): Foundation

- Unified log entry sheet
- Instrumentation baseline
- Candidate card with one-tap confirm

### Milestone 2 (Weeks 4-6): Intelligence

- Confidence buckets and one-question clarification
- Correction capture and memory persistence

### Milestone 3 (Weeks 7-8): Optimization

- Offline queue behavior
- Explainability drawer
- Privacy toggle visibility tuning

## 10) Engineering Mapping for Current Codebase

Likely touchpoints in this repository:

- src/pages/DailyLog.tsx
- src/pages/FoodSearch.tsx
- src/components/ConfirmLogCard.tsx
- src/components/FoodPhotoScanner.tsx
- src/components/BarcodeScanner.tsx
- src/components/AddEntryModal.tsx
- src/hooks/useDailyLog.ts
- src/pages/AiAdvisor.tsx
- src/lib/foodLogStore.ts
- src-tauri/src/api/ai.rs
- src-rust-crates/database/src/food.rs
- src-rust-crates/database/src/ai.rs

## 11) Weekly Operating Cadence

Every week, leadership reviews:

1. Activation funnel by input mode.
2. Confirmation rate by confidence bucket.
3. Cohort retention changes after each logging-flow release.
4. AI COGS per paid retained user.
5. Top five reasons for abandoned logs.

If metrics regress for two consecutive weeks, rollback and simplify.

## 12) Immediate Next Actions (Next 14 Days)

1. Finalize wedge persona and update all copy and onboarding language.
2. Build and instrument unified log entry point.
3. Implement confidence-gated one-question policy.
4. Launch first pricing paywall test on activated cohorts only.
5. Stand up weekly retention and unit-economics review with hard go-no-go decisions.

---

This draft is intentionally aggressive. The core bet is simple: if NutriLog can make logging materially faster while proving private, compounding personalization, you earn both user trust and investor attention. If not, you risk being a technically elegant niche tool with limited venture outcomes.
