# Cursor Usage Meter

See your Cursor plan usage at a glance — right in the editor status bar. Hover for a breakdown similar to **Cursor Settings → Usage**, without leaving your workflow.

Works with individual, team, and enterprise Cursor accounts on Windows, macOS, and Linux.

## Features

- **Status bar indicator** — pulse icon and total usage (percent, requests, or dollars depending on plan)
- **Hover tooltip** — Total, Auto + Composer, API, On-Demand, and billing period dates
- **One-click refresh** — click the status bar item to fetch the latest data
- **Auto-refresh** — updates every 5 minutes by default (configurable)
- **Usage alerts** — status bar background highlights at warning (80%) and critical (95%) thresholds
- **Plan-aware** — supports percent-based plans, request-based billing, and team dollar limits

## Requirements

- [Cursor](https://cursor.com) or [VS Code](https://code.visualstudio.com/) 1.85+
- An active Cursor subscription and a signed-in Cursor session on the machine where the extension runs

## Installation

### Option 1: GitHub Release (recommended)

1. Open [Releases](https://github.com/tansdf/cursor-usage-meter/releases) and download the latest `cursor-usage-meter-X.Y.Z.vsix`.
2. Install from a terminal:

   **Cursor**

   ```bash
   cursor --install-extension cursor-usage-meter-X.Y.Z.vsix
   ```

   **VS Code**

   ```bash
   code --install-extension cursor-usage-meter-X.Y.Z.vsix
   ```

3. Reload the window: **Developer: Reload Window**.

Releases are published automatically when a new version is tagged on the `master` branch.

### Option 2: Build from source

```bash
git clone https://github.com/tansdf/cursor-usage-meter.git
cd cursor-usage-meter
npm install
npm run package
cursor --install-extension cursor-usage-meter-*.vsix
```

For local development, press **F5** in VS Code/Cursor to launch an Extension Development Host.

## Usage

| Action | Result |
|---|---|
| Glance at the status bar | Current total usage (e.g. `18%`, `42/500`, or `$12`) |
| Hover the status bar item | Full usage breakdown with progress bars |
| Click the status bar item | Refresh usage immediately |

### Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---|---|
| **Cursor Usage Meter: Refresh** | Fetch the latest usage data |
| **Cursor Usage Meter: Open Usage Dashboard** | Open [cursor.com/dashboard/usage](https://cursor.com/dashboard/usage) |
| **Cursor Usage Meter: Set Access Token** | Store an access token in VS Code Secret Storage |
| **Cursor Usage Meter: Diagnose Auth** | Show where the extension looks for credentials and whether the API is reachable |

## Settings

| Setting | Default | Description |
|---|---|---|
| `cursorUsageMeter.pollIntervalSeconds` | `300` | How often to refresh (seconds; minimum `60`) |
| `cursorUsageMeter.warningPercent` | `80` | Status bar warning background threshold |
| `cursorUsageMeter.criticalPercent` | `95` | Status bar critical background threshold |
| `cursorUsageMeter.showDecimals` | `false` | Show `16.8%` instead of rounding to `17%` |
| `cursorUsageMeter.barSegments` | `34` | Width of each progress bar in characters |
| `cursorUsageMeter.barFillGlyph` | `▓` | Character used for progress bar fill and track |
| `cursorUsageMeter.useSubscript` | `true` | Render bars slightly smaller in the tooltip |
| `cursorUsageMeter.stateDbPath` | `""` | Custom path to Cursor's `state.vscdb` (see below) |

## How it works

The extension reads the Cursor access token from the local `state.vscdb` database — the same store Cursor uses when you are signed in. It then calls Cursor's usage endpoints on `api2.cursor.sh`.

Tokens are held in memory during a session. They are not logged or written to disk by this extension.

If automatic detection fails, **Set Access Token** stores a token in VS Code Secret Storage (encrypted by the editor, cross-platform).

## Restricted or non-standard setups

Some environments need extra steps. These are uncommon but supported.

### Managed or locked-down machines

If you are signed in to Cursor but the extension cannot find a token:

1. Run **Cursor Usage Meter: Diagnose Auth** to see which sources were checked.
2. Use **Set Access Token** to provide a token manually (one-time per machine).

To obtain a token from a machine where Cursor is already working:

```bash
git clone https://github.com/tansdf/cursor-usage-meter.git
cd cursor-usage-meter
npm install
node scripts/extract-token.mjs
```

Copy the printed token, then run **Set Access Token** on the target machine.

Alternatively, open Cursor's `state.vscdb` in [DB Browser for SQLite](https://sqlitebrowser.org/), table `ItemTable`, key `cursorAuth/accessToken`.

Default database locations:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Linux | `~/.config/Cursor/User/globalStorage/state.vscdb` |

### Very large `state.vscdb` files

On some machines the database grows to multiple gigabytes and cannot be opened in-process. Workaround:

1. Copy `state.vscdb` to another location.
2. In DB Browser, keep only the `ItemTable` table (remove `cursorDiskKV` if present).
3. Set `cursorUsageMeter.stateDbPath` to the trimmed copy.

For databases over 256 MB, the extension can also fall back to the `sqlite3` command-line tool if it is installed.

### Remote SSH, WSL, or dev containers

The extension must read Cursor's local auth database. If **Diagnose Auth** reports a remote extension host (e.g. WSL or SSH), force it to run on the local UI machine.

Add to **User settings.json**:

```json
"remote.extensionKind": {
  "tansdf.cursor-usage-meter": ["ui"]
}
```

Reload the window after saving. Enterprise networks may also need access to `api2.cursor.sh` and `cursor.com`.

## Troubleshooting

**Status bar item does not appear**

- Confirm the extension is enabled in the Extensions view.
- Right-click the status bar and ensure **Cursor Usage Meter** is checked.
- Run **Developer: Reload Window**.

**Status bar shows `!`**

- Sign in to Cursor on this machine, or use **Set Access Token**.
- Click the status bar item to retry, or run **Diagnose Auth** for details.

**Progress bars look wrong**

- Remove deprecated `cursorUsageMeter.barTrackGlyph` from settings if present.
- Set `cursorUsageMeter.barFillGlyph` to `▓`, or delete the setting to use the default.

**Item hidden behind other status bar entries**

- The meter is pinned to the far right; hide or reorder other status bar items if needed.

## Development

```bash
npm run compile    # build once
npm run watch      # rebuild on change
npm run test       # unit tests
npm run test:api   # live API smoke test (requires Cursor sign-in)
npm run package    # create a .vsix
```

## Disclaimer

This extension uses Cursor's undocumented internal API. It may stop working when Cursor changes its backend. Not affiliated with or endorsed by Cursor.

## License

MIT
