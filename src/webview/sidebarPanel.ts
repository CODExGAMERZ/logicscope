import * as vscode from 'vscode';

export class LogicScopeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'logicscope.sidebar';
  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private _currentState: any = {};

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.command) {
        case 'ready':
          this.updateState(this._currentState);
          break;
        case 'openCanvas':
          await vscode.commands.executeCommand('logicscope.openDiagram');
          break;
        case 'changeDiagramType':
          await vscode.commands.executeCommand('logicscope.changeDiagramType', data.value);
          break;
        case 'changeLearningMode':
          await vscode.workspace.getConfiguration('logicscope').update('learningMode', data.value, vscode.ConfigurationTarget.Global);
          break;
        case 'changeRealTimeMode':
          await vscode.workspace.getConfiguration('logicscope').update('realTimeMode', data.value, vscode.ConfigurationTarget.Global);
          break;
        case 'refresh':
          await vscode.commands.executeCommand('logicscope.refreshDiagram');
          break;
        case 'explain':
          await vscode.commands.executeCommand('logicscope.explainCode');
          break;
        case 'manageAIKey':
          await vscode.commands.executeCommand('logicscope.manageAIKey');
          break;
      }
    });
  }

  public updateState(state: any) {
    this._currentState = { ...this._currentState, ...state };
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateState',
        state: this._currentState
      });
    }
  }

  public setAIExplanationLoading(loading: boolean) {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'setAIExplanationLoading',
        loading
      });
    }
  }

  public updateExplanation(result: any) {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateExplanation',
        result
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
        <link href="${cssUri}" rel="stylesheet">
      </head>
      <body>
        <div class="section">
          <div class="card">
            <div class="file-info">
              <span id="file-name" style="font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 140px;">No active file</span>
              <span id="lang-badge" class="badge">None</span>
            </div>
            <div>
              <span id="ai-badge" class="badge badge-ai-free" style="display: none;">Try without AI</span>
            </div>
            <button id="btn-open-canvas" class="btn-primary" style="width: 100%; margin-top: 8px; font-size: 11px; padding: 6px;">Open Diagram Canvas</button>
          </div>
        </div>

        <div class="section">
          <label for="diagram-type">Diagram Type</label>
          <select id="diagram-type">
            <option value="auto">Auto (Detect)</option>
            <option value="flowchart">Flowchart (Control Flow)</option>
            <option value="class">Class Diagram</option>
            <option value="tree">Recursion Tree</option>
          </select>

          <label for="learning-mode">Learning Mode</label>
          <select id="learning-mode">
            <option value="beginner">Beginner (Simple & Visual)</option>
            <option value="advanced">Advanced (Jargon & Complexities)</option>
          </select>

          <label for="real-time-mode">Real-Time Mode</label>
          <select id="real-time-mode">
            <option value="auto">Auto (Type to Update)</option>
            <option value="manual">Manual (Refresh Button)</option>
            <option value="snapshot">Snapshot (On Save)</option>
          </select>

          <button id="btn-refresh" class="btn-secondary" style="display: none; margin-bottom: 12px;">Refresh Diagram</button>
        </div>

        <div class="section">
          <button id="btn-explain" class="btn-explain" disabled>
            Explain This Code
          </button>
          
          <div class="ai-status-row">
            <div class="ai-status">
              <span id="status-dot" class="status-dot"></span>
              <span id="status-text" style="opacity: 0.8;">Checking key...</span>
            </div>
            <button class="btn-secondary" id="manage-keys" style="margin-top: 0; padding: 4px 8px; font-size: 10px; width: auto;" title="Manage AI Key">Manage Key</button>
          </div>
        </div>

        <!-- Spinner shown while explanation fetches -->
        <div id="spinner-container" class="spinner-container">
          <div class="spinner"></div>
          <div style="font-size: 11px; font-weight: 500; opacity: 0.8;">Asking AI...</div>
        </div>

        <!-- Explanation card -->
        <div id="explanation-section" class="card" style="margin-top: 16px;">
          <h4 id="concept-title" class="concept-title">Concept</h4>
          <div class="complexity-box">
            <div class="complexity-tag">
              <div style="opacity: 0.7; font-size: 9px;">Time</div>
              <div id="time-complexity" class="complexity-val">O(1)</div>
            </div>
            <div class="complexity-tag">
              <div style="opacity: 0.7; font-size: 9px;">Space</div>
              <div id="space-complexity" class="complexity-val">O(1)</div>
            </div>
          </div>
          <div id="explanation-body" class="explanation-body"></div>
        </div>

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
