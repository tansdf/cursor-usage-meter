import * as vscode from 'vscode';
import { fetchUsageSnapshot } from './api/usageClient';
import {
  clearTokenCache,
  diagnoseAuth,
  getAccessToken,
  getAuthFailureMessage,
  setSecretAccessToken,
} from './auth/cursorAuth';
import { readConfig } from './config';
import { UsageStatusBar } from './ui/statusBar';

let pollTimer: ReturnType<typeof setInterval> | undefined;
let statusBar: UsageStatusBar | undefined;
let isRefreshing = false;
let authPromptShown = false;

async function refreshUsage(context: vscode.ExtensionContext): Promise<void> {
  if (!statusBar || isRefreshing) {
    return;
  }
  isRefreshing = true;
  statusBar.setLoading();

  const config = readConfig();
  const lastUpdated = new Date();

  try {
    const token = await getAccessToken(context, context.extensionPath);
    if (!token) {
      const message = await getAuthFailureMessage(context, context.extensionPath);
      statusBar.updateError(message, lastUpdated);
      if (!authPromptShown) {
        authPromptShown = true;
        const action = await vscode.window.showWarningMessage(
          'Cursor Usage Meter: auth not found.',
          'Set Access Token',
          'Diagnose Auth',
        );
        if (action === 'Set Access Token') {
          await vscode.commands.executeCommand('cursorUsageMeter.setToken');
        } else if (action === 'Diagnose Auth') {
          await vscode.commands.executeCommand('cursorUsageMeter.diagnoseAuth');
        }
      }
      return;
    }

    const snapshot = await fetchUsageSnapshot(token);
    statusBar.updateReady(snapshot, config, lastUpdated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching usage.';
    statusBar.updateError(message, lastUpdated);
  } finally {
    isRefreshing = false;
  }
}

function schedulePolling(context: vscode.ExtensionContext): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  const config = readConfig();
  pollTimer = setInterval(() => {
    void refreshUsage(context);
  }, config.pollIntervalSeconds * 1000);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  statusBar = new UsageStatusBar();
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      statusBar?.dispose();
      statusBar = undefined;
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorUsageMeter.refresh', async () => {
      clearTokenCache();
      await refreshUsage(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorUsageMeter.openDashboard', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/dashboard/usage'));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorUsageMeter.diagnoseAuth', async () => {
      let diagnostic;
      try {
        diagnostic = await diagnoseAuth(context, context.extensionPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Cursor Usage Meter auth diagnostic failed: ${message}`);
        return;
      }
      const lines = [
        `Extension host: ${diagnostic.extensionHost}${diagnostic.remoteName ? ` (${diagnostic.remoteName})` : ''}`,
        `Database: ${diagnostic.stateDbPath}`,
        `Exists: ${diagnostic.stateDbExists ? 'yes' : 'no'}`,
        diagnostic.stateDbSizeMb !== null ? `Size: ${diagnostic.stateDbSizeMb} MB` : null,
        `SQLite token: ${diagnostic.sqliteAccessToken ? 'yes' : 'no'}`,
        `Secret storage token: ${diagnostic.secretStorageToken ? 'yes' : 'no'}`,
        diagnostic.sqliteMembershipType ? `Membership: ${diagnostic.sqliteMembershipType}` : null,
        diagnostic.selectedSource ? `Selected source: ${diagnostic.selectedSource}` : null,
        diagnostic.notes.length > 0 ? `Notes: ${diagnostic.notes.join('; ')}` : null,
      ].filter((line): line is string => line !== null);

      const token = await getAccessToken(context, context.extensionPath);
      if (token) {
        try {
          const snapshot = await fetchUsageSnapshot(token);
          lines.push(`API: ok (${snapshot.planName}, ${snapshot.accountKind})`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          lines.push(`API: failed (${message})`);
        }
      } else {
        lines.push('API: skipped (no usable token)');
      }

      if (diagnostic.extensionHost === 'remote') {
        lines.push(
          'Tip: add `"remote.extensionKind": { "local.cursor-usage-meter": ["ui"] }` to settings to run locally on Windows.',
        );
      }
      await vscode.window.showInformationMessage('Cursor Usage Meter auth diagnostic', {
        modal: true,
        detail: lines.join('\n'),
      } as vscode.MessageOptions);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorUsageMeter.statusBarClick', async () => {
      if (!statusBar?.hasError) {
        await refreshUsage(context);
        return;
      }
      const action = await vscode.window.showQuickPick(
        [
          { label: 'Set Access Token', description: 'Paste a JWT from a signed-in Cursor machine', command: 'cursorUsageMeter.setToken' },
          { label: 'Diagnose Auth', description: 'Show where the extension looked for credentials', command: 'cursorUsageMeter.diagnoseAuth' },
          { label: 'Refresh', description: 'Try reading auth again', command: 'cursorUsageMeter.refresh' },
        ],
        { placeHolder: 'Cursor Usage Meter' },
      );
      if (action?.command) {
        await vscode.commands.executeCommand(action.command);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorUsageMeter.setToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Paste Cursor access token (stored in Secret Storage)',
        password: true,
        ignoreFocusOut: true,
      });
      if (!token?.trim()) {
        return;
      }
      await setSecretAccessToken(context, token);
      clearTokenCache();
      await refreshUsage(context);
      void vscode.window.showInformationMessage('Cursor Usage Meter: access token saved.');
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('cursorUsageMeter')) {
        schedulePolling(context);
        void refreshUsage(context);
      }
    }),
  );

  schedulePolling(context);
  await refreshUsage(context);
}

export function deactivate(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  statusBar?.dispose();
  statusBar = undefined;
}
