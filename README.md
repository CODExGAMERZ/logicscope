# LogicScope

LogicScope is a real-time DSA & OOP visualizer extension for Visual Studio Code. It automatically generates interactive control flow diagrams (flowcharts), class diagrams (UML), and recursion trees directly from your Python and JavaScript code as you type.

The extension operates completely offline and locally using WebAssembly-based Tree-sitter parsers, ensuring that your code remains secure and private. It also features an optional Bring-Your-Own-Key (BYOK) AI explanation layer that provides complexity analysis and structural breakdowns.

---

## Features

- **Real-Time Flowcharts**: Automatically parses control flows (conditionals, loops, function calls) and renders them as beautiful Mermaid.js flowcharts.
- **UML Class Diagrams**: Scans your object-oriented code structures and visualizes class hierarchies, properties, methods, and inheritances.
- **Recursion Trees**: Tracks recursive function paths to help visualize stack frames, parameters, base cases, and return values.
- **Three Update Modes**:
  - **Auto**: Re-renders diagrams in real-time as you type, driven by an adaptive debouncer.
  - **Manual**: Refreshes only when you trigger the manual refresh command or button.
  - **Snapshot**: Refreshes only when you save your code file (ideal for larger projects).
- **Secure AI Explanations (BYOK)**: Retrieve detailed complexity breakdowns and conceptual reviews using your own Groq or Gemini API keys, stored securely in VS Code's `SecretStorage`.

---

## Supported Languages

- **Python** (`.py` files)
- **JavaScript** (`.js` files)

---

## Quick Start

1. Install the extension in Visual Studio Code.
2. Open any supported Python or JavaScript file.
3. Look at the Status Bar or Activity Bar:
   - Click the **LogicScope** icon in the Activity Bar to view controls and configurations in the sidebar.
   - Click **Open Canvas** in the Status Bar or run the command `LogicScope: Open Diagram Panel` to open the interactive visualization board side-by-side with your editor.
4. Start writing code. The canvas will automatically update to reflect your code structure.
5. (Optional) In the Sidebar panel, click **Configure AI Key** to set up your Groq or Gemini API key for instant complexity explanations.

---

## Configuration Settings

You can customize the extension via your VS Code Settings (`settings.json`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `logicscope.debounceMs` | `integer` | `300` | The delay in milliseconds before parsing code after editing. Min: 100, Max: 2000. |
| `logicscope.realTimeMode` | `string` | `"auto"` | Diagram update behavior: `"auto"`, `"manual"`, or `"snapshot"`. |
| `logicscope.learningMode` | `string` | `"beginner"` | The explanation depth level: `"beginner"` or `"advanced"`. |
| `logicscope.aiEnabled` | `boolean` | `true` | Enables/disables the optional AI explanation layer. |
| `logicscope.aiProvider` | `string` | `"groq"` | Preferred API service for explanations: `"groq"` or `"gemini"`. |
| `logicscope.aiModel` | `string` | `"llama-3.3-70b-versatile"` | Model identifier to send to the chosen API provider. |
| `logicscope.autoExplainOnStableCode` | `boolean` | `false` | Automatically request AI analysis when the editor remains stable for 5 seconds. |
| `logicscope.fileSizeWarningLines` | `integer` | `500` | Limits automatic real-time updates on files longer than this value to prevent performance issues. |
| `logicscope.diagramTheme` | `string` | `"auto"` | Style theme for Mermaid diagrams: `"auto"`, `"default"`, `"dark"`, `"forest"`, or `"neutral"`. |

---

## Commands

Access the following commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **LogicScope: Open Diagram Panel**: Opens the main visualization canvas in a split editor.
- **LogicScope: Refresh Diagram**: Manually triggers a re-parse and diagram re-render.
- **LogicScope: Toggle Real-Time Mode**: Switches between Auto, Manual, and Snapshot modes.
- **LogicScope: Explain This Code**: Triggers an AI explanation for the selected code block (requires a configured API key).
- **LogicScope: Manage AI Key**: Adds, updates, or deletes your saved AI API keys.

---

## Offline Security & Architecture

LogicScope is built with security and performance in mind:
- **Local Parsing**: The core parsing engine uses `web-tree-sitter` compiled to WebAssembly. Grammars are loaded locally, meaning your code is parsed directly in your editor process and is never uploaded to any remote servers.
- **VS Code native SecretStorage**: Any AI API keys you register are stored securely inside the operating system keychain using VS Code's built-in `SecretStorage` API. They are never saved to plain-text workspace files or settings configurations.
- **Zero Internet Dependencies for rendering**: The Mermaid.js library and the styles are bundled locally within the extension files, working fully in offline environments.

---

## 🌐 Standalone Web Playground

LogicScope includes a standalone visualizer playground hosted as a vanilla HTML5/CSS3 static app. It provides a real-time sandbox for writing Python/JavaScript code and rendering interactive Mermaid flowcharts, class UMLs, and recursion call trees directly inside any web browser.

### Preview Locally
To run the visualizer playground locally:
1. Navigate to the extension directory.
2. Serve the static `website` folder using any local server:
   ```bash
   npx serve website -l 5002
   ```
3. Open your browser to `http://localhost:5002` to test the visual compiler sandbox.

### Vercel Deployment
The repository includes a `vercel.json` config. You can import the repository directly into Vercel and it will host the static playground directory zero-config.

---

## License

This extension is licensed under the MIT License.
