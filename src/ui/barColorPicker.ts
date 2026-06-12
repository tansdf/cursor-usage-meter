import * as vscode from 'vscode';
import { readConfig } from '../config';

function pickerHtml(initialColor: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body {
      padding: 16px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    label { display: block; margin-bottom: 8px; }
    input[type="color"] {
      width: 100%;
      height: 48px;
      border: 1px solid var(--vscode-widget-border);
      background: var(--vscode-editor-background);
      cursor: pointer;
    }
    #hex {
      margin: 12px 0 16px;
      font-family: var(--vscode-editor-font-family);
    }
    button {
      padding: 6px 14px;
      border: 0;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <label for="picker">Bar fill color</label>
  <input type="color" id="picker" value="${initialColor}">
  <div id="hex">${initialColor}</div>
  <button id="apply">Apply</button>
  <script>
    const vscode = acquireVsCodeApi();
    const picker = document.getElementById('picker');
    const hex = document.getElementById('hex');
    picker.addEventListener('input', () => { hex.textContent = picker.value; });
    document.getElementById('apply').addEventListener('click', () => {
      vscode.postMessage({ type: 'picked', color: picker.value });
    });
  </script>
</body>
</html>`;
}

export async function pickBarFillColor(): Promise<void> {
  const current = readConfig().barFillColor;
  const panel = vscode.window.createWebviewPanel(
    'cursorUsageMeter.barColorPicker',
    'Bar Fill Color',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
    { enableScripts: true },
  );

  panel.webview.html = pickerHtml(current);

  const picked = await new Promise<string | undefined>((resolve) => {
    const messageSub = panel.webview.onDidReceiveMessage((message: { type?: string; color?: string }) => {
      if (message.type === 'picked' && typeof message.color === 'string') {
        resolve(message.color);
      }
    });
    panel.onDidDispose(() => {
      messageSub.dispose();
      resolve(undefined);
    });
  });

  panel.dispose();

  if (!picked) {
    return;
  }

  await vscode.workspace
    .getConfiguration('cursorUsageMeter')
    .update('barFillColor', picked, vscode.ConfigurationTarget.Global);
}
