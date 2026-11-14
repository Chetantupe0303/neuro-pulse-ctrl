# PulseCtrl & PulseCtrl AI

> **"Other AI agents ask you to trust them. PulseCtrl AI checks."**

PulseCtrl turns your smartphone into a secure, wireless, voice-controlled remote for your laptop over local Wi-Fi. Powered by Google Gemini and protected by an independent **AI Guardian**, spoken and typed commands are translated into precise desktop actions that are inspected and verified for safety before running.

---

## Architecture Overview

```
 ┌───────────────────────────┐                  ┌────────────────────────────────────────┐
 │   Phone Client (Mobile)   │                  │        Laptop Console (Desktop)        │
 │  - Web Speech API + Mic   │                  │  - Operations Console (3 Columns)      │
 │  - Pulse Trace (6 States) │                  │  - QR Code & Session Manager           │
 │  - Trackpad / Keyboard /  │                  │  - Monospace Activity Audit Log        │
 │    Both / AI Tabs         │                  │  - AI Guardian Real-Time Inspection    │
 │  - Instant "Stop" Abort   │                  │  - 30s Auto-Deny Confirmation Modal    │
 └─────────────┬─────────────┘                  └───────────────────┬────────────────────┘
               │                                                    │
               │ HTTPS / WSS (Local LAN)                            │ WSS (Loopback)
               ▼                                                    ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────┐
 │                            PulseCtrl Server (/server)                                 │
 │  - Local HTTPS Server (selfsigned TLS with SANs)                                      │
 │  - Per-Session Sliding Window Rate Limiter (10 req/min)                               │
 │  - Rule-Based Blocklist (Terminal, Deletion, Passwords, Payment, Dangerous Hotkeys)   │
 │  - Command Planner (Gemini 2.5 Flash SDK, OS-aware shortcuts, max 15 steps)           │
 │  - AI Guardian Engine (3-tier safety rating: Safe / Needs approval / Blocked)         │
 │  - Fail-Closed Architecture (offline / error defaults to 'confirm' at minimum)        │
 │  - Plan Runner (step-by-step execution, live progress, instant stop)                  │
 │  - Audit Logger & Session Summarizer (plain-language executive reports)               │
 └──────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Local IPC / Loopback WSS
                                            ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────┐
 │                            PulseCtrl Helper (/helper)                                 │
 │  - Native Input Simulation (@nut-tree/nut-js)                                         │
 │  - Hardcoded App Launch Allowlist (chrome, edge, notepad, calculator, explorer/finder) │
 │  - Screen Capture Engine (Opt-in multimodal screen vision targeting)                  │
 │  - Per-Step Acknowledgment Protocol                                                   │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Design System

PulseCtrl strictly implements a calm, precise, operations-grade design system:
- **Color**: Neutrals + exactly **ONE** accent hue (`#2F4BFF`). Zero gradients. Zero glow. Zero blur or glassmorphism. Zero box-shadows (1px borders only).
- **Themes**: Light theme default, with matching dark theme via `prefers-color-scheme`.
- **Status Badges Without Color**:
  - `Safe` = Outlined check icon + "Safe"
  - `Needs approval` = Half-filled circle icon + "Needs approval"
  - `Blocked` = Solid filled badge with cross + "Blocked"
  - Destructive actions (`Disconnect`, `Stop`, `Deny`) use solid dark/inverted buttons with clear text.
- **The Signature "Pulse Trace"**:
  - `idle`: Flat line with tiny slow blip (*Idle — Tap mic or type command*)
  - `listening`: Dynamic waveform modulated by live microphone volume (*Listening...*)
  - `thinking`: Traveling segment along the line (*Thinking...*)
  - `executing`: Steady rhythmic pulse, one beat per step (*Executing...*)
  - `blocked`: Line visibly cut with a gap (*Blocked*)
  - `done`: Line ends in a check mark (*Done*)

---

## Quick Start

### Prerequisites
- Node.js 18 or newer
- Laptop and phone connected to the same local Wi-Fi network
- (Optional for AI features) Gemini API Key

### 1. Setup Configuration
```bash
# Clone and install dependencies
npm install

# Copy environment variables
cp .env.example .env
```
In your `.env` file, optionally provide your Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
ENABLE_HTTPS=true
PORT=3000
```
*(Note: If no API key is provided, manual Trackpad, Keyboard, and Both modes continue working completely normally, and local deterministic fallbacks protect the AI tab).*

### 2. Start PulseCtrl
You can launch both server and helper concurrently:
```bash
npm run dev
```
Or in separate terminals:
- **Terminal 1**: `npm run server`
- **Terminal 2**: `npm run helper`

---

## Local HTTPS & Mobile Voice Permission

Mobile browsers (Safari on iOS and Chrome on Android) require an **HTTPS (Secure Context)** connection to grant access to the microphone and Web Speech API.

PulseCtrl automatically generates a local self-signed TLS certificate with Subject Alternative Names (SAN) for `localhost`, `127.0.0.1`, and your active LAN IP address on the first run, saved in `certs/`.

### One-Time "Trust This Certificate" Step on Phone
When scanning the QR code for the first time on your phone:
- **iOS (Safari)**: You will see "This Connection Is Not Private". Tap **Show Details** at the bottom, then tap **visit this website**, and confirm **Visit Website**.
- **Android (Chrome)**: You will see "Your connection is not private". Tap **Advanced**, then tap **Proceed to <your-ip> (unsafe)**.

Once accepted, the phone browser saves the certificate exception and allows microphone permissions for voice input.

---

## AI Safety Architecture

1. **Owner Sovereignty Always Overrides**:
   - The laptop owner's `Allow` / `Deny` / `Disconnect` buttons always override any AI action.
   - No command can ever run before the phone is approved by the owner.
2. **Rule-Based Pre-Gemini Blocklist**:
   - A hardcoded safety layer intercepts dangerous commands before contacting Gemini and before executing each step.
   - Prohibits terminal/shell (`cmd`, `powershell`, `bash`, `zsh`), destructive deletions (`rm -rf`, `format`, `del`), credential harvesting (`passwords`, `sudo`), banking/credit card patterns, and dangerous hotkeys (`Win+R`, `Ctrl+Alt+Del`).
3. **AI Guardian (Second-Opinion Safety Verification)**:
   - Evaluates the plan and classifies every step as `Safe`, `Needs approval`, or `Blocked`.
   - **Fail-Closed Guarantee**: Any API error, timeout, or missing key defaults steps to `confirm` (Needs approval) at minimum. Unverified steps never auto-run.
4. **Owner Confirmation & 30s Auto-Deny Countdown**:
   - Any step classified as `confirm` pauses execution and displays an approval modal on the laptop console with step details and a 30-second countdown.
   - If the owner clicks **Deny** or the timer expires, the plan aborts immediately.
5. **Instant Stop Button**:
   - A prominent Stop button on phone and laptop halts execution in under 50ms.
6. **Immutable Plans**:
   - Plans are deep-frozen after validation. Steps cannot be mutated before or during execution.
7. **Monospace Activity Audit Log & Session Summarizer**:
   - Complete chronological timeline of every action, timestamp, safety classification, and owner decision.
   - On demand (or session end), Gemini generates a plain-language executive summary of what was accomplished and what was blocked.
8. **Opt-In Screen Vision**:
   - Disabled by default. Enabled only when the laptop owner toggles "Allow AI to see my screen".
   - Captures on-demand screenshots to localize UI targets with bounding boxes, mapped to screen coordinates with DPI scaling.

---

## Permissions (macOS)
- **Accessibility**: Required by the helper to send mouse and keyboard inputs (System Settings → Privacy & Security → Accessibility).
- **Screen Recording**: Required only if opting in to "Allow AI to see my screen" (System Settings → Privacy & Security → Screen Recording).

---

## Interactive Demo Script

1. **Open PulseCtrl**: Run `npm run dev`. The laptop Operations Console opens in your browser showing the QR card and status.
2. **Scan & Approve**: Scan the QR code with your phone. The laptop console displays *"Allow this device?"*. Tap **Allow**.
3. **Try Manual Remote**: Test Trackpad, Keyboard, and Both modes. Feel the haptic vibrations on taps and clicks.
4. **Open AI Tab**: Tap the **AI** tab on the phone. Observe the Pulse Trace in its `idle` state.
5. **Voice / Example Command**:
   - Tap **Tap to Speak** or click one of the preset demo pills:
     `🔢 42 * 8 in Calculator`
   - The Pulse Trace transitions through `listening` → `thinking` → `executing`.
6. **Watch Operations Console**:
   - The laptop Activity Timeline streams the actions with timestamps and `Safe` status badges.
   - The Calculator application opens, pauses for focus, types `42 * 8`, and evaluates the result.
7. **Test the AI Guardian**:
   - Try a command requiring confirmation (e.g. closing an active window or typing sensitive text).
   - Observe the 30-second countdown approval modal on the laptop.
   - Try a blocked command (e.g. *"Open cmd and delete files"*). Notice the Pulse Trace visibly cut with a gap in the `blocked` state.
8. **Generate Session Summary**:
   - Click the **Summarize** button on the laptop console header.
   - Review the executive breakdown of safe, confirmed, and blocked operations.

---

## Verification Test Suites

Every stage includes automated verification test suites:
```bash
# Run all stage tests end-to-end
node test/all-stages-test.js

# Or test individual stages
npm run test:stage1
npm run test:stage2
npm run test:stage3
npm run test:stage4
npm run test:stage5
node test/stage6-test.js
node test/stage7-test.js
node test/stage8-test.js
node test/stage9-test.js
node test/stage10-test.js
node test/stage11-test.js
node test/stage12-test.js
node test/stage13-test.js
node test/stage14-test.js
```

---

## License
MIT
