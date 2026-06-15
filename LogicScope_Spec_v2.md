# LogicScope
## DSA + OOPs Visualizer for VS Code

> *"See the logic. Not just the code."*

---

## Extension Identity

| Field              | Value                                        |
|--------------------|----------------------------------------------|
| **Name**           | LogicScope                                     |
| **Tagline**        | See the logic. Not just the code.            |
| **Publisher ID**   | `codexgamerz.logicscope`                       |
| **Version Target** | v1.0.0 (Phase 1 MVP)                         |
| **License**        | MIT (open source, AI key user-provided)      |
| **Category**       | Education, Visualization, Developer Tools    |
| **Cost model**     | $0 to maintain — Tree-sitter runs locally, AI is fully BYOK |

---

## Vision

LogicScope is a VS Code extension that turns code into live visual diagrams as you write it. It combines fast structural parsing with optional AI-powered semantic understanding to generate flowcharts, class diagrams, recursion trees, and DSA visuals that update in real time — so learners always see what their code is doing, not just what it says.

The core promise: a user writes a function, and without clicking anything, a diagram appears beside their editor showing the control flow, data structure, or object relationship the code represents. As they keep typing, the diagram evolves with them.

**Design principle:** the extension must be 100% useful with zero configuration and zero AI key. Tree-sitter-based diagrams (flowchart, class diagram, recursion tree) work instantly for everyone. AI is an enrichment layer that a user opts into on their own terms, with their own key, at their own pace — never a blocker.

---

## Target Users

- Students learning DSA and OOPs for the first time
- Self-learners using online resources or textbooks
- Interview preparation candidates
- Teachers and trainers who want to demonstrate concepts visually
- Developers who want a quick structural overview of unfamiliar code

---

## Architecture Overview

LogicScope runs on a two-layer architecture: a **Node.js Extension Host** that does the heavy parsing work, and a **sandboxed Webview** that renders diagrams. They communicate exclusively through VS Code's `postMessage` bridge.

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Editor                           │
│  User writes code → onDidChangeTextDocument fires           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼  (debounce: 300ms)
┌─────────────────────────────────────────────────────────────┐
│                Extension Host (Node.js / TypeScript)        │
│                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────────┐ │
│  │   Tree-sitter WASM      │  │   AI Layer (optional)    │ │
│  │  (structural parsing)   │  │  Groq / Gemini / etc.     │ │
│  │                         │  │                          │ │
│  │  • Incremental reparse  │  │  • Concept detection     │ │
│  │  • Class hierarchies    │  │  • Beginner explanations │ │
│  │  • Control flow graph   │  │  • Complexity hints      │ │
│  │  • Call graph           │  │  • Pattern naming        │ │
│  │  • Function signatures  │  │  • Gated by user key     │ │
│  └────────────┬────────────┘  └──────────────┬───────────┘ │
│               │                               │             │
│               └──────────────┬────────────────┘            │
│                              │                              │
│               Diagram Spec JSON (delta only)                │
│     { diagramType, nodes[], edges[], changed[], meta }      │
└──────────────────────────────┬──────────────────────────────┘
                               │  postMessage API
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Webview (sandboxed browser)               │
│                                                             │
│  ┌───────────────────────┐  ┌──────────────────────────┐  │
│  │  Mermaid.js (Phase 1) │  │  React Flow (Phase 2+)   │  │
│  │  Flowcharts           │  │  Interactive node graphs  │  │
│  │  Class diagrams       │  │  Zoomable, clickable      │  │
│  │  Sequence diagrams    │  │  Drag to rearrange        │  │
│  │  Recursion trees      │  │                          │  │
│  └───────────────────────┘  └──────────────────────────┘  │
│                                                             │
│  Animated delta transitions (only changed nodes redraw)     │
└─────────────────────────────────────────────────────────────┘
```

---

## Real-Time Visualization Engine

This is LogicScope's most important feature and the hardest to get right. The goal: from the moment a user types a keystroke to when the diagram updates, the total time must stay under **150ms** for structural changes and **sub-50ms** for minor edits.

### How Real-Time Works

**Step 1 — Change Detection**

VS Code fires `onDidChangeTextDocument` on every keystroke. LogicScope listens to this event but does not immediately act on it.

**Step 2 — Debounce**

A 300ms debounce timer resets on every keystroke. Parsing only begins when the user pauses. This prevents thrashing during fast typing. The debounce delay is user-configurable (100ms–1000ms), and LogicScope auto-raises it temporarily if the last three parses each took longer than 100ms (adaptive debounce), reverting once parses are fast again.

**Step 3 — Incremental Parsing with Tree-sitter**

Tree-sitter's `parser.parse(newCode, oldTree)` API reuses unchanged portions of the previous parse tree. Only the edited subtree is re-parsed. This means editing a function body does not re-parse the entire file — only that function's AST node is updated.

Tree-sitter handles incomplete and syntactically invalid code gracefully, inserting error nodes rather than failing. This is critical for real-time use since code is almost always in a broken state mid-typing.

**Step 4 — Structural Diff**

LogicScope computes a diff between the old diagram spec and the new one. Only changed nodes and edges are included in the update message. If only a function body changed, only that flowchart node is sent — not the entire diagram.

```
Old spec: { nodes: [A, B, C], edges: [A→B, B→C] }
New spec: { nodes: [A, B', C], edges: [A→B', B'→C] }  ← B changed
Delta:    { changed: [B'], updatedEdges: [A→B', B'→C] }
```

**Step 5 — Webview Update via postMessage**

The delta is sent to the webview through VS Code's `panel.webview.postMessage()` call. The webview applies only the changed nodes with a smooth CSS transition (200ms ease), so the diagram feels alive rather than flickering.

**Step 6 — AI Explanation (Async, Decoupled, Opt-In)**

AI is never called automatically and never on every keystroke. It triggers only when:
- The user explicitly clicks the **Explain** button, AND has a valid AI key configured
- The code has been structurally stable for **5 seconds** AND the user has previously enabled "auto-explain on stable code" in settings (off by default)
- A significant structural event is detected (first time a recursive call is found, a new class hierarchy appears) AND auto-explain is enabled

If no AI key is configured, none of these triggers fire — LogicScope silently treats the AI layer as absent. The diagram is fully functional without it.

### Real-Time Performance Budget

| Stage                        | Target Time  |
|------------------------------|--------------|
| Debounce wait                | 300ms        |
| Tree-sitter incremental parse | < 30ms       |
| Structural diff computation  | < 10ms       |
| postMessage transfer         | < 5ms        |
| Webview node redraw          | < 50ms       |
| **Total (keystroke → update)**| **< 150ms** |
| AI explanation fetch (async, opt-in) | 1–3s (Groq) / 1–4s (Gemini) |

### Real-Time Modes

**Auto Mode (default):** Diagram updates automatically as you type after the debounce.

**Manual Mode:** User clicks a Refresh button or runs `LogicScope: Refresh Diagram` command. Useful for slow machines or very large files.

**Snapshot Mode:** Diagram only updates when the file is saved (`Ctrl+S`). Zero performance impact.

All three modes are switchable from the status bar icon.

---

## Parsing Strategy

The hardest problem this extension solves is going from raw text to a meaningful diagram. Two tools handle different parts of this problem.

### Tree-sitter (Structural Layer)

Tree-sitter is what VS Code itself uses for syntax highlighting. It has WASM builds that run inside the extension host (not the webview), supports 40+ languages, and its incremental parsing API is built for exactly this real-time editor use case.

Tree-sitter extracts:
- Class definitions and inheritance chains
- Function signatures and call graphs
- Control flow: `if/else`, `switch`, loops
- Variable declarations and scope
- Return paths

This layer runs on every debounced keystroke and powers the real-time diagram. It requires no setup, no network access, and no API key — it is the foundation of the extension and works completely offline.

### AI Semantic Layer (Optional, BYOK)

Tree-sitter tells you *what the code is*. It cannot tell you *what it means*. Detecting that a class with a `next` pointer pointing to its own type is a linked list node — that requires semantic understanding.

An AI provider handles this, but **only if the user has supplied their own API key**. LogicScope never ships with a built-in key and never proxies requests through an LogicScope-owned server — requests go directly from the user's machine to the provider they chose.

When triggered, the extension sends selected code with a structured prompt:

```
Analyze this [language] code. Identify:
1. Primary concept: recursion / linked list / BFS / inheritance / etc.
2. Diagram type best suited: flowchart / class / tree / graph / sequence
3. Return ONLY JSON, no prose, no markdown fences:

{
  "concept": "binary search",
  "diagramType": "flowchart",
  "nodes": [{ "id": "1", "label": "mid = (lo+hi)/2", "type": "process" }],
  "edges": [{ "from": "1", "to": "2", "label": "target < mid" }],
  "explanation": "...",
  "complexity": { "time": "O(log n)", "space": "O(1)" }
}
```

The AI layer is asynchronous and non-blocking. Diagrams appear from Tree-sitter first; AI enriches them when ready and a key is available.

---

## AI Key Onboarding & Management (BYOK)

This is the core contract LogicScope makes with users: **structural diagrams are always free and instant; AI explanations require the user's own free API key, requested only when they ask for AI.**

### Supported Providers

| Provider | Model                     | Free tier (approx.)            | Notes |
|----------|---------------------------|----------------------------------|-------|
| Groq     | `llama-3.3-70b-versatile`  | 14,400 requests/day              | Fastest, default Phase 1 choice |
| Gemini   | `gemini-2.0-flash` (or current free-tier flash model) | Generous daily free quota | Good fallback, multimodal-ready for future |
| OpenRouter | User-selected free model | Varies by model                | Phase 2+, for users who already have a key |

Provider is a setting (`logicscope.aiProvider`). Users can switch providers without losing their stored key for the previously selected one — each provider's key is stored under its own `SecretStorage` entry.

### Onboarding Flow

1. **First AI-triggering action.** The very first time the user clicks **Explain This Code**, runs `LogicScope: Explain This Code`, or enables auto-explain, LogicScope checks `SecretStorage` for a key matching the configured `logicscope.aiProvider`.

2. **No key found → guided prompt.** Instead of failing silently, LogicScope opens a non-blocking information message:

   > "AI explanations need a free API key from Groq. LogicScope never sees or stores this anywhere except your own VS Code secret storage."
   >
   > **Buttons:** `Get a free key ↗` · `Enter key` · `Not now`

   - `Get a free key ↗` opens the provider's key-creation page in the default browser (e.g. `https://console.groq.com/keys`).
   - `Enter key` opens a VS Code `InputBox` with `password: true` (masked input), placeholder text showing the expected key format (e.g. `gsk_...`), and inline validation hints.
   - `Not now` dismisses the prompt and the diagram remains structural-only. LogicScope remembers this choice for the session so it doesn't re-prompt on every click — but the **Explain** button stays visible and re-triggers the prompt if clicked again later.

3. **Key validation.** On submission, LogicScope makes a minimal, cheap test call (or, where the provider supports it, a key-format check plus a tiny ping request) before saving. Results:
   - **Valid** → key saved to `SecretStorage`, confirmation toast ("AI explanations enabled ✓"), and the originally-requested explanation runs immediately.
   - **Invalid / unauthorized** → inline error in the input box ("This key was rejected by Groq — check for typos or regenerate it"), key is *not* saved, user can retry or cancel.
   - **Network error during validation** → key is saved optimistically with a warning ("Couldn't verify right now — saved anyway, will retry on next use"), since a flaky network shouldn't block setup.

4. **Subsequent uses.** Once a valid key exists, AI features work silently and immediately — no repeated prompts.

### Managing the Key Later

A new command, `LogicScope: Manage AI Key`, opens a quick-pick with:
- **Change provider** — switch between Groq / Gemini / OpenRouter
- **Update key** — re-enter a key for the current provider (overwrites old one)
- **Test current key** — runs the same validation ping and reports status
- **View masked key** — shows e.g. `gsk_••••••••wXyz` so users can confirm which account is active without exposing the full key
- **Remove key** — deletes from `SecretStorage` and reverts to structural-only mode (with confirmation dialog)

This command is also surfaced as a gear icon next to the "Explain" button in the side panel.

### Storage & Privacy Guarantees

- Keys are stored exclusively via VS Code's `SecretStorage` API — never in `settings.json`, never in workspace files, never synced via Settings Sync unless the user's own VS Code account sync is configured to include secrets (standard VS Code behavior, outside LogicScope's control).
- Keys are never logged, never included in error reports/telemetry, and never transmitted anywhere except directly to the selected provider's official API endpoint over HTTPS.
- LogicScope collects no telemetry by default. If diagnostic telemetry is ever added, it will be strictly opt-in and will never include code content, file paths, or key material.
- Code sent to the AI provider is limited to the user's current selection or the function under the cursor — never the whole file — unless the user explicitly runs a project-wide AI command (Phase 3) with a separate confirmation.

### Failure & Degradation Behavior

| Situation | Behavior |
|-----------|----------|
| No key configured | AI buttons remain visible but trigger the onboarding prompt; structural diagrams unaffected |
| Key revoked/expired mid-session | First failed call shows "Your AI key was rejected. [Update key] [Disable AI]"; subsequent calls don't retry until the user acts |
| Rate limit hit | Banner: "AI rate limit reached for today — diagram still shows structural analysis. Try again later or switch providers." Auto-retry after a backoff window |
| Network/provider outage | Diagram renders from Tree-sitter; banner: "AI explanation unavailable. Diagram shows structural analysis only." Auto-retry after 30s, capped at 3 attempts |

---

## Tech Stack

All decisions are final for each phase. No ambiguous "or" choices.

### Extension Host

| Concern               | Tool                                    |
|-----------------------|-----------------------------------------|
| Language              | TypeScript                              |
| VS Code API           | Extension API v1.85+                    |
| AST parsing           | Tree-sitter WASM (`web-tree-sitter`)    |
| Language grammars     | `tree-sitter-python`, `tree-sitter-javascript`, etc. (npm packages) |
| AI provider (default) | Groq API (user-provided key, Phase 1)   |
| AI provider (alt.)    | Gemini API (user-provided key, Phase 2) |
| AI key storage        | VS Code `SecretStorage` API             |
| Debounce utility      | Custom debounce (no lodash dependency) |
| State management      | In-memory `Map<DocumentUri, DiagramSpec>` |

### Webview

| Concern               | Tool                                    |
|-----------------------|-----------------------------------------|
| Diagram rendering (v1) | Mermaid.js (bundled, no CDN)          |
| Diagram rendering (v2) | React Flow (for interactive graphs)   |
| UI framework          | Vanilla HTML/CSS/JS (v1), React (v2+) |
| Animations            | CSS transitions + Web Animations API  |
| Theming               | VS Code CSS variables (`--vscode-*`)  |

### Why Mermaid First

Mermaid renders flowcharts, class diagrams, sequence diagrams, and Gitgraph out of the box via a single string. Zero configuration, zero layout math. It covers everything in Phase 1. React Flow adds interactivity (click nodes, drag to rearrange, zoom) but requires more complex state management — that's a Phase 2 concern.

---

## Feature Set

### Phase 1 — MVP (Target: 6 weeks)

The goal of Phase 1 is to prove the core loop: code typed → diagram appears, with zero setup.

**Languages:** Python, JavaScript only.

**Diagram types:**
- Flowchart (control flow: `if/else`, loops, early returns)
- Class diagram (class definitions, inheritance, methods, attributes)
- Recursion tree (call graph for recursive functions)

**Real-time engine:**
- `onDidChangeTextDocument` listener
- 300ms debounce (adaptive)
- Tree-sitter incremental parse
- Delta postMessage updates
- Mermaid rendering in webview

**UI:**
- Side panel (LogicScope icon in Activity Bar)
- Diagram renders automatically when a `.py` or `.js` file is active
- Status bar toggle: Auto / Manual / Snapshot mode
- Simple explanation panel below diagram (plain text, no AI yet)
- "Try without AI" badge on first run so users know the core feature needs no setup

**Commands:**
- `LogicScope: Open Diagram Panel` — opens the webview
- `LogicScope: Refresh Diagram` — force re-parse current file
- `LogicScope: Toggle Real-Time Mode` — cycle Auto / Manual / Snapshot
- `LogicScope: Explain This Code` — triggers AI explanation (prompts for key if missing)
- `LogicScope: Manage AI Key` — view/change/remove the stored AI key

**Right-click context menu:**
- Visualize Selection
- Visualize This Function
- Explain This Block (AI)

**Export:**
- Copy diagram as Mermaid source (one click)
- Export PNG (via Mermaid's built-in export)

---

### Phase 2 — Interactive (Target: 4 weeks after Phase 1)

**Languages added:** Java, C++, TypeScript

**New diagram types:**
- Linked list node map (detect `Node` class with `next` pointer pattern)
- Binary tree traversal (detect recursive tree traversal patterns)
- Array state timeline (show array mutations step by step)
- Stack / queue visualization (detect push/pop, enqueue/dequeue patterns)
- Inheritance tree (multi-level class hierarchy)
- Object relationship diagram (composition, aggregation)

**Interactive diagrams:**
- Migrate from Mermaid to React Flow for node-based diagrams
- Click a node → see the corresponding code highlighted in editor
- Click a code line → highlight corresponding node in diagram
- Zoom in/out with mouse wheel
- Drag nodes to rearrange layout
- Expand/collapse nested structures

**AI integration (full, still BYOK):**
- AI enriches every diagram with concept name, explanation, complexity — only when a key is present
- Beginner / Advanced mode toggle (affects AI explanation verbosity)
- AI detects DSA pattern and labels the diagram automatically
- Asynchronous: diagram appears from Tree-sitter first, AI overlay adds after
- Gemini added as a selectable provider alongside Groq via `LogicScope: Manage AI Key`

**Real-time improvements:**
- Smart AI trigger: only calls AI when structural signature changes (not on every debounce)
- Structural signature = hash of `{ classes[], functions[], patterns[] }` — only re-call AI when this hash changes
- Incremental React Flow node updates (add/remove/update individual nodes, not full re-render)

**Export additions:**
- Export SVG
- Export PDF
- Export Markdown with embedded diagram

---

### Phase 3 — Smart Features (Ongoing after Phase 2)

**Languages added:** C, C#, Go, Rust, PHP

**Step-by-step execution (static snapshots):**

Rather than live code execution (which requires language runtimes), LogicScope generates a sequence of diagram states representing algorithm progress. For example, a bubble sort function produces 10 diagram snapshots showing the array state after each swap. Users step through them with Previous / Next buttons.

This is feasible without a runtime because the sequence is AI-generated, not execution-traced — and therefore also requires a configured AI key, with a clear note in the UI before the first use.

**Quiz Mode:**
After a diagram is generated, LogicScope presents questions alongside it:
- "What happens when the base case is reached?"
- "Which node is visited next in this BFS?"
- "What does this class inherit from?"

Answers are evaluated by AI (key required); if no key is present, Quiz Mode shows a one-time explainer card on how to enable it via `LogicScope: Manage AI Key`.

**Compare Mode:**
Show raw code and diagram side by side in a split view. As the cursor moves through code, the corresponding diagram node highlights. No AI required.

**Graph traversal animation:**
For BFS/DFS code, animate the traversal path across the graph node by node. Each step is a diagram snapshot stored in memory, playable at configurable speed (0.5x, 1x, 2x). No AI required — purely structural.

**Project-wide analysis:**
Analyze multiple files to generate cross-file class diagrams and dependency graphs. Triggered manually (not real-time, too expensive). If AI enrichment is requested for project-wide analysis, LogicScope shows an explicit confirmation listing how many files' code will be sent to the AI provider before proceeding.

**Heap visualization:**
Detect min-heap/max-heap operations and render the heap tree with highlighted swap operations.

---

## Diagram Types Reference

### DSA Diagrams

| Code Pattern Detected              | Diagram Generated              |
|------------------------------------|-------------------------------|
| `if/else`, `switch`, early return  | Flowchart                     |
| `for`, `while`, `do-while` loops   | Loop flow visualization       |
| Recursive function calls           | Recursion tree                |
| Function call graph                | Call stack diagram            |
| Array indexed access + mutation    | Array state timeline          |
| Class with `next` pointer          | Linked list node map          |
| Recursive tree traversal           | Tree traversal diagram        |
| BFS / DFS pattern                  | Graph traversal diagram       |
| `push`/`pop` pattern               | Stack visualization           |
| `enqueue`/`dequeue` pattern        | Queue visualization           |
| Sorting loop with swap             | Sorting animation (snapshots) |
| Memoization dict + recursion       | DP table + recursion tree     |
| Min/max heap operations            | Heap tree diagram             |

### OOPs Diagrams

| Code Pattern Detected              | Diagram Generated              |
|------------------------------------|-------------------------------|
| Class definitions                  | UML class diagram             |
| `extends` / `implements`           | Inheritance tree               |
| Object instantiation               | Object diagram                |
| Has-a relationship (field types)   | Composition / aggregation     |
| Method calls between objects       | Sequence diagram               |
| Abstract class / interface         | Interface diagram             |
| Override methods                   | Polymorphism diagram          |
| Dependency injection               | Dependency graph               |

---

## Learning Modes

### Beginner Mode
- Simple labels on all nodes (plain English, no jargon)
- Fewer nodes (collapses trivial steps)
- AI explanation uses analogies and step-by-step narration (when AI is enabled)
- Concept name shown prominently above the diagram
- Complexity hints hidden by default

### Advanced Mode
- Full execution trace with all branching paths
- Variable type annotations on edges
- Time and space complexity shown
- Deeper object relationship detail
- AI explanation uses technical terminology (when AI is enabled)

### Quiz Mode
- After diagram renders, a question card appears below it (requires AI key)
- Questions target the specific concept in the diagram
- Correct answer highlights the relevant node in the diagram
- Wrong answer shows the AI explanation for that step
- Progress tracked per concept in VS Code global state (stored locally, never transmitted)

### Compare Mode
- Two-panel layout: code left, diagram right
- Cursor position in code highlights the matching diagram node
- Useful for lecture demos and self-study
- Works fully without AI

---

## UI / UX Design

### Activity Bar Panel

The LogicScope icon in the VS Code Activity Bar opens the side panel containing:
- Active file name and detected language badge
- Diagram type selector (auto-detected by default, overridable)
- Mode selector: Beginner / Advanced
- Real-time toggle: Auto / Manual / Snapshot
- Explain button (triggers AI call, or onboarding prompt if no key yet)
- AI status indicator (small dot: grey = no key, green = key active, red = last call failed)
- Step controls: Previous / Next (Phase 3 execution steps)
- Explanation text area (AI output, updates asynchronously)

### Webview Diagram Panel

Opens as a VS Code editor panel (not sidebar), positioned beside the active editor in a split layout. Contains:
- Diagram canvas (Mermaid v1, React Flow v2)
- Zoom controls (+ / − / fit to screen)
- Export menu (PNG / SVG / PDF / Mermaid source)
- Node detail card (appears on click, shows code reference)
- Loading indicator while AI fetches explanation

### Status Bar Item

A small `$(graph) LogicScope: Auto` item in the status bar shows the current real-time mode. Clicking cycles between Auto → Manual → Snapshot. A second optional status bar item, `$(key) AI: Off/On`, shows AI key status and opens `LogicScope: Manage AI Key` when clicked.

### Editor Decorations

When a user clicks a node in the diagram, LogicScope highlights the corresponding code range in the editor with a subtle background gutter decoration. Clicking a code line highlights the corresponding node.

### Theme Support

All colors derive from VS Code's built-in CSS variables (`--vscode-editor-background`, `--vscode-foreground`, `--vscode-button-background`, etc.). Dark mode, light mode, and high-contrast themes are all automatically supported with zero additional CSS.

### Accessibility

- All diagram nodes have `aria-label` equivalents available in a collapsible text outline view, so screen reader users can navigate the diagram structure without relying on the canvas.
- Keyboard navigation: Tab/Arrow keys move focus between diagram nodes; Enter opens the node detail card.
- Color is never the sole signal — node types are also distinguished by shape/icon for colorblind users.

---

## Language Support Roadmap

| Phase   | Languages                                          | Notes                          |
|---------|----------------------------------------------------|-------------------------------|
| Phase 1 | Python, JavaScript                                | 80% of DSA learners use these |
| Phase 2 | Java, C++, TypeScript                             | Interview prep + CS courses   |
| Phase 3 | C, C#, Go, Rust, PHP                              | Broader developer audience    |

Each language requires its own Tree-sitter grammar npm package and a pattern library (mappings from AST node types to diagram types). Java and C++ grammars are the most complex due to generics and templates.

---

## Performance Considerations

### Debounce Configuration

The default 300ms debounce is a balance between responsiveness and CPU usage. Users with fast machines can lower it to 100ms. Users on slower hardware or editing large files should set it to 500–1000ms. Configurable in VS Code settings under `logicscope.debounceMs`. The adaptive debounce (see Real-Time Engine) handles most cases automatically.

### File Size Limits

Files over 500 lines trigger a warning banner: "Large file detected. Real-time mode switched to Snapshot for performance." The user can override this. Files over 2000 lines disable real-time entirely and require a manual refresh.

### AI Call Caching

AI responses are cached in-memory using the structural signature (a hash of detected classes, functions, and patterns) as the key. If the user types, deletes, and re-types the same code, the cached explanation is returned instantly without a new API call — this also conserves the user's free-tier quota.

### Diagram Caching

Parsed diagram specs are stored per document URI. Switching between open files instantly restores the last diagram for that file without re-parsing.

### Memory Management

When a document is closed, its cached diagram spec and AI response are removed from memory. The webview panel is not destroyed (too slow to recreate) but is cleared and marked idle.

---

## Webview Security

VS Code webviews run in a sandboxed iframe with a strict Content Security Policy. LogicScope must follow these rules:

- All scripts (Mermaid.js, React Flow) are **bundled locally** — no CDN. The CSP does not allow `script-src *`.
- Every script tag includes a CSP nonce provided by VS Code: `<script nonce="${nonce}">`.
- `postMessage` messages include an origin check to prevent spoofing.
- No `eval()` usage (blocked by CSP).
- The webview's `localResourceRoots` is locked to the extension's `media/` directory only.
- The webview never has direct network access or access to `SecretStorage` — all AI calls happen in the extension host, and only the resulting JSON is passed to the webview.

---

## Settings Reference

```json
{
  "logicscope.debounceMs": 300,
  "logicscope.realTimeMode": "auto",
  "logicscope.learningMode": "beginner",
  "logicscope.aiEnabled": true,
  "logicscope.aiProvider": "groq",
  "logicscope.aiModel": "llama-3.3-70b-versatile",
  "logicscope.autoExplainOnStableCode": false,
  "logicscope.fileSizeWarningLines": 500,
  "logicscope.diagramTheme": "auto"
}
```

Note: AI API keys are **never** stored in `settings.json` — only the provider/model choice lives here. Keys live exclusively in `SecretStorage`, managed via `LogicScope: Manage AI Key`.

---

## Error Handling

### Incomplete Code (During Typing)

Tree-sitter is error-tolerant by design. It inserts `ERROR` nodes into the AST for invalid syntax and continues parsing the rest of the file. LogicScope ignores `ERROR` nodes and renders the diagram from valid portions only. No error messages appear during normal typing.

### AI Failure

See the **Failure & Degradation Behavior** table above for the full matrix (no key, revoked key, rate limit, outage). In every case, the Tree-sitter diagram continues to render normally.

### Unsupported Language

If the active file's language is not supported, the LogicScope panel shows: "LogicScope doesn't support [language] yet. Supported: Python, JavaScript." No parsing is attempted.

### Empty or Trivial File

Files with fewer than 3 meaningful lines of code show a placeholder: "Write some code and the diagram will appear here."

---

## Export Options

| Format          | Method                              | Phase |
|-----------------|-------------------------------------|-------|
| Mermaid source  | Copy to clipboard                   | 1     |
| PNG             | Mermaid built-in export             | 1     |
| SVG             | Mermaid built-in export             | 2     |
| PDF             | Browser print API in webview        | 2     |
| Markdown        | Embed diagram as code block + image | 2     |

---

## Development Roadmap

### Phase 1 — 6 Weeks

| Week | Deliverable                                                |
|------|------------------------------------------------------------|
| 1    | Extension scaffold, `onDidChangeTextDocument`, debounce    |
| 2    | Tree-sitter WASM integration, Python + JS grammars         |
| 3    | Flowchart generation from AST, Mermaid webview             |
| 4    | Class diagram generation, real-time delta updates          |
| 5    | Recursion tree, explanation panel, right-click menu, AI key onboarding flow |
| 6    | PNG export, status bar toggle, key management command, VS Code Marketplace prep |

### Phase 2 — 4 Weeks After Phase 1 Ships

| Week | Deliverable                                                |
|------|------------------------------------------------------------|
| 7    | Multi-provider AI support (Groq + Gemini), concept detection, async overlay |
| 8    | React Flow migration, interactive nodes, code↔diagram sync |
| 9    | DSA pattern library (linked list, tree, stack, queue)      |
| 10   | Java + C++ grammar support, Beginner/Advanced toggle       |

### Phase 3 — Ongoing

| Milestone | Feature                                              |
|-----------|--------------------------------------------------------|
| 3.1       | Step-by-step static snapshots (AI-generated)         |
| 3.2       | Quiz Mode                                            |
| 3.3       | Compare Mode (code + diagram split)                  |
| 3.4       | TypeScript, C, C# language support                   |
| 3.5       | Project-wide cross-file class diagram (with AI confirmation dialog) |
| 3.6       | Graph traversal animation                            |
| 3.7       | Go, Rust, PHP support                               |

---

## Minimum Viable Version Checklist

Before Phase 1 ships to the VS Code Marketplace, these must all be true:

- [ ] Real-time diagram updates on code edit (debounced, < 150ms)
- [ ] Python and JavaScript fully supported
- [ ] Flowchart, class diagram, recursion tree working
- [ ] Mermaid webview renders correctly in dark and light themes
- [ ] Extension activates only for supported file types (no overhead otherwise)
- [ ] File size guard (> 500 lines → Snapshot mode auto)
- [ ] PNG export functional
- [ ] Status bar mode toggle working
- [ ] AI key onboarding prompt appears only on first AI-triggering action, with working "Get a free key" link
- [ ] `LogicScope: Manage AI Key` command works (view/update/remove/test)
- [ ] No uncaught exceptions on invalid / incomplete code
- [ ] No AI key ever appears in logs, telemetry, or `settings.json`
- [ ] VS Code Marketplace listing with screenshots and demo GIF, including a screenshot of the no-AI experience

---

## What Makes LogicScope Different

Most code visualizers are static — you paste code, click a button, see a diagram. LogicScope is the only VS Code extension that:

- Updates the diagram as you type, in real time, with sub-150ms latency
- Uses incremental AST parsing (Tree-sitter) so large files stay fast
- Combines structural parsing with optional AI semantic understanding
- Supports both DSA and OOPs visualization in one tool
- Is fully useful with zero setup, and offers AI as a clearly-explained, user-controlled, BYOK opt-in — never a paywall, never a hidden cost
- Bidirectionally syncs code cursor position with diagram node highlighting

---

## Future Vision

The long-term goal is for LogicScope to feel like a visual tutor that is always watching and always ready to explain. A student should be able to open any DSA problem solution, and within seconds see exactly what data structure is being used, how the algorithm flows through it, and why — and if they want a deeper AI-powered explanation, getting their own free key takes under a minute.

Future directions include a classroom mode where teachers project diagrams during live coding sessions, a share-to-web feature that exports a diagram link, a built-in AI chat sidebar for asking follow-up questions about the diagram (BYOK, same onboarding pattern), and integration with LeetCode and Codeforces problem sets to auto-label which algorithm pattern a solution uses.

The standard for every new feature: would this help someone say *"Now I finally understand what this code is doing"*? If yes, it belongs in LogicScope.
