import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './utils/logger';
import { TreeSitterParser } from './parser/treeSitterParser';
import { PythonParser } from './parser/pythonParser';
import { JavaScriptParser } from './parser/javascriptParser';
import { computeSpecDiff } from './parser/diff';
import { DiagramSpec } from './parser/types';
import { AdaptiveDebouncer } from './utils/debounce';
import { AIService } from './ai/aiService';
import { LogicScopeSidebarProvider } from './webview/sidebarPanel';
import { LogicScopeWebviewPanel } from './webview/webviewPanel';

let pythonParserInstance: PythonParser;
let javascriptParserInstance: JavaScriptParser;
let debouncer: AdaptiveDebouncer;
let sidebarProvider: LogicScopeSidebarProvider;
let modeStatusBarItem: vscode.StatusBarItem;
let aiStatusBarItem: vscode.StatusBarItem;

let lastParsedSpec: DiagramSpec | null = null;
let currentLanguageId: string = '';
let currentFileName: string = '';
let currentDiagramType = 'auto';

// In-memory cache for AI explanations based on code signature
const explanationCache = new Map<string, any>();

export async function activate(context: vscode.ExtensionContext) {
  Logger.initialize();
  Logger.log('LogicScope extension is activating...');

  // Initialize parsers and helpers
  pythonParserInstance = new PythonParser();
  javascriptParserInstance = new JavaScriptParser();
  
  const config = vscode.workspace.getConfiguration('logicscope');
  const baseDebounce = config.get<number>('debounceMs', 300);
  debouncer = new AdaptiveDebouncer(baseDebounce);

  // Initialize Tree-sitter WASM
  try {
    await TreeSitterParser.init(context.extensionPath);
  } catch (err) {
    Logger.error('Failed to initialize TreeSitterParser. Parser functionality will be offline.', err);
    vscode.window.showErrorMessage('LogicScope failed to load Tree-sitter parsers. Local diagrams may not render.');
  }

  // Register Sidebar Webview View Provider
  sidebarProvider = new LogicScopeSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LogicScopeSidebarProvider.viewType,
      sidebarProvider
    )
  );

  // Status Bar Items
  modeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  modeStatusBarItem.command = 'logicscope.openDiagram';
  context.subscriptions.push(modeStatusBarItem);
  updateModeStatusBar();

  aiStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  aiStatusBarItem.command = 'logicscope.manageAIKey';
  context.subscriptions.push(aiStatusBarItem);
  updateAIStatusBar(context);

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('logicscope.openDiagram', () => {
      LogicScopeWebviewPanel.createOrShow(context.extensionUri);
      triggerParse(vscode.window.activeTextEditor);
    }),

    vscode.commands.registerCommand('logicscope.refreshDiagram', () => {
      triggerParse(vscode.window.activeTextEditor);
    }),

    vscode.commands.registerCommand('logicscope.toggleMode', async () => {
      const modes = ['auto', 'manual', 'snapshot'];
      const currentMode = vscode.workspace.getConfiguration('logicscope').get<string>('realTimeMode', 'auto');
      const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
      const nextMode = modes[nextIndex];

      await vscode.workspace.getConfiguration('logicscope').update('realTimeMode', nextMode, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`LogicScope mode switched to: ${nextMode.toUpperCase()}`);
      updateModeStatusBar();
      syncSidebarState(context);
    }),

    vscode.commands.registerCommand('logicscope.explainCode', async () => {
      await runAIExplanation(context);
    }),

    vscode.commands.registerCommand('logicscope.manageAIKey', async () => {
      await manageAIKeys(context);
    }),

    vscode.commands.registerCommand('logicscope.changeDiagramType', async (value: string) => {
      currentDiagramType = value;
      await syncSidebarState(context);
      triggerParse(vscode.window.activeTextEditor);
    })
  );

  // Listeners
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        currentLanguageId = editor.document.languageId;
        currentFileName = path.basename(editor.document.fileName);
      } else {
        currentLanguageId = '';
        currentFileName = '';
      }
      syncSidebarState(context);
      triggerParse(editor);
    }),

    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) return;

      const mode = vscode.workspace.getConfiguration('logicscope').get<string>('realTimeMode', 'auto');
      if (mode === 'auto') {
        const docLines = event.document.lineCount;
        const limitLines = vscode.workspace.getConfiguration('logicscope').get<number>('fileSizeWarningLines', 500);
        
        if (docLines > limitLines) {
          vscode.workspace.getConfiguration('logicscope').update('realTimeMode', 'snapshot', vscode.ConfigurationTarget.Global);
          vscode.window.showWarningMessage(`Large file (${docLines} lines) detected. Auto-switched LogicScope to SNAPSHOT mode.`);
          updateModeStatusBar();
          syncSidebarState(context);
          return;
        }

        debouncer.debounce(() => triggerParse(editor));
      }
    }),

    vscode.workspace.onDidSaveTextDocument(document => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || document !== editor.document) return;

      const mode = vscode.workspace.getConfiguration('logicscope').get<string>('realTimeMode', 'auto');
      if (mode === 'snapshot') {
        triggerParse(editor);
      }
    }),

    // Handle cursor moves to trigger node highlights in the diagram
    vscode.window.onDidChangeTextEditorSelection(event => {
      const editor = event.textEditor;
      if (!lastParsedSpec || !editor) return;

      const cursorLine = editor.selection.active.line + 1; // 1-indexed

      // Find if cursor is inside any node's range
      const matchingNode = lastParsedSpec.nodes.find(node => {
        if (node.meta && node.meta.startLine) {
          const start = node.meta.startLine;
          const end = node.meta.endLine || start;
          return cursorLine >= start && cursorLine <= end;
        }
        return false;
      });

      if (matchingNode && LogicScopeWebviewPanel.currentPanel) {
        LogicScopeWebviewPanel.currentPanel.highlightNode(matchingNode.id);
      }
    }),

    vscode.workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration('logicscope.debounceMs')) {
        const val = vscode.workspace.getConfiguration('logicscope').get<number>('debounceMs', 300);
        debouncer.setBaseDelay(val);
      }
      if (event.affectsConfiguration('logicscope.realTimeMode')) {
        updateModeStatusBar();
        syncSidebarState(context);
      }
      if (event.affectsConfiguration('logicscope.aiProvider') || event.affectsConfiguration('logicscope.aiModel')) {
        updateAIStatusBar(context);
        syncSidebarState(context);
      }
    })
  );

  // Initialize display on startup
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    currentLanguageId = activeEditor.document.languageId;
    currentFileName = path.basename(activeEditor.document.fileName);
  }
  syncSidebarState(context);
}

export function deactivate() {
  debouncer.cancel();
}

// --- Status Bar Item Helpers ---

function updateModeStatusBar() {
  modeStatusBarItem.text = `$(eye) LogicScope`;
  modeStatusBarItem.tooltip = `LogicScope: Open Diagram Canvas`;
  modeStatusBarItem.show();
}

async function updateAIStatusBar(context: vscode.ExtensionContext) {
  const provider = vscode.workspace.getConfiguration('logicscope').get<string>('aiProvider', 'groq');
  const apiKey = await AIService.getApiKey(context, provider);
  const providerLabel = provider === 'groq' ? 'Groq' : 'Gemini';

  if (apiKey) {
    aiStatusBarItem.text = `$(key) AI: Active (${providerLabel})`;
    aiStatusBarItem.tooltip = 'LogicScope AI: Click to manage API key';
  } else {
    aiStatusBarItem.text = `$(key) AI: Configure`;
    aiStatusBarItem.tooltip = 'LogicScope AI: Click to set up API key';
  }
  aiStatusBarItem.show();
}

// --- Sidebar State Sync Helper ---

async function syncSidebarState(context: vscode.ExtensionContext) {
  const provider = vscode.workspace.getConfiguration('logicscope').get<string>('aiProvider', 'groq');
  const apiKey = await AIService.getApiKey(context, provider);
  const learningMode = vscode.workspace.getConfiguration('logicscope').get<string>('learningMode', 'beginner');
  const realTimeMode = vscode.workspace.getConfiguration('logicscope').get<string>('realTimeMode', 'auto');

  const fileActive = currentLanguageId === 'python' || currentLanguageId === 'javascript';

  sidebarProvider.updateState({
    fileName: currentFileName,
    languageId: currentLanguageId,
    fileActive,
    hasKey: !!apiKey,
    learningMode,
    realTimeMode,
    diagramType: currentDiagramType,
    aiStatus: apiKey ? 'active' : 'idle',
    aiStatusMessage: apiKey ? `Key set (${provider})` : 'AI Key Missing'
  });
}

// --- Main Parser Trigger ---

function triggerParse(editor: vscode.TextEditor | undefined) {
  if (!editor) return;

  const doc = editor.document;
  const langId = doc.languageId;

  if (langId !== 'python' && langId !== 'javascript') {
    return;
  }

  try {
    const parser = TreeSitterParser.getParser(langId);
    if (!parser) {
      Logger.warn(`Parser not available for ${langId}`);
      return;
    }

    const code = doc.getText();
    const cursorOffset = editor.document.offsetAt(editor.selection.active);

    const astTree = parser.parse(code);
    
    let spec: DiagramSpec;
    const reqType = currentDiagramType === 'auto' ? undefined : currentDiagramType;
    if (langId === 'python') {
      spec = pythonParserInstance.parse(astTree.rootNode, code, cursorOffset, reqType);
    } else {
      spec = javascriptParserInstance.parse(astTree.rootNode, code, cursorOffset, reqType);
    }

    // Compute diff and track changes
    computeSpecDiff(lastParsedSpec, spec);
    lastParsedSpec = spec;

    const mermaidCode = diagramSpecToMermaid(spec);
    
    if (LogicScopeWebviewPanel.currentPanel) {
      LogicScopeWebviewPanel.currentPanel.updateDiagram(spec, mermaidCode);
      LogicScopeWebviewPanel.currentPanel.updateTheme();
    }
  } catch (err) {
    Logger.error('Parsing failed during document change event', err);
  }
}

// --- Diagram Spec to Mermaid Converter ---

function diagramSpecToMermaid(spec: DiagramSpec): string {
  if (spec.diagramType === 'none' || spec.nodes.length === 0) {
    return '';
  }

  if (spec.diagramType === 'class') {
    let code = 'classDiagram\n';
    spec.nodes.forEach(node => {
      // Escape name just in case
      code += `  class ${node.label} {\n`;
      if (node.meta && node.meta.members) {
        node.meta.members.forEach(member => {
          code += `    ${member}\n`;
        });
      }
      code += '  }\n';
    });

    spec.edges.forEach(edge => {
      const typeStr = edge.type === 'inheritance' ? '<|--' :
                      edge.type === 'composition' ? '*--' :
                      '-->';
      code += `  ${edge.from} ${typeStr} ${edge.to}\n`;
    });

    return code;
  }

  // Flowchart or Recursion Tree
  let code = 'graph TD\n';
  const classAssignments: string[] = [];
  
  spec.nodes.forEach(node => {
    let shapeStart = '[';
    let shapeEnd = ']';
    
    if (node.type === 'condition') {
      shapeStart = '{';
      shapeEnd = '}';
      classAssignments.push(`  class ${node.id} condNode;`);
    } else if (node.type === 'start') {
      shapeStart = '([';
      shapeEnd = '])';
      classAssignments.push(`  class ${node.id} startNode;`);
    } else if (node.type === 'end') {
      shapeStart = '([';
      shapeEnd = '])';
      classAssignments.push(`  class ${node.id} endNode;`);
    } else if (node.type === 'loop') {
      shapeStart = '{{';
      shapeEnd = '}}';
      classAssignments.push(`  class ${node.id} loopNode;`);
    } else {
      classAssignments.push(`  class ${node.id} procNode;`);
    }

    const escapedLabel = node.label.replace(/"/g, '&quot;');
    code += `  ${node.id}${shapeStart}"${escapedLabel}"${shapeEnd}\n`;
  });

  spec.edges.forEach(edge => {
    if (edge.label) {
      code += `  ${edge.from} -- "${edge.label}" --> ${edge.to}\n`;
    } else {
      code += `  ${edge.from} --> ${edge.to}\n`;
    }
  });

  if (classAssignments.length > 0) {
    code += '\n' + classAssignments.join('\n') + '\n';
  }

  return code;
}

// --- AI Key Management Command Helper ---

async function manageAIKeys(context: vscode.ExtensionContext) {
  const provider = vscode.workspace.getConfiguration('logicscope').get<string>('aiProvider', 'groq');
  const key = await AIService.getApiKey(context, provider);
  const providerLabel = provider === 'groq' ? 'Groq' : 'Gemini';

  const items: vscode.QuickPickItem[] = [
    {
      label: 'Change Provider',
      description: `Current: ${providerLabel}`,
      detail: 'Switch between Groq and Gemini APIs'
    },
    {
      label: 'Update API Key',
      detail: `Enter or update key for the active provider (${providerLabel})`
    }
  ];

  if (key) {
    const masked = key.slice(0, 6) + '••••••••' + key.slice(-4);
    items.push(
      {
        label: 'View Masked Key',
        description: masked,
        detail: 'Show a snippet of the active key'
      },
      {
        label: 'Test Current Key',
        detail: 'Run validation ping against the provider endpoint'
      },
      {
        label: 'Remove API Key',
        detail: `Delete the key for ${providerLabel} from Secret Storage`
      }
    );
  }

  const choice = await vscode.window.showQuickPick(items, {
    placeHolder: `LogicScope AI Management (${providerLabel})`
  });

  if (!choice) return;

  switch (choice.label) {
    case 'Change Provider':
      const newProvider = await vscode.window.showQuickPick(['groq', 'gemini'], {
        placeHolder: 'Select AI Provider'
      });
      if (newProvider) {
        await vscode.workspace.getConfiguration('logicscope').update('aiProvider', newProvider, vscode.ConfigurationTarget.Global);
        const newModel = newProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-2.0-flash';
        await vscode.workspace.getConfiguration('logicscope').update('logicscope.aiModel', newModel, vscode.ConfigurationTarget.Global);
        
        vscode.window.showInformationMessage(`Switched AI provider to ${newProvider.toUpperCase()}`);
        updateAIStatusBar(context);
        syncSidebarState(context);
      }
      break;

    case 'Update API Key':
      await AIService.ensureApiKey(context, provider);
      updateAIStatusBar(context);
      syncSidebarState(context);
      break;

    case 'View Masked Key':
      vscode.window.showInformationMessage(`Active ${providerLabel} API Key: ${choice.description}`);
      break;

    case 'Test Current Key':
      if (key) {
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Testing ${providerLabel} API Key...`,
          cancellable: false
        }, async () => {
          try {
            const ok = await AIService.validateKey(provider, key);
            if (ok) {
              vscode.window.showInformationMessage(`API key for ${providerLabel} is valid.`);
            } else {
              vscode.window.showErrorMessage(`API key for ${providerLabel} is invalid or expired.`);
            }
          } catch (err) {
            vscode.window.showErrorMessage(`Test connection failed: network error.`);
          }
        });
      }
      break;

    case 'Remove API Key':
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to remove the API key for ${providerLabel}? This reverts LogicScope to structural offline mode.`,
        'Yes', 'Cancel'
      );
      if (confirm === 'Yes') {
        await AIService.removeApiKey(context, provider);
        vscode.window.showInformationMessage(`API key for ${providerLabel} removed.`);
        updateAIStatusBar(context);
        syncSidebarState(context);
      }
      break;
  }
}

// --- AI Explanation Engine ---

async function runAIExplanation(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor open to visualize.');
    return;
  }

  const doc = editor.document;
  const langId = doc.languageId;
  if (langId !== 'python' && langId !== 'javascript') {
    vscode.window.showErrorMessage('AI explanations only support Python and JavaScript.');
    return;
  }

  // Get configuration settings
  const config = vscode.workspace.getConfiguration('logicscope');
  const provider = config.get<string>('aiProvider', 'groq');
  const model = config.get<string>('aiModel', 'llama-3.3-70b-versatile');
  const learningMode = config.get<'beginner' | 'advanced'>('learningMode', 'beginner');

  // Retrieve code selection or fall back to cursor context block
  let codeText = editor.document.getText(editor.selection);
  if (!codeText || codeText.trim() === '') {
    // Attempt to extract the current block under the cursor (first line to last line of parsed functions or whole file if simple)
    if (lastParsedSpec && lastParsedSpec.nodes.length > 0) {
      const cursorLine = editor.selection.active.line + 1;
      const containingNode = lastParsedSpec.nodes.find(node => {
        if (node.meta && node.meta.startLine) {
          const start = node.meta.startLine;
          const end = node.meta.endLine || start;
          return cursorLine >= start && cursorLine <= end;
        }
        return false;
      });

      if (containingNode && containingNode.meta && containingNode.meta.startLine !== undefined) {
        const start = containingNode.meta.startLine - 1;
        const end = (containingNode.meta.endLine || containingNode.meta.startLine) - 1;
        codeText = '';
        for (let l = start; l <= end; l++) {
          codeText += doc.lineAt(l).text + '\n';
        }
      }
    }
  }

  // If we still don't have code, fall back to entire document
  if (!codeText || codeText.trim() === '') {
    codeText = doc.getText();
  }

  if (!codeText || codeText.trim() === '') {
    vscode.window.showWarningMessage('Code selection/file is empty.');
    return;
  }

  // Check cache to avoid duplicate calls
  const signature = `${provider}:${model}:${learningMode}:${codeText.trim()}`;
  if (explanationCache.has(signature)) {
    const cached = explanationCache.get(signature);
    sidebarProvider.updateExplanation(cached);
    sidebarProvider.updateState({ aiStatus: 'active', aiStatusMessage: `Cached response loaded` });
    return;
  }

  // Onboard or verify API key
  const apiKey = await AIService.ensureApiKey(context, provider);
  if (!apiKey) {
    Logger.warn('AI Explanation aborted - missing API key');
    sidebarProvider.updateState({ aiStatus: 'idle', aiStatusMessage: 'API Key Missing' });
    return;
  }

  // Trigger loading spinner
  sidebarProvider.setAIExplanationLoading(true);
  sidebarProvider.updateState({ aiStatus: 'active', aiStatusMessage: 'Calling API...' });

  try {
    const result = await AIService.explainCode(
      codeText,
      langId === 'python' ? 'Python' : 'JavaScript',
      provider,
      apiKey,
      model,
      learningMode
    );

    // Save to cache
    explanationCache.set(signature, result);

    sidebarProvider.updateExplanation(result);
    sidebarProvider.updateState({
      aiStatus: 'active',
      aiStatusMessage: 'Analysis complete.'
    });
  } catch (err) {
    Logger.error('AI call failed', err);
    sidebarProvider.setAIExplanationLoading(false);
    sidebarProvider.updateState({
      aiStatus: 'error',
      aiStatusMessage: 'AI Request Failed'
    });
    vscode.window.showErrorMessage(`LogicScope AI call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
