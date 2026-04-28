# iOS Dev Commands

Use the 26.4.1 iPhone 17 Pro simulator. Tauri was previously picking the older 26.2 duplicate, so keep the exact device name/ID below.

## Boot the simulator

```bash
xcrun simctl boot E2E2279D-4BD4-4F01-A934-D6DFF3FB457A
open -a Simulator
```

## Run Tauri iOS dev

```bash
cd /Users/pierretran/coding/nutrition-tracker
npm run tauri ios dev "iPhone 17 Pro"
```

## If launch still misbehaves

```bash
xcrun simctl launch E2E2279D-4BD4-4F01-A934-D6DFF3FB457A com.pierretran.nutrition-tracker
```

## Verify destinations

```bash
xcodebuild -workspace src-tauri/gen/apple/nutrition-tracker.xcodeproj/project.xcworkspace -scheme nutrition-tracker_iOS -showdestinations
```

## Current known-good simulator

- iPhone 17 Pro: `E2E2279D-4BD4-4F01-A934-D6DFF3FB457A`
