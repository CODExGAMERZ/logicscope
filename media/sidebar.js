(function () {
  const vscode = acquireVsCodeApi();

  const fileNameEl = document.getElementById('file-name');
  const langBadgeEl = document.getElementById('lang-badge');
  const aiBadgeEl = document.getElementById('ai-badge');
  
  const learningModeSelect = document.getElementById('learning-mode');
  const realTimeModeSelect = document.getElementById('real-time-mode');
  const diagramTypeSelect = document.getElementById('diagram-type');
  
  const refreshBtn = document.getElementById('btn-refresh');
  const explainBtn = document.getElementById('btn-explain');
  const manageKeysIcon = document.getElementById('manage-keys');
  const openCanvasBtn = document.getElementById('btn-open-canvas');
  
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  const explanationSection = document.getElementById('explanation-section');
  const spinnerContainer = document.getElementById('spinner-container');
  
  const conceptTitle = document.getElementById('concept-title');
  const timeComplexity = document.getElementById('time-complexity');
  const spaceComplexity = document.getElementById('space-complexity');
  const explanationBody = document.getElementById('explanation-body');

  // Handle messages from the extension host
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
      case 'updateState':
        updateUIState(message.state);
        break;
      case 'setAIExplanationLoading':
        showExplanationLoading(message.loading);
        break;
      case 'updateExplanation':
        displayExplanation(message.result);
        break;
      case 'setAIStatus':
        updateAIStatus(message.status, message.message);
        break;
    }
  });

  function updateUIState(state) {
    fileNameEl.textContent = state.fileName || 'No active file';
    
    if (state.languageId) {
      langBadgeEl.textContent = state.languageId;
      langBadgeEl.style.display = 'inline-block';
    } else {
      langBadgeEl.style.display = 'none';
    }

    // Toggle badge and explain button availability based on support
    const isSupported = state.languageId === 'python' || state.languageId === 'javascript';
    explainBtn.disabled = !isSupported || !state.fileActive;
    
    if (state.hasKey) {
      aiBadgeEl.style.display = 'none';
    } else {
      aiBadgeEl.style.display = 'inline-block';
    }

    learningModeSelect.value = state.learningMode || 'beginner';
    realTimeModeSelect.value = state.realTimeMode || 'auto';
    diagramTypeSelect.value = state.diagramType || 'auto';

    // Toggle manual refresh button based on real time mode
    if (state.realTimeMode === 'manual' || state.realTimeMode === 'snapshot') {
      refreshBtn.style.display = 'block';
    } else {
      refreshBtn.style.display = 'none';
    }

    updateAIStatus(state.aiStatus, state.aiStatusMessage);

    if (state.explanation) {
      displayExplanation(state.explanation);
    } else {
      explanationSection.classList.remove('visible');
    }
  }

  function updateAIStatus(status, message) {
    statusDot.className = 'status-dot';
    if (status === 'active') {
      statusDot.classList.add('active');
    } else if (status === 'error') {
      statusDot.classList.add('error');
    }
    statusText.textContent = message || 'AI Off';
  }

  function showExplanationLoading(loading) {
    if (loading) {
      explanationSection.classList.remove('visible');
      spinnerContainer.classList.add('visible');
    } else {
      spinnerContainer.classList.remove('visible');
    }
  }

  function displayExplanation(result) {
    spinnerContainer.classList.remove('visible');
    
    if (!result) {
      explanationSection.classList.remove('visible');
      return;
    }

    conceptTitle.textContent = result.concept || 'Concept Analysis';
    timeComplexity.textContent = result.complexity?.time || 'N/A';
    spaceComplexity.textContent = result.complexity?.space || 'N/A';
    
    // Convert newlines in explanation body to HTML paragraphs safely
    const escaped = escapeHtml(result.explanation || 'No explanation available.');
    explanationBody.innerHTML = escaped.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

    explanationSection.classList.add('visible');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- UI Event Listeners ---

  learningModeSelect.addEventListener('change', () => {
    vscode.postMessage({
      command: 'changeLearningMode',
      value: learningModeSelect.value
    });
  });

  realTimeModeSelect.addEventListener('change', () => {
    vscode.postMessage({
      command: 'changeRealTimeMode',
      value: realTimeModeSelect.value
    });
  });

  diagramTypeSelect.addEventListener('change', () => {
    vscode.postMessage({
      command: 'changeDiagramType',
      value: diagramTypeSelect.value
    });
  });

  refreshBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'refresh' });
  });

  explainBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'explain' });
  });

  manageKeysIcon.addEventListener('click', () => {
    vscode.postMessage({ command: 'manageAIKey' });
  });

  openCanvasBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'openCanvas' });
  });

  // Notify extension host that webview is ready to receive state
  vscode.postMessage({ command: 'ready' });
})();
