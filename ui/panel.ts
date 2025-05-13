import type { PortMessage, RawEvent, WorkflowAnalysis } from '../src/types';
import { testAIModel } from '../src/ai';

// Elements
const log = document.getElementById('log') as HTMLUListElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const startMarkBtn = document.getElementById('startMarkBtn') as HTMLButtonElement;
const stopMarkBtn = document.getElementById('stopMarkBtn') as HTMLButtonElement;
const eventsTab = document.getElementById('eventsTab') as HTMLDivElement;
const analysisTab = document.getElementById('analysisTab') as HTMLDivElement;
const debugTab = document.getElementById('debugTab') as HTMLDivElement;
const eventsContent = document.getElementById('eventsContent') as HTMLDivElement;
const analysisContent = document.getElementById('analysisContent') as HTMLDivElement;
const debugContent = document.getElementById('debugContent') as HTMLDivElement;
const analysisPlaceholder = document.querySelector('.analysis-placeholder') as HTMLDivElement;
const analysisResults = document.querySelector('.analysis-results') as HTMLDivElement;
const workflowSummary = document.getElementById('workflowSummary') as HTMLParagraphElement;
const workflowSteps = document.getElementById('workflowSteps') as HTMLDivElement;
const workflowSuggestions = document.getElementById('workflowSuggestions') as HTMLUListElement;
const customPrompt = document.getElementById('customPrompt') as HTMLTextAreaElement;
const reanalyzeBtn = document.getElementById('reanalyzeBtn') as HTMLButtonElement;

// Analysis debug elements
const toggleDebugBtn = document.getElementById('toggleDebugBtn') as HTMLButtonElement;
const analysisDebugInfo = document.getElementById('analysisDebugInfo') as HTMLDivElement;
const errorDetails = document.getElementById('errorDetails') as HTMLPreElement;
const modelStatusEl = document.getElementById('modelStatus') as HTMLPreElement;
const promptText = document.getElementById('promptText') as HTMLPreElement;
const rawResponse = document.getElementById('rawResponse') as HTMLPreElement;

// Debug tab elements
const statusEl = document.getElementById('status') as HTMLSpanElement;
const checkBtn = document.getElementById('checkBtn') as HTMLButtonElement;
const chromeStatusEl = document.getElementById('chromeStatus') as HTMLSpanElement;
const aiTrialStatusEl = document.getElementById('aiTrialStatus') as HTMLSpanElement;
const langModelStatusEl = document.getElementById('langModelStatus') as HTMLSpanElement;
const paramsEl = document.getElementById('params') as HTMLSpanElement;
const capabilitiesEl = document.getElementById('capabilities') as HTMLSpanElement;
const testModelBtn = document.getElementById('testModelBtn') as HTMLButtonElement;
const testResultsEl = document.getElementById('testResults') as HTMLPreElement;
const simpleDiagnosticBtn = document.getElementById('simpleDiagnosticBtn') as HTMLButtonElement;

// Connect to background service worker
const port = chrome.runtime.connect({ name: 'log' });

// Recording state
let isRecording = false;

// Auto-scroll behavior
let follow = true;
log.addEventListener('scroll', () => {
  follow = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
});

// Handle messages from service worker
port.onMessage.addListener((message: PortMessage) => {
  if ('init' in message && message.init) {
    message.init.forEach(add);
  }
  
  if ('delta' in message && message.delta) {
    message.delta.forEach(add);
  }
  
  if ('analysis' in message && message.analysis) {
    displayAnalysis(message.analysis);
  }
});

// Add event to the log
function add(event: RawEvent): void {
  const item = document.createElement('li');
  item.className = `row ${getEventClass(event)}`;
  
  // Special styling for mark events
  if (event.type === 'mark') {
    item.classList.add('workflow-mark');
  }
  
  const timestamp = document.createElement('span');
  timestamp.className = 'timestamp';
  timestamp.textContent = formatTime(event.t || Date.now());
  
  const content = document.createElement('span');
  content.textContent = format(event);
  
  item.appendChild(timestamp);
  item.appendChild(content);
  log.appendChild(item);
  
  // Auto-scroll
  if (follow) {
    log.scrollTop = log.scrollHeight;
  }
  
  // Limit DOM elements to prevent browser slowdown
  const MAX_VISIBLE_ELEMENTS = 500;
  while (log.children.length > MAX_VISIBLE_ELEMENTS) {
    log.removeChild(log.firstChild as Node);
  }
}

// Format event for display
function format(event: RawEvent): string {
  // User interaction events
  if (event.type === 'user') {
    let text = `${event.action.toUpperCase()} ${event.target}`;
    if (event.value && event.action !== 'password') {
      text += ` → "${event.value}"`;
    }
    return text;
  }
  
  // Navigation events
  if (event.type === 'nav') {
    return `→ NAV ${event.url}`;
  }
  
  // Tab events
  if (event.type === 'tab') {
    return `TAB ${event.action}`;
  }
  
  // Page lifecycle events
  if (event.type === 'page') {
    return `PAGE ${event.action} ${event.url}`;
  }
  
  // Visibility state changes
  if (event.type === 'visibility') {
    return `VIS ${event.action}`;
  }
  
  // Keyboard events
  if (event.type === 'key') {
    const modifiers = [];
    if (event.modifiers.ctrl) modifiers.push('Ctrl');
    if (event.modifiers.alt) modifiers.push('Alt');
    if (event.modifiers.shift) modifiers.push('Shift');
    if (event.modifiers.meta) modifiers.push('Meta');
    
    const keyCombo = modifiers.length 
      ? `${modifiers.join('+')}+${event.key}` 
      : event.key;
      
    return `KEY ${keyCombo}`;
  }
  
  // Mouse hover events
  if (event.type === 'hover') {
    return `HOVER ${event.target}`;
  }
  
  // URL hash changes
  if (event.type === 'hashchange') {
    return `HASH ${new URL(event.to).hash}`;
  }
  
  // XHR requests
  if (event.type === 'xhr') {
    // Get just the path part of the URL
    let urlDisplay = event.url;
    try {
      const url = new URL(event.url, event.pageUrl);
      urlDisplay = url.pathname + url.search;
    } catch (e) {
      // Use the original if parsing fails
    }
    return `XHR ${event.method} ${urlDisplay}`;
  }
  
  // Fetch API requests
  if (event.type === 'fetch') {
    // Get just the path part of the URL
    let urlDisplay = event.url;
    try {
      const url = new URL(event.url, event.pageUrl);
      urlDisplay = url.pathname + url.search;
    } catch (e) {
      // Use the original if parsing fails
    }
    return `FETCH ${event.method} ${urlDisplay}`;
  }

  // Workflow mark events (new in v0.5)
  if (event.type === 'mark') {
    return `WORKFLOW ${event.action.toUpperCase()}`;
  }

  // Fallback for unknown event types
  return JSON.stringify(event).slice(0, 80);
}

// Get CSS class for event styling
function getEventClass(event: RawEvent): string {
  switch (event.type) {
    case 'user':
      return event.action === 'click' ? 'click' : 'inp';
    case 'nav':
      return 'nav';
    case 'tab':
      return 'tab';
    case 'page':
      return 'page';
    case 'visibility':
      return 'vis';
    case 'key':
      return 'key';
    case 'hover':
      return 'hover';
    case 'hashchange':
      return 'hash';
    case 'xhr':
    case 'fetch':
      return 'net';
    case 'mark':
      return 'mark';
    default:
      return '';
  }
}

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Display analysis results
function displayAnalysis(analysis: WorkflowAnalysis): void {
  // Switch to the analysis tab
  setActiveTab('analysis');
  
  // Hide placeholder, show results
  analysisPlaceholder.style.display = 'none';
  analysisResults.style.display = 'block';
  
  // Update summary
  workflowSummary.textContent = analysis.summary;
  
  // Update steps
  workflowSteps.innerHTML = '';
  analysis.steps.forEach(step => {
    const stepEl = document.createElement('div');
    stepEl.className = 'analysis-step';
    
    const actionEl = document.createElement('h3');
    actionEl.textContent = step.action;
    
    const intentEl = document.createElement('p');
    intentEl.textContent = step.intent;
    
    stepEl.appendChild(actionEl);
    stepEl.appendChild(intentEl);
    workflowSteps.appendChild(stepEl);
  });
  
  // Update suggestions
  workflowSuggestions.innerHTML = '';
  if (analysis.suggestions && analysis.suggestions.length > 0) {
    analysis.suggestions.forEach(suggestion => {
      const li = document.createElement('li');
      li.textContent = suggestion;
      workflowSuggestions.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'No suggestions available';
    workflowSuggestions.appendChild(li);
  }
  
  // Update debug information if available
  if (analysis.debug) {
    // Show debug elements
    errorDetails.textContent = analysis.debug.error || 'No errors';
    modelStatusEl.textContent = analysis.debug.modelStatus || 'Unknown';
    promptText.textContent = analysis.debug.prompt || 'No prompt available';
    rawResponse.textContent = analysis.debug.rawResponse || 'No response available';
    
    // Highlight if there's an error
    if (analysis.debug.error) {
      errorDetails.classList.add('error-highlight');
      toggleDebugBtn.textContent = 'Show Error Details';
      toggleDebugBtn.classList.add('btn-danger');
      toggleDebugBtn.classList.remove('btn-secondary');
    } else {
      errorDetails.classList.remove('error-highlight');
      toggleDebugBtn.textContent = 'Show Debug Info';
      toggleDebugBtn.classList.add('btn-secondary');
      toggleDebugBtn.classList.remove('btn-danger');
    }
  } else {
    // Reset debug elements if no debug info
    errorDetails.textContent = 'No debug information available';
    modelStatusEl.textContent = 'Unknown';
    promptText.textContent = 'No prompt available';
    rawResponse.textContent = 'No response available';
  }
}

// Tab switching
function setActiveTab(tabId: 'events' | 'analysis' | 'debug'): void {
  // Update tab states
  eventsTab.classList.toggle('active', tabId === 'events');
  analysisTab.classList.toggle('active', tabId === 'analysis');
  debugTab.classList.toggle('active', tabId === 'debug');
  
  // Update content visibility
  eventsContent.classList.toggle('active', tabId === 'events');
  analysisContent.classList.toggle('active', tabId === 'analysis');
  debugContent.classList.toggle('active', tabId === 'debug');
  
  // Run initial checks if debug tab is activated
  if (tabId === 'debug') {
    checkEnvironment();
    checkModelAvailability();
  }
}

// Start recording workflow
function startRecording(): void {
  isRecording = true;
  startMarkBtn.disabled = true;
  stopMarkBtn.disabled = false;
  
  chrome.runtime.sendMessage({ kind: 'mark', action: 'start' });
}

// Stop recording workflow
function stopRecording(): void {
  isRecording = false;
  startMarkBtn.disabled = false;
  stopMarkBtn.disabled = true;
  
  chrome.runtime.sendMessage({ kind: 'mark', action: 'stop' });
}

// Event listeners
exportBtn.addEventListener('click', () => {
  try {
    // Request export from service worker
    chrome.runtime.sendMessage({ kind: 'export' });
  } catch (error) {
    console.error('Export failed:', error);
  }
});

clearBtn.addEventListener('click', () => {
  // Clear the UI
  log.innerHTML = '';
  
  // Reset analysis
  analysisPlaceholder.style.display = 'block';
  analysisResults.style.display = 'none';
  workflowSteps.innerHTML = '';
  workflowSuggestions.innerHTML = '';
  workflowSummary.textContent = '';
});

startMarkBtn.addEventListener('click', startRecording);
stopMarkBtn.addEventListener('click', stopRecording);

eventsTab.addEventListener('click', () => setActiveTab('events'));
analysisTab.addEventListener('click', () => setActiveTab('analysis'));
debugTab.addEventListener('click', () => setActiveTab('debug'));

reanalyzeBtn.addEventListener('click', () => {
  const prompt = customPrompt.value.trim();
  if (prompt) {
    chrome.runtime.sendMessage({ 
      kind: 'analyzeWorkflow',
      customPrompt: prompt
    });
  } else {
    chrome.runtime.sendMessage({ kind: 'analyzeWorkflow' });
  }
});

// Debug tab functionality
// Check environment
function checkEnvironment() {
  // Check if Chrome is available
  if (typeof chrome !== 'undefined') {
    chromeStatusEl.textContent = '✅ Yes';
  } else {
    chromeStatusEl.textContent = '❌ No';
  }
  
  // Check if aiOriginTrial is available
  if (typeof chrome !== 'undefined' && 'aiOriginTrial' in chrome) {
    aiTrialStatusEl.textContent = '✅ Yes';
  } else {
    aiTrialStatusEl.textContent = '❌ No';
  }
  
  // Check if languageModel is available
  if (typeof chrome !== 'undefined' && 
      'aiOriginTrial' in chrome && 
      chrome.aiOriginTrial && 
      'languageModel' in chrome.aiOriginTrial) {
    langModelStatusEl.textContent = '✅ Yes';
  } else {
    langModelStatusEl.textContent = '❌ No';
  }
}

// Check model availability
async function checkModelAvailability() {
  statusEl.textContent = 'Checking...';
  statusEl.className = 'status';
  
  try {
    // Check if the API exists at runtime
    if (!('aiOriginTrial' in chrome)) {
      statusEl.textContent = '❌ AI Origin Trial API not available in this browser';
      statusEl.className = 'status unavailable';
      return;
    }
    
    if (!chrome.aiOriginTrial || !chrome.aiOriginTrial.languageModel) {
      statusEl.textContent = '❌ Language Model API not available';
      statusEl.className = 'status unavailable';
      return;
    }
    
    // Check actual availability status
    const available = await chrome.aiOriginTrial.languageModel.availability();
    if (available === 'available') {
      statusEl.textContent = '✅ Available';
      statusEl.className = 'status available';
    } else {
      statusEl.textContent = `❌ Not Available (status: ${available})`;
      statusEl.className = 'status unavailable';
    }
    
    // Try to get parameters
    try {
      if (chrome.aiOriginTrial.languageModel.params) {
        const params = await chrome.aiOriginTrial.languageModel.params();
        paramsEl.textContent = JSON.stringify(params, null, 2);
      } else {
        paramsEl.textContent = 'Method not available';
      }
    } catch (error) {
      paramsEl.textContent = `Error: ${error.message || 'Unknown error'}`;
    }
    
    // Try to get capabilities
    try {
      if (chrome.aiOriginTrial.languageModel.capabilities) {
        const capabilities = await chrome.aiOriginTrial.languageModel.capabilities();
        capabilitiesEl.textContent = JSON.stringify(capabilities, null, 2);
      } else {
        capabilitiesEl.textContent = 'Method not available';
      }
    } catch (error) {
      capabilitiesEl.textContent = `Error: ${error.message || 'Unknown error'}`;
    }
    
  } catch (error) {
    statusEl.textContent = `❌ Error checking availability: ${error.message || 'Unknown error'}`;
    statusEl.className = 'status unavailable';
  }
}

// Test model with a simple prompt
async function testModel() {
  testResultsEl.textContent = 'Running test...';
  
  try {
    // Check if the API exists
    if (!('aiOriginTrial' in chrome)) {
      testResultsEl.textContent = 'AI Origin Trial API not available in this browser';
      return;
    }
    
    if (!chrome.aiOriginTrial || !chrome.aiOriginTrial.languageModel) {
      testResultsEl.textContent = 'Language Model API not available';
      return;
    }
    
    // Check availability
    const available = await chrome.aiOriginTrial.languageModel.availability();
    if (available !== 'available') {
      testResultsEl.textContent = `Test failed: Model not available (status: ${available})`;
      return;
    }
    
    // Create a session with the language model
    const session = await chrome.aiOriginTrial.languageModel.create();
    
    // Simple prompt
    const prompt = 'Say hello in 5 words or less.';
    
    // Send the prompt to the model
    const result = await session.prompt(prompt);
    
    // Display response
    testResultsEl.textContent = `Prompt: "${prompt}"\n\nResponse: "${result.response}"`;
    
    // Clean up
    session.destroy();
    
  } catch (error) {
    testResultsEl.textContent = `Test failed with error: ${error.message || 'Unknown error'}\n\nStack trace: ${error.stack || 'No stack trace available'}`;
  }
}

// Add event listeners for debug tab
checkBtn.addEventListener('click', checkModelAvailability);
testModelBtn.addEventListener('click', testModel);
simpleDiagnosticBtn.addEventListener('click', runDiagnosticTest);

// Simple diagnostic test function
async function runDiagnosticTest() {
  testResultsEl.textContent = 'Running diagnostic test...';
  
  try {
    const result = await testAIModel();
    testResultsEl.textContent = JSON.stringify(result, null, 2);
    
    if (result.success) {
      testResultsEl.classList.add('success-highlight');
      testResultsEl.classList.remove('error-highlight');
    } else {
      testResultsEl.classList.add('error-highlight');
      testResultsEl.classList.remove('success-highlight');
    }
  } catch (error) {
    testResultsEl.textContent = `Error running diagnostic test: ${error instanceof Error ? error.message : 'Unknown error'}`;
    testResultsEl.classList.add('error-highlight');
    testResultsEl.classList.remove('success-highlight');
  }
}

// Add event listener for toggleDebugBtn
toggleDebugBtn.addEventListener('click', () => {
  // Toggle debug info visibility
  if (analysisDebugInfo.style.display === 'none') {
    analysisDebugInfo.style.display = 'block';
    toggleDebugBtn.textContent = 'Hide Debug Info';
  } else {
    analysisDebugInfo.style.display = 'none';
    if (errorDetails.classList.contains('error-highlight')) {
      toggleDebugBtn.textContent = 'Show Error Details';
    } else {
      toggleDebugBtn.textContent = 'Show Debug Info';
    }
  }
});