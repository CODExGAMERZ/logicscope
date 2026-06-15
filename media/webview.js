(function () {
  const vscode = acquireVsCodeApi();
  
  // State variables
  let currentSpec = null;
  let currentMermaidCode = '';
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  const canvasContainer = document.getElementById('canvas-container');
  const canvas = document.getElementById('canvas');
  const detailCard = document.getElementById('detail-card');
  const loadingOverlay = document.getElementById('loading-overlay');
  // Handle messages from the extension
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
      case 'update':
        currentSpec = message.spec;
        currentMermaidCode = message.mermaidCode;
        renderDiagram(message.mermaidCode);
        break;
      case 'setLoading':
        if (message.loading) {
          loadingOverlay.classList.add('visible');
        } else {
          loadingOverlay.classList.remove('visible');
        }
        break;
      case 'setTheme':
        updateMermaidTheme(message.theme);
        break;
      case 'highlightNode':
        highlightNodeInSvg(message.nodeId);
        break;
    }
  });

  function updateMermaidTheme(theme) {
    let mermaidTheme = 'dark';
    let themeVariables = {};

    if (theme === 'light') {
      mermaidTheme = 'default';
      document.body.className = 'vscode-light';
      themeVariables = {
        background: '#ffffff',
        primaryColor: '#f3f3f3',
        primaryBorderColor: '#e0e0e0',
        primaryTextColor: '#333333',
        lineColor: '#007acc',
        nodeBorder: '#e0e0e0',
        mainBkg: '#f3f3f3',
        classText: '#333333',
        classBorder: '#e0e0e0',
        classBkg: '#f3f3f3',
        labelColor: '#333333',
        edgeLabelBackground: '#ffffff',
        textColor: '#333333',
        edgeColor: '#007acc',
      };
    } else {
      mermaidTheme = 'dark';
      document.body.className = 'vscode-dark';
      themeVariables = {
        background: '#1e1e1e',
        primaryColor: '#252526',
        primaryBorderColor: '#454545',
        primaryTextColor: '#cccccc',
        lineColor: '#007acc',
        nodeBorder: '#454545',
        mainBkg: '#252526',
        classText: '#cccccc',
        classBorder: '#454545',
        classBkg: '#252526',
        labelColor: '#cccccc',
        edgeLabelBackground: '#1e1e1e',
        textColor: '#cccccc',
        edgeColor: '#007acc',
      };
    }

    mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      themeVariables: themeVariables,
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true
      }
    });

    if (currentMermaidCode) {
      renderDiagram(currentMermaidCode);
    }
  }

  // Initialize theme on startup based on body class
  const initialTheme = document.body.classList.contains('vscode-light') ? 'light' : 'dark';
  updateMermaidTheme(initialTheme);

  async function renderDiagram(code) {
    if (!code || code.trim() === '') {
      canvas.innerHTML = '<div style="padding: 20px; text-align: center; opacity: 0.5;">No active diagram</div>';
      return;
    }

    try {
      // Clear previous
      canvas.innerHTML = '';
      
      // Mermaid requires a unique ID for rendering
      const id = 'mermaid-svg-' + Date.now();
      
      const { svg } = await mermaid.render(id, code);
      canvas.innerHTML = svg;

      // Adjust styles inside rendered SVG
      const svgElement = canvas.querySelector('svg');
      if (svgElement) {
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';
        svgElement.style.maxWidth = '100%';
      }

      setupNodeInteractions();
      applyTransform();
    } catch (err) {
      console.error('Mermaid render error', err);
      canvas.innerHTML = `<div style="padding: 20px; color: var(--vscode-errorForeground, #ff1212);">
        Rendering Error. Please check code structure.<br>
        <pre style="font-size: 10px; margin-top: 10px;">${err.message || err}</pre>
      </div>`;
    }
  }

  function setupNodeInteractions() {
    // Mermaid renders nodes as .node elements
    const nodes = canvas.querySelectorAll('.node');
    nodes.forEach(nodeElement => {
      // Determine the node ID in Mermaid (usually class or element attribute)
      // Mermaid IDs might have suffixes like -start, -cond in the ID attribute
      const fullId = nodeElement.getAttribute('id') || '';
      // Extract the parsed node ID: typically "stmt_1", "cond_2", etc.
      // E.g., flow-stmt_1-12345 -> stmt_1
      const parts = fullId.split('-');
      const nodeId = parts.length > 1 ? parts[1] : fullId;

      nodeElement.addEventListener('click', (e) => {
        e.stopPropagation();
        onNodeClicked(nodeId);
      });
    });
  }

  function onNodeClicked(nodeId) {
    if (!currentSpec || !currentSpec.nodes) return;
    
    const node = currentSpec.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Send node clicked event back to extension
    vscode.postMessage({
      command: 'nodeClicked',
      nodeId: node.id,
      meta: node.meta
    });

    // Display Detail Card
    const cardTitle = document.getElementById('card-title');
    const cardType = document.getElementById('card-type');
    const cardLines = document.getElementById('card-lines');
    const cardDetails = document.getElementById('card-details');

    cardTitle.textContent = node.label;
    cardType.textContent = `Type: ${node.type.toUpperCase()}`;
    
    if (node.meta && node.meta.startLine) {
      cardLines.textContent = `Lines: ${node.meta.startLine} to ${node.meta.endLine || node.meta.startLine}`;
    } else {
      cardLines.textContent = '';
    }

    if (node.meta && node.meta.members) {
      cardDetails.innerHTML = node.meta.members.map(m => `<div class="code-ref">${m}</div>`).join('');
    } else {
      cardDetails.innerHTML = '';
    }

    detailCard.classList.add('visible');
  }

  function highlightNodeInSvg(nodeId) {
    // Remove previous highlights
    canvas.querySelectorAll('.node').forEach(el => {
      el.style.filter = '';
      const rect = el.querySelector('rect, circle, polygon, path');
      if (rect) rect.style.strokeWidth = '';
    });

    // Find and highlight target node
    canvas.querySelectorAll('.node').forEach(el => {
      const fullId = el.getAttribute('id') || '';
      if (fullId.includes(nodeId)) {
        el.style.filter = 'drop-shadow(0px 0px 8px var(--vscode-button-background, #007acc))';
        const shape = el.querySelector('rect, circle, polygon, path');
        if (shape) {
          shape.style.stroke = 'var(--vscode-button-background, #007acc)';
          shape.style.strokeWidth = '3px';
        }
      }
    });
  }

  // --- Zoom and Pan Interactions ---

  document.getElementById('zoom-in').addEventListener('click', () => {
    zoomLevel = Math.min(zoomLevel + 0.15, 3.0);
    applyTransform();
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    zoomLevel = Math.max(zoomLevel - 0.15, 0.4);
    applyTransform();
  });

  document.getElementById('zoom-fit').addEventListener('click', () => {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }

  // Pan dragging
  canvasContainer.addEventListener('mousedown', e => {
    if (e.target === canvasContainer || canvasContainer.contains(e.target)) {
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    }
  });

  window.addEventListener('mousemove', e => {
    if (isDragging) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Close Detail Card
  document.getElementById('close-card').addEventListener('click', () => {
    detailCard.classList.remove('visible');
  });

  // --- Export Operations ---

  document.getElementById('copy-mermaid').addEventListener('click', () => {
    if (!currentMermaidCode) return;
    vscode.postMessage({
      command: 'copyMermaid',
      code: currentMermaidCode
    });
  });

  document.getElementById('export-png').addEventListener('click', () => {
    const svgElement = canvas.querySelector('svg');
    if (!svgElement) return;

    try {
      // Show loading
      loadingOverlay.classList.add('visible');

      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const bbox = svgElement.getBoundingClientRect();
        // Use higher resolution multiplier for crisp PNG
        const scale = 2;
        const width = (svgElement.viewBox.baseVal.width || bbox.width) * scale;
        const height = (svgElement.viewBox.baseVal.height || bbox.height) * scale;

        const canvasElement = document.createElement('canvas');
        canvasElement.width = width;
        canvasElement.height = height;

        const context = canvasElement.getContext('2d');
        // Fill white background for light themes or transparent/custom for dark
        const isLightTheme = document.body.classList.contains('vscode-light');
        context.fillStyle = isLightTheme ? '#ffffff' : '#1e1e1e';
        context.fillRect(0, 0, width, height);

        context.drawImage(image, 0, 0, width, height);
        const pngData = canvasElement.toDataURL('image/png');

        // Send back to extension to trigger save dialog
        vscode.postMessage({
          command: 'savePng',
          data: pngData
        });

        loadingOverlay.classList.remove('visible');
        URL.revokeObjectURL(blobURL);
      };

      image.src = blobURL;
    } catch (e) {
      console.error('PNG Export failed', e);
      loadingOverlay.classList.remove('visible');
    }
  });

  // Hide detail card on clicking blank canvas areas
  canvasContainer.addEventListener('click', () => {
    detailCard.classList.remove('visible');
  });
})();
