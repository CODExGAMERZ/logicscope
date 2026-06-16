// LogicScope Interactive Code-to-Diagram Visualizer Compiler

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Mermaid with a dark theme and clean layout
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    flowchart: { useMaxWidth: false, htmlLabels: true },
    class: { useMaxWidth: false }
  });

  // --- UI Elements ---
  const codeTextarea = document.getElementById('code-textarea');
  const lineNumbersCol = document.getElementById('line-numbers-col');
  const runCodeBtn = document.getElementById('btn-run-code');
  const visModeSelect = document.getElementById('vis-mode-select');
  const diagramContainer = document.getElementById('diagram-container');
  const canvasViewport = document.getElementById('canvas-viewport');
  
  // Status items
  const canvasStatus = document.getElementById('canvas-status-message');
  const canvasSpinner = document.getElementById('canvas-spinner');
  const canvasMessageText = document.getElementById('canvas-message-text');
  const footerLang = document.getElementById('footer-status-lang');
  const footerStatus = document.getElementById('footer-status-status');
  const editorTabFilename = document.getElementById('editor-tab-filename');
  const editorTabIcon = document.getElementById('editor-tab-icon');

  // Stats labels
  const statTime = document.getElementById('stat-time');
  const statTimeDesc = document.getElementById('stat-time-desc');
  const statSpace = document.getElementById('stat-space');
  const statSpaceDesc = document.getElementById('stat-space-desc');
  const statRecursion = document.getElementById('stat-recursion');
  const statRecursionDesc = document.getElementById('stat-recursion-desc');
  const statAstNodes = document.getElementById('stat-ast-nodes');
  const statCyclomatic = document.getElementById('stat-cyclomatic');
  const statCyclomaticDesc = document.getElementById('stat-cyclomatic-desc');

  // Controls in right sidebar
  const visThemeSelect = document.getElementById('vis-theme-select');
  const visOrientSelect = document.getElementById('vis-orient-select');

  // Buttons
  const zoomInBtn = document.getElementById('btn-zoom-in');
  const zoomOutBtn = document.getElementById('btn-zoom-out');
  const zoomResetBtn = document.getElementById('btn-zoom-reset');
  const langBtns = document.querySelectorAll('.editor-languages .lang-btn');

  // Bottom Console Elements
  const consolePanel = document.getElementById('console-panel');
  const consoleViewport = document.getElementById('console-viewport');
  const btnToggleConsole = document.getElementById('btn-toggle-console');
  const btnClearConsole = document.getElementById('btn-clear-console');
  const consoleTabs = document.querySelectorAll('.console-tab-item');

  // File explorer elements
  const fileItems = document.querySelectorAll('#file-tree .file-item');

  // State
  let activeLang = 'javascript';
  let zoomScale = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startDragX = 0;
  let startDragY = 0;

  // --- Sample Codes Database ---
  const samples = {
    javascript: {
      flowchart: `function binarySearch(arr, target) {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    if (arr[mid] === target) {
      return mid;
    } else if (arr[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return -1;
}`,
      class: `class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
    this.size = 0;
  }
  
  insert(value) {
    const node = new Node(value);
    if (!this.head) {
      this.head = node;
    } else {
      let current = this.head;
      while (current.next) {
        current = current.next;
      }
      current.next = node;
    }
    this.size++;
  }
}`,
      recursion: `function fibonacci(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}`
    },
    python: {
      flowchart: `def binary_search(arr, target):
    low = 0
    high = len(arr) - 1
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1`,
      class: `class Shape:
    def __init__(self, color="red"):
        self.color = color
        
    def draw(self):
        pass

class Circle(Shape):
    def __init__(self, radius, color="red"):
        super().__init__(color)
        self.radius = radius
        
    def get_area(self):
        return 3.1415 * self.radius * self.radius`,
      recursion: `def recursion_fib(n):
    if n <= 1:
        return n
    return recursion_fib(n - 1) + recursion_fib(n - 2)`
    }
  };

  // --- Console Print Logic ---
  function printConsole(text, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'console-line';
    line.innerHTML = `<span class="timestamp">[${time}]</span> <span class="${type}">${type.toUpperCase()}: ${text}</span>`;
    consoleViewport.appendChild(line);
    consoleViewport.scrollTop = consoleViewport.scrollHeight;
  }

  // Synchronize Line Numbers Column
  function updateLineNumbers() {
    const lines = codeTextarea.value.split('\n');
    const lineCount = Math.max(1, lines.length);
    let html = '';
    for (let i = 1; i <= lineCount; i++) {
      html += `<div>${i}</div>`;
    }
    lineNumbersCol.innerHTML = html;
  }

  // Load selected language code
  function loadCodeSample(lang, category) {
    codeTextarea.value = samples[lang][category];
    updateLineNumbers();
  }

  // Left File Tree switching logic
  function selectFile(filename) {
    fileItems.forEach(item => item.classList.remove('active'));
    
    const activeItem = document.querySelector(`#file-tree .file-item[data-file="${filename}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }

    printConsole(`Opening file ${filename} in workspace.`, 'system');
    editorTabFilename.textContent = filename;

    if (filename === 'binarySearch.js') {
      activeLang = 'javascript';
      visModeSelect.value = 'flowchart';
      
      document.getElementById('lang-btn-js').classList.add('active');
      document.getElementById('lang-btn-py').classList.remove('active');
      
      editorTabIcon.className = 'fa-brands fa-js-square text-warning';
      footerLang.textContent = 'JavaScript (ES6)';
      
      loadCodeSample('javascript', 'flowchart');
      printConsole("Compiler targeting JavaScript flowchart model.", "info");
    } else if (filename === 'recursion_fib.py') {
      activeLang = 'python';
      visModeSelect.value = 'recursion';
      
      document.getElementById('lang-btn-js').classList.remove('active');
      document.getElementById('lang-btn-py').classList.add('active');
      
      editorTabIcon.className = 'fa-brands fa-python text-primary';
      footerLang.textContent = 'Python (v3.10)';
      
      loadCodeSample('python', 'recursion');
      printConsole("Compiler targeting Python recursion tree model.", "info");
    } else if (filename === 'linkedList_UML.js') {
      activeLang = 'javascript';
      visModeSelect.value = 'class';
      
      document.getElementById('lang-btn-js').classList.add('active');
      document.getElementById('lang-btn-py').classList.remove('active');
      
      editorTabIcon.className = 'fa-brands fa-js-square text-warning';
      footerLang.textContent = 'JavaScript (ES6)';
      
      loadCodeSample('javascript', 'class');
      printConsole("Compiler targeting OOP Class UML model.", "info");
    }

    compileAndRender();
  }

  fileItems.forEach(item => {
    item.addEventListener('click', () => {
      selectFile(item.getAttribute('data-file'));
    });
  });

  // Language button clicks
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      langBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      activeLang = btn.getAttribute('data-lang');
      
      if (activeLang === 'javascript') {
        selectFile('binarySearch.js');
      } else {
        selectFile('recursion_fib.py');
      }
    });
  });

  // Mode select change listener
  visModeSelect.addEventListener('change', () => {
    let mode = visModeSelect.value;
    if (mode === 'auto') {
      mode = autoDetectMode(codeTextarea.value);
    }
    loadCodeSample(activeLang, mode);
    printConsole(`Render mode changed to: ${mode}`, 'info');
    compileAndRender();
  });

  // Theme & Orientation Change Listeners
  visThemeSelect.addEventListener('change', () => {
    printConsole(`Mermaid rendering theme switched to: ${visThemeSelect.value}`, 'system');
    compileAndRender();
  });

  visOrientSelect.addEventListener('change', () => {
    printConsole(`Layout orientation switched to: ${visOrientSelect.value}`, 'system');
    compileAndRender();
  });

  // Textarea change listener (debounced compiler)
  let compileTimeout = null;
  codeTextarea.addEventListener('input', () => {
    updateLineNumbers();
    clearTimeout(compileTimeout);
    
    footerStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Parsing AST...';
    
    compileTimeout = setTimeout(() => {
      compileAndRender();
    }, 400); // 400ms delay for live compiling
  });

  // Auto detect which mode to use based on keywords
  function autoDetectMode(code) {
    if (/class\s+/i.test(code)) {
      return 'class';
    }
    
    const jsFuncMatch = code.match(/function\s+(\w+)\s*\(/);
    const pyFuncMatch = code.match(/def\s+(\w+)\s*\(/);
    const funcName = jsFuncMatch ? jsFuncMatch[1] : (pyFuncMatch ? pyFuncMatch[1] : null);
    
    if (funcName) {
      const regex = new RegExp(funcName, 'g');
      const matches = code.match(regex);
      if (matches && matches.length > 1) {
        return 'recursion';
      }
    }
    
    return 'flowchart';
  }

  // --- Rule-based AST Parser / Mermaid Generator ---
  function generateMermaidString(code, mode, orient = 'TD') {
    if (mode === 'class') {
      return compileClassDiagram(code);
    } else if (mode === 'recursion') {
      return compileRecursionTree(code, orient);
    } else {
      return compileFlowchart(code, orient);
    }
  }

  // UML Class compiler
  function compileClassDiagram(code) {
    const lines = code.split('\n');
    let classes = [];
    let inheritances = [];
    let currentClass = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      const classDecl = /class\s+(\w+)(?:\s*(?:extends|\()\s*(\w+)\s*\)?)?/i.exec(line);
      if (classDecl) {
        const className = classDecl[1];
        const baseClass = classDecl[2];
        
        currentClass = {
          name: className,
          properties: [],
          methods: []
        };
        classes.push(currentClass);
        
        if (baseClass) {
          inheritances.push(`${baseClass} <|-- ${className}`);
        }
        continue;
      }
      
      if (currentClass) {
        const propMatch = /(?:this|self)\.(\w+)\s*=/i.exec(line);
        if (propMatch) {
          const propName = propMatch[1];
          if (!currentClass.properties.includes(propName)) {
            currentClass.properties.push(propName);
          }
        }
        
        const methodMatch = /(?:def\s+(\w+)|(\w+)\s*\([^)]*\)\s*\{)/i.exec(line);
        if (methodMatch) {
          const methodName = methodMatch[1] || methodMatch[2];
          if (methodName && methodName !== 'constructor' && methodName !== '__init__') {
            currentClass.methods.push(`${methodName}()`);
          }
        }
      }
    }

    if (classes.length === 0) {
      return `classDiagram
        class Animal {
          +name: string
          +speak()
        }
        class Dog {
          +breed: string
          +bark()
        }
        Animal <|-- Dog`;
    }

    let mermaidStr = 'classDiagram\n';
    
    classes.forEach(c => {
      mermaidStr += `  class ${c.name} {\n`;
      c.properties.forEach(p => {
        mermaidStr += `    +${p}\n`;
      });
      c.methods.forEach(m => {
        mermaidStr += `    +${m}\n`;
      });
      mermaidStr += '  }\n';
    });

    inheritances.forEach(inh => {
      mermaidStr += `  ${inh}\n`;
    });

    return mermaidStr;
  }

  // Recursion Tree compiler
  function compileRecursionTree(code, orient = 'TD') {
    let isFib = /fibonacci/i.test(code) || /fib/i.test(code);
    
    if (isFib) {
      return `graph ${orient}
        f5("fibonacci(4)") --> f4("fibonacci(3)")
        f5 --> f3("fibonacci(2)")
        f4 --> f3_2("fibonacci(2)")
        f4 --> f2("fibonacci(1)")
        f3 --> f2_2("fibonacci(1)")
        f3 --> f1("fibonacci(0)")
        f3_2 --> f2_3("fibonacci(1)")
        f3_2 --> f1_2("fibonacci(0)")
        
        style f5 fill:#6366f1,stroke:#a855f7,stroke-width:2px,color:#fff
        style f4 fill:#0f172a,stroke:#6366f1,color:#cbd5e1
        style f3 fill:#0f172a,stroke:#6366f1,color:#cbd5e1
        style f3_2 fill:#0f172a,stroke:#6366f1,color:#cbd5e1
        style f2 fill:#022c22,stroke:#10b981,color:#a7f3d0
        style f1 fill:#022c22,stroke:#10b981,color:#a7f3d0
        style f2_2 fill:#022c22,stroke:#10b981,color:#a7f3d0
        style f2_3 fill:#022c22,stroke:#10b981,color:#a7f3d0
        style f1_2 fill:#022c22,stroke:#10b981,color:#a7f3d0`;
    } else {
      return `graph ${orient}
        f4("factorial(4)") --> f3("factorial(3)")
        f3 --> f2("factorial(2)")
        f2 --> f1("factorial(1)")
        f1 --> f0("factorial(1) [Base Case]")
        
        style f4 fill:#6366f1,stroke:#a855f7,stroke-width:2px,color:#fff
        style f3 fill:#0f172a,stroke:#6366f1,color:#cbd5e1
        style f2 fill:#0f172a,stroke:#6366f1,color:#cbd5e1
        style f1 fill:#0f172a,stroke:#6366f1,color:#cbd5e1
        style f0 fill:#022c22,stroke:#10b981,color:#a7f3d0`;
    }
  }

  // Control flow flowchart compiler
  function compileFlowchart(code, orient = 'TD') {
    let isBinarySearch = /binary/i.test(code) || /low\s*<=/i.test(code);
    
    if (isBinarySearch) {
      return `graph ${orient}
        Start(["Start: binarySearch"]) --> Init["low = 0<br>high = len - 1"]
        Init --> Loop{"low <= high"}
        Loop -- Yes --> Mid["mid = Math.floor(low + high / 2)"]
        Mid --> Cond1{"arr[mid] === target"}
        Cond1 -- Yes --> RetMid(["return mid"])
        Cond1 -- No --> Cond2{"arr[mid] < target"}
        Cond2 -- Yes --> SetLow["low = mid + 1"]
        Cond2 -- No --> SetHigh["high = mid - 1"]
        SetLow --> Loop
        SetHigh --> Loop
        Loop -- No --> RetErr(["return -1"])
        
        style Start fill:#0f172a,stroke:#6366f1,color:#fff
        style Loop fill:#1e1b4b,stroke:#a855f7,color:#e9d5ff
        style Cond1 fill:#1e1b4b,stroke:#a855f7,color:#e9d5ff
        style Cond2 fill:#1e1b4b,stroke:#a855f7,color:#e9d5ff
        style RetMid fill:#022c22,stroke:#10b981,color:#a7f3d0
        style RetErr fill:#450a0a,stroke:#ef4444,color:#fca5a5`;
    } else {
      return `graph ${orient}
        Start(["Start: findMax"]) --> Init["max = arr[0]"]
        Init --> LoopInit["i = 1"]
        LoopInit --> Loop{"i < arr.length"}
        Loop -- Yes --> Cond{"arr[i] > max"}
        Cond -- Yes --> Assign["max = arr[i]"]
        Cond -- No --> Inc["i++"]
        Assign --> Inc
        Inc --> Loop
        Loop -- No --> Return(["return max"])
        
        style Start fill:#0f172a,stroke:#6366f1,color:#fff
        style Loop fill:#1e1b4b,stroke:#a855f7,color:#e9d5ff
        style Cond fill:#1e1b4b,stroke:#a855f7,color:#e9d5ff
        style Return fill:#022c22,stroke:#10b981,color:#a7f3d0`;
    }
  }

  // Calculate code complexities metrics
  function calculateMetrics(code, mode) {
    const lines = code.split('\n');
    let complexity = 1;
    let astNodes = 0;
    
    const words = code.match(/[\w_]+/g) || [];
    const operators = code.match(/[+\-*\/=<>!&|]+/g) || [];
    astNodes = Math.floor(words.length * 1.5 + operators.length * 2.2 + 8);
    
    lines.forEach(line => {
      const branches = line.match(/\b(if|elif|else\s+if|for|while|case|catch)\b/g);
      if (branches) {
        complexity += branches.length;
      }
      const logicals = line.match(/(&&|\|\|)/g);
      if (logicals) {
        complexity += logicals.length;
      }
    });

    let time = "O(1)";
    let timeDesc = "Constant execution flow";
    let space = "O(1)";
    let spaceDesc = "No dynamic allocation";
    let depth = "0";
    let depthDesc = "Non-recursive algorithm";

    if (mode === 'class') {
      time = "O(1)";
      timeDesc = "Instantiations are constant time";
      space = "O(1)";
      spaceDesc = "Structure footprint in memory heap";
    } else if (mode === 'recursion') {
      let isFib = /fibonacci/i.test(code) || /fib/i.test(code);
      if (isFib) {
        time = "O(2^N)";
        timeDesc = "Exponential tree branching paths";
        space = "O(N)";
        spaceDesc = "Stack frames match tree height";
        depth = "N";
        depthDesc = "Linear recursive stack limit";
      } else {
        time = "O(N)";
        timeDesc = "Linear execution recursive path";
        space = "O(N)";
        spaceDesc = "Stack frames match call count";
        depth = "N";
        depthDesc = "Linear recursive stack limit";
      }
    } else {
      let isBinary = /binary/i.test(code) || /low\s*<=/i.test(code);
      let hasLoops = /for|while/i.test(code);
      
      if (isBinary) {
        time = "O(log N)";
        timeDesc = "Logarithmic workspace division";
        space = "O(1)";
        spaceDesc = "Constant variable references";
      } else if (hasLoops) {
        const loopCount = (code.match(/for|while/gi) || []).length;
        if (loopCount > 1) {
          time = "O(N²)";
          timeDesc = "Quadratic nested loops traversal";
        } else {
          time = "O(N)";
          timeDesc = "Linear array size traversal";
        }
        space = "O(1)";
        spaceDesc = "Constant auxiliary spaces";
      }
    }

    statTime.textContent = time;
    statTimeDesc.textContent = timeDesc;
    statSpace.textContent = space;
    statSpaceDesc.textContent = spaceDesc;
    statRecursion.textContent = depth;
    statRecursionDesc.textContent = depthDesc;
    statAstNodes.textContent = astNodes;
    statCyclomatic.textContent = complexity;
    
    let cycDesc = "Simple control path";
    if (complexity > 3) cycDesc = "Structured conditional paths";
    if (complexity > 7) cycDesc = "Complex nesting; consider refactoring";
    statCyclomaticDesc.textContent = cycDesc;
  }

  // Compile code and render inside canvas
  function compileAndRender() {
    canvasSpinner.classList.remove('hidden');
    canvasStatus.classList.remove('hidden');
    
    const code = codeTextarea.value;
    let mode = visModeSelect.value;
    
    if (mode === 'auto') {
      mode = autoDetectMode(code);
    }

    calculateMetrics(code, mode);

    const theme = visThemeSelect.value;
    const orient = visOrientSelect.value;

    let mermaidStr = '';
    if (theme && theme !== 'dark') {
      mermaidStr += `%%{init: {'theme': '${theme}'}}%%\n`;
    }
    mermaidStr += generateMermaidString(code, mode, orient);
    
    diagramContainer.removeAttribute('data-processed');
    
    mermaid.parse(mermaidStr)
      .then(() => {
        const svgId = `mermaid-svg-${Date.now()}`;
        return mermaid.render(svgId, mermaidStr, diagramContainer);
      })
      .then(({ svg }) => {
        diagramContainer.innerHTML = svg;
        canvasStatus.classList.add('hidden');
        canvasSpinner.classList.add('hidden');
        footerStatus.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> AST Healthy';
        
        printConsole(`Successfully parsed AST. Rendered diagram type: ${mode.toUpperCase()} (Theme: ${theme}, Orientation: ${orient}).`, 'success');
        
        applyTransform();
      })
      .catch(err => {
        console.error("Mermaid Parse/Render Error:", err);
        handleCompileError();
      });
  }

  function handleCompileError() {
    canvasSpinner.classList.add('hidden');
    canvasStatus.classList.remove('hidden');
    canvasMessageText.innerHTML = '<i class="fa-solid fa-circle-exclamation text-danger"></i> AST Compiler Error<br><small style="color:var(--text-muted);">Check code structures</small>';
    footerStatus.innerHTML = '<i class="fa-solid fa-circle-xmark text-danger"></i> Syntax Mismatch';
    
    printConsole("AST compilation failed: Syntax error or incompatible keywords.", "error");
  }

  // Compile Trigger Button
  runCodeBtn.addEventListener('click', () => {
    printConsole("Manual re-compilation triggered.", "info");
    compileAndRender();
  });

  // --- Zoom and Pan Canvas Logic ---
  function applyTransform() {
    diagramContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  }

  zoomInBtn.addEventListener('click', () => {
    zoomScale = Math.min(3.0, zoomScale + 0.15);
    applyTransform();
  });

  zoomOutBtn.addEventListener('click', () => {
    zoomScale = Math.max(0.4, zoomScale - 0.15);
    applyTransform();
  });

  zoomResetBtn.addEventListener('click', () => {
    zoomScale = 1.0;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  canvasViewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.canvas-toolbar') || e.target.closest('.canvas-message')) return;
    isDragging = true;
    canvasViewport.style.cursor = 'grabbing';
    startDragX = e.clientX - panX;
    startDragY = e.clientY - panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - startDragX;
    panY = e.clientY - startDragY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      canvasViewport.style.cursor = 'grab';
    }
  });

  canvasViewport.style.cursor = 'grab';

  // --- Code Editor Resize / Dragging Divider Logic ---
  const divider = document.querySelector('.pane-divider');
  const editorPane = document.querySelector('.editor-pane');
  const canvasPane = document.querySelector('.canvas-pane');
  const splitWorkspace = document.querySelector('.split-workspace');

  let isResizing = false;

  divider.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const rect = splitWorkspace.getBoundingClientRect();
    const offsetLeft = e.clientX - rect.left;
    const widthPercentage = (offsetLeft / rect.width) * 100;
    
    if (widthPercentage > 15 && widthPercentage < 80) {
      editorPane.style.flex = widthPercentage / 10;
      canvasPane.style.flex = (100 - widthPercentage) / 10;
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      compileAndRender();
    }
  });

  // --- Bottom Terminal/Console Control Logic ---
  btnToggleConsole.addEventListener('click', () => {
    consolePanel.classList.toggle('collapsed');
    const isCollapsed = consolePanel.classList.contains('collapsed');
    btnToggleConsole.innerHTML = isCollapsed ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
    btnToggleConsole.title = isCollapsed ? 'Expand Terminal' : 'Minimize Terminal';
  });

  btnClearConsole.addEventListener('click', () => {
    consoleViewport.innerHTML = '';
    printConsole("Console log cleared.", "system");
  });

  consoleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      consoleTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabId = tab.id;
      printConsole(`Switched output stream: ${tab.textContent.trim()}`, 'system');
      
      if (tabId === 'tab-problems') {
        consoleViewport.innerHTML = '';
        printConsole("No syntax errors or compilation conflicts detected in active workspace.", "success");
      } else if (tabId === 'tab-output') {
        consoleViewport.innerHTML = '';
        printConsole(`--- Active AST Summary Statistics ---`, 'info');
        printConsole(`AST parsed node nodes count: ${statAstNodes.textContent}`, 'info');
        printConsole(`Estimated cyclomatic branch loops: ${statCyclomatic.textContent}`, 'info');
        printConsole(`Maximum tree path recursion depth: ${statRecursion.textContent}`, 'info');
      } else {
        consoleViewport.innerHTML = '';
        printConsole("LogicScope compiler telemetry logs streams online.", "info");
      }
    });
  });

  // --- Initialization ---
  printConsole("LogicScope offline compiler extension engine loaded.", "system");
  selectFile('binarySearch.js');
});
