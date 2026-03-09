# TermTracker

System tray app that tracks your [Claude Code](https://docs.anthropic.com/en/docs/claude-code) usage, costs, and billing cycle burn rate.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Usage dashboard** — Total tokens, sessions, messages, and estimated API cost
- **Billing cycle tracker** — Burn rate projection against your plan's output token limit, with run-out date warnings
- **Sessions browser** — Recent sessions with project names, model indicators, duration, and cost
- **Cost breakdown** — Daily spend chart, cost by model, and top projects ranked by cost
- **Throttle detection** — System notification when Claude Code gets throttled (monitors `service_tier` changes)
- **Configurable plans** — Pro, Max 5x, Max 20x, Team, Enterprise, or custom output limits
- **Cross-platform** — Windows, macOS, and Linux

## How it works

TermTracker reads Claude Code's JSONL conversation logs from `~/.claude/projects/` and computes usage statistics locally. No data leaves your machine.

## Install

```bash
git clone https://github.com/yourusername/termtracker.git
cd termtracker
npm install
```

## Run (development)

```bash
# Build and launch
npm run dev

# In a separate terminal (or use the start script):
# Windows
start.cmd

# macOS / Linux
./start.sh
```

> **Note:** If launching from VS Code's terminal, use `start.sh` or `start.cmd` — VS Code sets `ELECTRON_RUN_AS_NODE=1` which breaks Electron apps.

## Build distributable

```bash
npm run electron:build
```

## Settings

Click the gear icon to configure:

| Setting | Description |
|---------|-------------|
| **Plan** | Your Claude subscription tier (Pro, Max 5x, Max 20x, Team, Enterprise, Custom) |
| **Output limit** | Custom output token limit (only for Custom plan) |
| **Billing day** | Day of month your billing cycle resets (1-28) |

Output token limits are community-observed estimates, not official Anthropic numbers.

## Tech stack

- **Electron** — System tray app with frameless window
- **React 18** + TypeScript
- **Tailwind CSS 3** — Dark theme UI
- **Recharts** — Charts and visualizations
- **Vite** + vite-plugin-electron — Build tooling

## Project structure

```
electron/
  main.ts             # Electron main process, tray icon, window management
  preload.ts          # Context bridge (IPC)
  data-reader.ts      # JSONL parser, stats computation
  throttle-watcher.ts # Polls for throttle events, sends notifications
src/
  App.tsx             # Main React app with tab routing
  components/
    Header.tsx        # Tab bar + controls
    OverviewCard.tsx   # Token/session/cost summary
    BillingCycle.tsx   # Burn rate projection + budget bar
    TodayCard.tsx      # Today's stats
    TrendChart.tsx     # 14-day usage trend
    ModelBreakdown.tsx # Token usage by model
    SessionsTab.tsx    # Session list with details
    CostsTab.tsx       # Cost analytics
    SettingsPanel.tsx  # Plan + billing config
  lib/
    parser.ts         # Formatting utilities, pricing constants
    settings.ts       # Plan tiers, localStorage persistence
```

## License

MIT
