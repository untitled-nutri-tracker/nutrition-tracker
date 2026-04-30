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

---

## 🚀 Sideloading to a Physical Device (MVP Demo Prep)

To install the app on a developer's physical iPhone so it runs **untethered** (without being connected to the Mac or the local Vite dev server), follow these steps:

### 1. Launch Xcode via Tauri
You **cannot** launch Xcode directly from Finder to build the app. Tauri v2 requires a local WebSocket server to be running in your terminal to pass build configurations to Xcode.

Plug in the iPhone via USB and run:
```bash
npm run tauri ios build -- --open
# OR
npm run tauri ios dev -- --open
```
*The `--open` flag ensures the Tauri CLI starts the required background servers and then automatically opens the project in Xcode.*

### 2. Configure for Release (Untethered)
To ensure the HTML/JS/CSS frontend is bundled directly into the iOS app (so it works off-network):
1. In Xcode's top menu, go to **Product > Scheme > Edit Scheme**.
2. Change the "Build Configuration" from *Debug* to **Release**.
3. Select the connected iPhone as the run destination at the top.

### 3. Sign the App
1. Click the `nutrition-tracker` project root in the left navigator.
2. Go to the **Signing & Capabilities** tab.
3. Check "Automatically manage signing" and select your personal Apple ID team.

### 4. Common Build Errors & Fixes

**Error:** `Command PhaseScriptExecution failed with a nonzero exit code`
*Why it happens:* Xcode's GUI drops your terminal's `$PATH` (like Homebrew or NVM) when running shell scripts. It fails because it cannot find `npm`, `node`, or `cargo`.

**Fix Option A (Symlinks - Recommended for your Mac):**
Create symlinks in `/usr/local/bin` (which Xcode *does* read by default) pointing to your Homebrew installations:
```bash
sudo ln -s /opt/homebrew/bin/node /usr/local/bin/node
sudo ln -s /opt/homebrew/bin/npm /usr/local/bin/npm
```

**Fix Option B (Project Patch - Used currently):**
1. In Xcode, go to the project settings -> **Build Phases** -> **Build Rust Code**.
2. Prepend the export path to the script so it can locate Homebrew and Cargo:
```bash
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin"
npm run -- tauri ios xcode-script ...
```

### 5. Build and Run
Hit the **Play (Run)** button in Xcode. Once it says "Build Succeeded" and opens on the phone, you can unplug the USB cable. 

> **Important:** Apps sideloaded with a *Free* Apple Developer account expire exactly **7 days** after installation. Be sure to do this install right before the demo day!
