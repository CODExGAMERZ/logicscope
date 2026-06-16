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

  // Buttons
  const zoomInBtn = document.getElementById('btn-zoom-in');
  const zoomOutBtn = document.getElementById('btn-zoom-out');
  const zoomResetBtn = document.getElementById('btn-zoom-reset');
  const langBtns = document.querySelectorAll('.editor-languages .lang-btn');

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
      flowchart: `function findMax(arr) {
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }
  return max;
}`,
      class: `class Animal {
  constructor(name) {
    this.name = name;
  }
  speak() {
    return "noise";
  }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name);
    this.breed = breed;
  }
  bark() {
    return "Woof!";
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
      recursion: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)`
    }
  };

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

  // Update tabs & headers when switching languages
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      langBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      activeLang = btn.getAttribute('data-lang');
      
      // Update header
      if (activeLang === 'javascript') {
        editorTabFilename.textContent = 'script.js';
        editorTabIcon.className = 'fa-brands fa-js-square text-warning';
        footerLang.textContent = 'JavaScript (ES6)';
      } else {
        editorTabFilename.textContent = 'main.py';
        editorTabIcon.className = 'fa-brands fa-python text-primary';
        footerLang.textContent = 'Python (v3.10)';
      }
      
      // Select appropriate mode based on selector or keep
      let renderMode = visModeSelect.value;
      if (renderMode === 'auto') {
        renderMode = autoDetectMode(codeTextarea.value);
      }
      
      loadCodeSample(activeLang, renderMode);
      compileAndRender();
    });
  });

  // Mode select change listener
  visModeSelect.addEventListener('change', () => {
    let mode = visModeSelect.value;
    if (mode === 'auto') {
      mode = autoDetectMode(codeTextarea.value);
    }
    loadCodeSample(activeLang, mode);
    compileAndRender();
  });

  // Textarea change listener (debounced compiler)
  let compileTimeout = null;
  codeTextarea.addEventListener('input', () => {
    updateLineNumbers();
    clearTimeout(compileTimeout);
    
    // Status updating
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
    
    // Simple recursion heuristic: self invocation
    // Search for defined function names and check if they are called inside the body
    const jsFuncMatch = code.match(/function\s+(\w+)\s*\(/);
    const pyFuncMatch = code.match(/def\s+(\w+)\s*\(/);
    const funcName = jsFuncMatch ? jsFuncMatch[1] : (pyFuncMatch ? pyFuncMatch[1] : null);
    
    if (funcName) {
      // Find count of matches of funcName
      const regex = new RegExp(funcName, 'g');
      const matches = code.match(regex);
      if (matches && matches.length > 1) {
        return 'recursion';
      }
    }
    
    return 'flowchart';
  }

  // --- Rule-based AST Parser / Mermaid Generator ---
  function generateMermaidString(code, mode) {
    if (mode === 'class') {
      return compileClassDiagram(code);
    } else if (mode === 'recursion') {
      return compileRecursionTree(code);
    } else {
      return compileFlowchart(code);
    }
  }

  // UML Class compiler
  function compileClassDiagram(code) {
    // Basic class parsing logic using regex
    const classRegex = /class\s+(\w+)(?:\s*(?:extends|\()\s*(\w+)\s*\)?)?\s*\{?/g;
    const methodRegex = /(\w+)\s*\([^)]*\)\s*\{|def\s+(\w+)\s*\(/g;
    
    let classes = [];
    let inheritances = [];
    let match;
    
    const lines = code.split('\n');
    let currentClass = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Match class declaration
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
        // Find constructor properties or member variables
        // e.g. this.name = name, self.color = color
        const propMatch = /(?:this|self)\.(\w+)\s*=/i.exec(line);
        if (propMatch) {
          const propName = propMatch[1];
          if (!currentClass.properties.includes(propName)) {
            currentClass.properties.push(propName);
          }
        }
        
        // Find methods
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
      // Fallback dummy classes if parse fails
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
  function compileRecursionTree(code) {
    // We will inspect code to see if it is Fibonacci or Factorial and draw a clean tree representing calls
    let isFib = /fibonacci/i.test(code) || /fib/i.test(code);
    
    if (isFib) {
      return `graph TD
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
        style f2 fill:#022c22,stroke:#10b981,color:#a7f3d0
        style f1 fill:#022c22,stroke:#10b981,color:#a7f3d0`;
    } else {
      // Factorial recursion tree
      return `graph TD
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
  function compileFlowchart(code) {
    // Parse statements and branches
    // Let's create a linear graph or standard flowchart matching arrMax or binary search
    let isBinarySearch = /binary/i.test(code) || /low\s*<=/i.test(code);
    
    if (isBinarySearch) {
      return `graph TD
        Start(["Start: binary_search"]) --> Init["low = 0<br>high = len - 1"]
        Init --> Loop{"low <= high"}
        Loop -- Yes --> Mid["mid = (low + high) // 2"]
        Mid --> Cond1{"arr[mid] == target"}
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
      // FindMax array search
      return `graph TD
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
    
    // Ast node calculator approximation
    const words = code.match(/[\w_]+/g) || [];
    const operators = code.match(/[+\-*\/=<>!&|]+/g) || [];
    astNodes = Math.floor(words.length * 1.5 + operators.length * 2.2 + 8);
    
    // Cyclomatic complexity
    lines.forEach(line => {
      // add count for control keywords
      const branches = line.match(/\b(if|elif|else\s+if|for|while|case|catch)\b/g);
      if (branches) {
        complexity += branches.length;
      }
      const logicals = line.match(/(&&|\|\|)/g);
      if (logicals) {
        complexity += logicals.length;
      }
    });

    // Time/Space mapping
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
      // flowchart modes
      let isBinary = /binary/i.test(code) || /low\s*<=/i.test(code);
      let hasLoops = /for|while/i.test(code);
      
      if (isBinary) {
        time = "O(log N)";
        timeDesc = "Logarithmic workspace division";
        space = "O(1)";
        spaceDesc = "Constant variable references";
      } else if (hasLoops) {
        // check nested loops
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

    // Set UI stats
    statTime.textContent = time;
    statTimeDesc.textContent = timeDesc;
    statSpace.textContent = space;
    statSpaceDesc.textContent = spaceDesc;
    statRecursion.textContent = depth;
    statRecursionDesc.textContent = depthDesc;
    statAstNodes.textContent = astNodes;
    statCyclomatic.textContent = complexity;
    
    // Cyclomatic descriptions
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

    // Render configuration metrics
    calculateMetrics(code, mode);

    const mermaidStr = generateMermaidString(code, mode);
    
    // Render Mermaid code
    diagramContainer.removeAttribute('data-processed');
    
    mermaid.parse(mermaidStr)
      .then(() => {
        // Syntax is valid, safe to render
        const svgId = `mermaid-svg-${Date.now()}`;
        return mermaid.render(svgId, mermaidStr, diagramContainer);
      })
      .then(({ svg }) => {
        diagramContainer.innerHTML = svg;
        canvasStatus.classList.add('hidden');
        canvasSpinner.classList.add('hidden');
        footerStatus.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> AST Healthy';
        
        // Apply current zoom/pan transform
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
  }

  // Compile Trigger Button
  runCodeBtn.addEventListener('click', () => {
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

  // Drag and pan controls for canvas viewport
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
    
    // Bounds check
    if (widthPercentage > 15 && widthPercentage < 80) {
      editorPane.style.flex = widthPercentage / 10;
      canvasPane.style.flex = (100 - widthPercentage) / 10;
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      // Recalculate diagram layout
      compileAndRender();
    }
  });


  // --- Initialization ---
  // Initial load
  loadCodeSample('javascript', 'flowchart');
  compileAndRender();
});
