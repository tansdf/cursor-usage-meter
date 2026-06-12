# Cursor Usage Meter

A lightweight Cursor / VS Code extension that shows your plan usage in the status bar — with a Settings-style breakdown on hover.

## Features

- **Always visible** — speedometer icon + Total % in the bottom-right status bar
- **Hover breakdown** — miniature of Cursor Settings → Usage: Total, Auto + Composer, API, On-Demand, and billing dates
- **Team & enterprise** — dollar-based team plans and request-based billing via Cursor's REST usage API
- **Progress bars** — `▓` glyphs with full blue fill (`#3b82f6`) and muted blue track (`#2c508a`; VS Code tooltips strip `rgba`/`opacity`)
- **Click to refresh** — status bar click fetches the latest usage
- **Threshold highlights** — warning (≥80%) and critical (≥95%) background colors
- **Auto-refresh** — polls every 5 minutes by default

## Requirements

- [Cursor](https://cursor.com) (or VS Code 1.85+)
- Signed in to Cursor with an active subscription

## Installation

### From VSIX (local)

```bash
cursor --install-extension cursor-usage-meter-0.2.4.vsix
```

Then reload the window: **Developer: Reload Window**.

### From source

```bash
git clone <your-repo-url>
cd cursor-usage-meter
npm install
npm run compile
```

Press **F5** to launch the Extension Development Host, or run `npm run package` to build a `.vsix`.

## Usage

| Interaction | Action |
|---|---|
| **Status bar** | Shows `18%` (Total usage) |
| **Hover** | Full usage breakdown with progress bars |
| **Click** | Refresh usage data |

### Commands

| Command | Description |
|---|---|
| `Cursor Usage Meter: Refresh` | Fetch latest usage |
| `Cursor Usage Meter: Open Usage Dashboard` | Open [cursor.com/dashboard/usage](https://cursor.com/dashboard/usage) |
| `Cursor Usage Meter: Set Access Token` | Manual token fallback (Secret Storage) |

## Settings

| Setting | Default | Description |
|---|---|---|
| `cursorUsageMeter.pollIntervalSeconds` | `300` | Refresh interval (min 60s) |
| `cursorUsageMeter.warningPercent` | `80` | Warning background threshold |
| `cursorUsageMeter.criticalPercent` | `95` | Critical background threshold |
| `cursorUsageMeter.showDecimals` | `false` | Show `16.8%` instead of `17%` |
| `cursorUsageMeter.barSegments` | `34` | Characters per progress bar |
| `cursorUsageMeter.barFillGlyph` | `▓` | Bar character (fill + track) |
| `cursorUsageMeter.useSubscript` | `true` | Render bars slightly smaller |
| `cursorUsageMeter.stateDbPath` | `""` | Optional path to a trimmed `state.vscdb` |

## How it works

The extension reads your Cursor access token from the local `state.vscdb` database (same source Cursor itself uses), then calls the undocumented `GetCurrentPeriodUsage` and `GetPlanInfo` endpoints on `api2.cursor.sh`. Tokens are kept in memory only and are never logged or written to disk.

If auto-detection fails, use **Set Access Token** to store a token in VS Code Secret Storage.

## Corporate / team machines

Corporate accounts use the same Cursor login, but token storage can differ:

1. **Sign in to Cursor** on the corporate PC (same account you use in the browser).
2. Run **Cursor Usage Meter: Diagnose Auth** to see whether SQLite, keychain/CLI, or secret storage has a token.
3. If auth still fails, use **Set Access Token** once on that machine.

### Getting a token for Set Access Token

On your personal PC (where usage already works), from this repo:

```powershell
node scripts/extract-token.mjs
```

Copy the printed JWT, then on the corporate PC run **Set Access Token** and paste it.

Or manually: open `%APPDATA%\Cursor\User\globalStorage\state.vscdb` in [DB Browser for SQLite](https://sqlitebrowser.org/), table `ItemTable`, key `cursorAuth/accessToken`.

### Large `state.vscdb` workaround

Some corporate machines accumulate a multi-GB `state.vscdb`, which can prevent the extension from reading auth. Fix:

1. Copy `state.vscdb` to a safe location.
2. In DB Browser, keep only the `ItemTable` table (delete `cursorDiskKV` if present).
3. Set `cursorUsageMeter.stateDbPath` to that trimmed copy.

### Remote SSH / WSL

If Diagnose Auth shows `Extension host: remote (wsl)`, the extension is running inside WSL instead of on Windows.

Add this to your Cursor **User settings.json** to force it to run locally (recommended on Windows + WSL workspaces):

```json
"remote.extensionKind": {
  "local.cursor-usage-meter": ["ui"]
}
```

Reload Cursor after changing settings. If usage still fails with a token present, check the `API:` line in **Diagnose Auth** — enterprise accounts may need corporate network access to `api2.cursor.sh` and `cursor.com`.

## Troubleshooting

**Status bar item missing**

- Ensure the extension is enabled
- Right-click the status bar → check **Cursor Usage Meter**
- Run **Developer: Reload Window**

**Shows `!` or auth error**

- Sign in to Cursor, or run **Set Access Token**
- Click the status bar to retry

**Still seeing old bar characters**

- Remove `cursorUsageMeter.barTrackGlyph` from `settings.json` if present (no longer used)
- Set `barFillGlyph` → `▓` or remove it to use the default

**Hidden by status bar overflow**

- The item sits at the far right; hide other status bar items if needed

## Development

```bash
npm run compile    # build
npm run watch      # watch mode
npm run test       # unit tests
npm run test:api   # live API smoke test (requires Cursor sign-in)
npm run package    # create .vsix
```

## Disclaimer

This extension uses Cursor's undocumented internal API. It may break without notice when Cursor updates. Not affiliated with or endorsed by Cursor.

## License

MIT
