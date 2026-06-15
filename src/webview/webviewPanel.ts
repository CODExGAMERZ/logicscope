import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { DiagramSpec } from '../parser/types';

export class LogicScopeWebviewPanel {
  public static currentPanel: LogicScopeWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it in the editor group to the side
    if (LogicScopeWebviewPanel.currentPanel) {
      LogicScopeWebviewPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'logicscope.diagramView',
      'LogicScope Canvas',
      column !== undefined ? vscode.ViewColumn.Beside : vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'dist')
        ],
        retainContextWhenHidden: true
      }
    );

    LogicScopeWebviewPanel.currentPanel = new LogicScopeWebviewPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._updateHtml();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'nodeClicked':
            this._handleNodeClicked(message.meta);
            break;
          case 'copyMermaid':
            await vscode.env.clipboard.writeText(message.code);
            vscode.window.showInformationMessage('Mermaid markup copied to clipboard!');
            break;
          case 'savePng':
            await this._handleSavePng(message.data);
            break;
        }
      },
      null,
      this._disposables
    );

    // Update theme when VS Code theme changes
    vscode.window.onDidChangeActiveColorTheme(() => {
      this.updateTheme();
    }, null, this._disposables);
  }

  public updateDiagram(spec: DiagramSpec, mermaidCode: string) {
    this._panel.webview.postMessage({
      command: 'update',
      spec,
      mermaidCode
    });
  }

  public setLoading(loading: boolean) {
    this._panel.webview.postMessage({
      command: 'setLoading',
      loading
    });
  }

  public highlightNode(nodeId: string) {
    this._panel.webview.postMessage({
      command: 'highlightNode',
      nodeId
    });
  }

  public updateTheme() {
    const themeKind = vscode.window.activeColorTheme.kind;
    const theme = (themeKind === vscode.ColorThemeKind.Light || themeKind === vscode.ColorThemeKind.HighContrastLight) ? 'light' : 'dark';
    this._panel.webview.postMessage({
      command: 'setTheme',
      theme
    });
  }

  private _handleNodeClicked(meta: any) {
    if (!meta || !meta.startLine) return;

    // Find the editor matching python or js
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const startLine = meta.startLine - 1;
      const endLine = (meta.endLine || meta.startLine) - 1;
      
      const startPos = new vscode.Position(startLine, 0);
      const endPos = new vscode.Position(endLine, 100);

      activeEditor.selection = new vscode.Selection(startPos, endPos);
      activeEditor.revealRange(activeEditor.selection, vscode.TextEditorRevealType.InCenter);
    }
  }

  private async _handleSavePng(base64Data: string) {
    try {
      const defaultUri = vscode.workspace.workspaceFolders
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'diagram.png')
        : undefined;

      const uri = await vscode.window.showSaveDialog({
        filters: { 'Images': ['png'] },
        defaultUri
      });

      if (uri) {
        const cleanBase64 = base64Data.replace(/^data:image\/png;base64,/, '');
        const dataBuffer = Buffer.from(cleanBase64, 'base64');
        await vscode.workspace.fs.writeFile(uri, dataBuffer);
        vscode.window.showInformationMessage('Diagram saved successfully!');
      }
    } catch (e) {
      Logger.error('Failed to save PNG file', e);
      vscode.window.showErrorMessage('Failed to save diagram PNG: ' + String(e));
    }
  }

  public dispose() {
    LogicScopeWebviewPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _updateHtml() {
    const webview = this._panel.webview;
    
    // Get paths to local resources
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.css'));
    const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'mermaid.min.js'));

    const nonce = getNonce();
    const themeKind = vscode.window.activeColorTheme.kind;
    const bodyClass = (themeKind === vscode.ColorThemeKind.Light || themeKind === vscode.ColorThemeKind.HighContrastLight) ? 'vscode-light' : 'vscode-dark';

    this._panel.webview.html = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <!-- Content Security Policy -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
        <link href="${cssUri}" rel="stylesheet">
        <title>LogicScope Canvas</title>
      </head>
      <body class="${bodyClass}">
        <div id="toolbar">
          <button class="btn" id="zoom-in">Zoom In</button>
          <button class="btn" id="zoom-out">Zoom Out</button>
          <button class="btn" id="zoom-fit">Fit to Screen</button>
          <div style="width: 1px; background: var(--ui-border); margin: 4px 0;"></div>
          <button class="btn" id="copy-mermaid">Copy Mermaid</button>
          <button class="btn btn-primary" id="export-png">Export PNG</button>
        </div>

        <div id="canvas-container">
          <div id="canvas">
            <div style="padding: 40px; text-align: center; opacity: 0.6; font-size: 14px;">
              Write some code and the diagram will appear here.
            </div>
          </div>
        </div>

        <div id="detail-card">
          <h3>
            <span id="card-title">Node Details</span>
            <span class="close-btn" id="close-card">&times;</span>
          </h3>
          <p id="card-type" style="font-weight: 600; font-size: 10px; opacity: 0.8;"></p>
          <p id="card-lines" style="font-size: 10px; opacity: 0.8;"></p>
          <div id="card-details" style="margin-top: 8px;"></div>
        </div>

        <div id="loading-overlay">
          <div class="spinner"></div>
          <div style="font-size: 11px; font-weight: 500;">Analyzing structure...</div>
        </div>

        <!-- Local Bundled Libraries -->
        <script nonce="${nonce}" src="${mermaidUri}"></script>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
