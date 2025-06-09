import { testAIModel } from '../src/ai';
import { isRemoteAIEnabled } from '../src/remote-ai';
import { getAllHistoryEntries, saveHistoryEntry, deleteHistoryEntry, clearAllHistory } from '../src/db';
import type { PortMessage, RawEvent, WorkflowAnalysis, WorkflowHistoryEntry } from '../src/types';

// Elements
const log = document.getElementById('log') as HTMLUListElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const startMarkBtn = document.getElementById('startMarkBtn') as HTMLButtonElement;
const stopMarkBtn = document.getElementById('stopMarkBtn') as HTMLButtonElement;
const retryAnalysisBtn = document.getElementById('retryAnalysisBtn') as HTMLButtonElement;
const aiModelLabel = document.getElementById('aiModelLabel') as HTMLSpanElement;
const eventsTab = document.getElementById('eventsTab') as HTMLDivElement;
const analysisTab = document.getElementById('analysisTab') as HTMLDivElement;
const historyTab = document.getElementById('historyTab') as HTMLDivElement;
const debugTab = document.getElementById('debugTab') as HTMLDivElement;
const eventsContent = document.getElementById('eventsContent') as HTMLDivElement;
const analysisContent = document.getElementById('analysisContent') as HTMLDivElement;
const historyContent = document.getElementById('historyContent') as HTMLDivElement;
const debugContent = document.getElementById('debugContent') as HTMLDivElement;
const analysisPlaceholder = document.querySelector('.analysis-placeholder') as HTMLDivElement;
const analysisResults = document.querySelector('.analysis-results') as HTMLDivElement;
const analysisLoading = document.querySelector('.analysis-loading') as HTMLDivElement;
const workflowSummary = document.getElementById('workflowSummary') as HTMLParagraphElement;
const workflowSteps = document.getElementById('workflowSteps') as HTMLDivElement;
const workflowSuggestions = document.getElementById('workflowSuggestions') as HTMLUListElement;
const workflowPrompt = document.getElementById('workflowPrompt') as HTMLTextAreaElement;
const copyPromptBtn = document.getElementById('copyPromptBtn') as HTMLButtonElement;

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
const aiTrialStatusEl = document.getElementById('aiTrialStatus') as HTMLSpanElement;
const langModelStatusEl = document.getElementById('langModelStatus') as HTMLSpanElement;
const paramsEl = document.getElementById('params') as HTMLSpanElement;
const capabilitiesEl = document.getElementById('capabilities') as HTMLSpanElement;
const testResultsEl = document.getElementById('testResults') as HTMLPreElement;
const simpleDiagnosticBtn = document.getElementById('simpleDiagnosticBtn') as HTMLButtonElement;
const roastingModeCheckbox = document.getElementById('roastingModeCheckbox') as HTMLInputElement;

// History tab elements
const historyList = document.getElementById('historyList') as HTMLDivElement;
const clearHistoryBtn = document.getElementById('clearHistoryBtn') as HTMLButtonElement;

// Connect to background service worker
const port = chrome.runtime.connect({ name: 'log' });

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
    hideAnalysisLoading();
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

// Format event for display with better aesthetics
function format(event: RawEvent): string {
  // User interaction events
  if (event.type === 'user') {
    const actionIcon = getActionIcon(event.action);
    let text = `${actionIcon} ${formatAction(event.action)} ${formatTarget(event.target)}`;
    if (event.value && event.action !== 'password') {
      text += ` → "${truncateValue(event.value, 30)}"`;
    }
    return text;
  }

  // Navigation events
  if (event.type === 'nav') {
    return `🌐 Navigate to ${formatUrl(event.url)}`;
  }

  // Tab events
  if (event.type === 'tab') {
    const tabIcon = getTabIcon(event.action);
    return `${tabIcon} Tab ${event.action}`;
  }

  // Page lifecycle events
  if (event.type === 'page') {
    const pageIcon = getPageIcon(event.action);
    return `${pageIcon} Page ${event.action} ${formatUrl(event.url)}`;
  }

  // Visibility state changes
  if (event.type === 'visibility') {
    const visIcon = event.action === 'visible' ? '👀' : '🙈';
    return `${visIcon} Page ${event.action}`;
  }

  // Keyboard events
  if (event.type === 'key') {
    const modifiers: string[] = [];
    if (event.modifiers.ctrl) modifiers.push('Ctrl');
    if (event.modifiers.alt) modifiers.push('Alt');
    if (event.modifiers.shift) modifiers.push('Shift');
    if (event.modifiers.meta) modifiers.push('⌘');

    const keyCombo = modifiers.length ? `${modifiers.join('+')}+${event.key}` : event.key;
    return `⌨️ Key ${keyCombo}`;
  }

  // Mouse hover events
  if (event.type === 'hover') {
    return `🖱️ Hover ${formatTarget(event.target)}`;
  }

  // URL hash changes
  if (event.type === 'hashchange') {
    return `🔗 Hash change to ${new URL(event.to).hash}`;
  }

  // XHR requests
  if (event.type === 'xhr') {
    let urlDisplay = event.url;
    try {
      const url = new URL(event.url, event.pageUrl);
      urlDisplay = url.pathname + url.search;
    } catch (_e) {
      // Use the original if parsing fails
    }
    return `📡 XHR ${event.method} ${formatUrl(urlDisplay)}`;
  }

  // Fetch API requests
  if (event.type === 'fetch') {
    let urlDisplay = event.url;
    try {
      const url = new URL(event.url, event.pageUrl);
      urlDisplay = url.pathname + url.search;
    } catch (_e) {
      // Use the original if parsing fails
    }
    return `🚀 Fetch ${event.method} ${formatUrl(urlDisplay)}`;
  }

  // Workflow mark events (new in v0.5)
  if (event.type === 'mark') {
    const markIcon = event.action === 'start' ? '🟢' : '🔴';
    return `${markIcon} Workflow ${event.action.toUpperCase()}`;
  }

  // Fallback for unknown event types
  return JSON.stringify(event).slice(0, 80);
}

// Helper functions for better formatting
function getActionIcon(action: string): string {
  switch (action) {
    case 'click': return '👆';
    case 'input-debounced': 
    case 'input-at-submit':
    case 'input-enter': return '⌨️';
    case 'select-option': return '📋';
    case 'submit': return '📤';
    case 'scroll': return '📜';
    case 'select': return '🔤';
    default: return '⚡';
  }
}

function getTabIcon(action: string): string {
  switch (action) {
    case 'activated': return '📑';
    case 'created': return '➕';
    case 'removed': return '➖';
    default: return '📋';
  }
}

function getPageIcon(action: string): string {
  switch (action) {
    case 'visit': return '🌍';
    case 'load': return '⚡';
    case 'DOMContentLoaded': return '📄';
    default: return '📃';
  }
}

function formatAction(action: string): string {
  switch (action) {
    case 'input-debounced': return 'Type';
    case 'input-at-submit': return 'Input';
    case 'input-enter': return 'Enter';
    case 'select-option': return 'Select';
    default: return action.charAt(0).toUpperCase() + action.slice(1);
  }
}

function formatTarget(target: string): string {
  // Simplify complex selectors for better readability
  return target.length > 40 ? target.substring(0, 37) + '...' : target;
}

function formatUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = urlObj.pathname + urlObj.search;
    return path === '/' ? domain : `${domain}${path.length > 30 ? path.substring(0, 27) + '...' : path}`;
  } catch {
    return url.length > 40 ? url.substring(0, 37) + '...' : url;
  }
}

function truncateValue(value: string, maxLength: number): string {
  return value.length > maxLength ? value.substring(0, maxLength - 3) + '...' : value;
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
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Show analysis loading indicator
function showAnalysisLoading(): void {
  // Hide placeholder and results
  analysisPlaceholder.style.display = 'none';
  analysisResults.style.display = 'none';

  // Show loading indicator
  analysisLoading.style.display = 'flex';
}

// Hide analysis loading indicator
function hideAnalysisLoading(): void {
  // Hide loading indicator
  analysisLoading.style.display = 'none';
}

// Display analysis results
async function displayAnalysis(analysis: WorkflowAnalysis): Promise<void> {
  // Switch to the analysis tab
  setActiveTab('analysis');

  // Hide placeholder and loading, show results
  analysisPlaceholder.style.display = 'none';
  analysisLoading.style.display = 'none';
  analysisResults.style.display = 'block';

  // Save to history
  saveAnalysisToHistory(analysis);

  // Check if roasting mode is enabled
  const roastingMode = await new Promise<boolean>((resolve) => {
    chrome.storage.local.get(['roasting_mode'], (result) => {
      resolve(result.roasting_mode === true);
    });
  });

  if (roastingMode) {
    // Display roasting mode with hero card
    displayRoastingAnalysis(analysis);
  } else {
    // Display normal analysis
    displayNormalAnalysis(analysis);
  }
}

// Display normal analysis
function displayNormalAnalysis(analysis: WorkflowAnalysis): void {
  // Show all sections
  (document.querySelector('.analysis-section') as HTMLElement)?.style.setProperty('display', 'block');
  (document.querySelector('.analysis-suggestions') as HTMLElement)?.style.setProperty('display', 'block');
  (document.querySelector('.analysis-section:has(#workflowPrompt)') as HTMLElement)?.style.setProperty('display', 'block');

  // Update summary normally
  workflowSummary.textContent = analysis.summary;

  // Update steps
  workflowSteps.innerHTML = '';
  for (const step of analysis.steps) {
    const stepEl = document.createElement('div');
    stepEl.className = 'analysis-step';

    const actionEl = document.createElement('h3');
    actionEl.textContent = step.action;

    const intentEl = document.createElement('p');
    intentEl.textContent = step.intent;

    stepEl.appendChild(actionEl);
    stepEl.appendChild(intentEl);
    workflowSteps.appendChild(stepEl);
  }

  // Update suggestions
  workflowSuggestions.innerHTML = '';
  if (analysis.suggestions && analysis.suggestions.length > 0) {
    for (const suggestion of analysis.suggestions) {
      const li = document.createElement('li');
      li.textContent = suggestion;
      workflowSuggestions.appendChild(li);
    }
  } else {
    const li = document.createElement('li');
    li.textContent = 'No suggestions available';
    workflowSuggestions.appendChild(li);
  }

  // Update workflow prompt
  if (analysis.workflowPrompt) {
    workflowPrompt.value = analysis.workflowPrompt;
  } else {
    workflowPrompt.value = 'No workflow prompt generated';
  }

  // Update debug information
  updateDebugInformation(analysis);
}

// Display roasting analysis with hero card
function displayRoastingAnalysis(analysis: WorkflowAnalysis): void {
  // Hide suggestions and workflow prompt sections
  const suggestionsSection = document.querySelector('.analysis-suggestions') as HTMLElement;
  const workflowPromptSection = workflowPrompt.closest('.analysis-section') as HTMLElement;
  
  if (suggestionsSection) suggestionsSection.style.display = 'none';
  if (workflowPromptSection) workflowPromptSection.style.display = 'none';

  // Create or update hero card for the summary
  const summarySection = workflowSummary.closest('.analysis-section') as HTMLElement;
  if (summarySection) {
    // Replace the normal summary with hero card
    summarySection.innerHTML = `
      <div class="roast-hero-card">
        <h2>🔥 AI Assisted Task Roasting 🔥</h2>
        <p class="roast-hero-text">${analysis.summary}</p>
      </div>
    `;
  }

  // Update steps normally but keep them visible
  workflowSteps.innerHTML = '';
  for (const step of analysis.steps) {
    const stepEl = document.createElement('div');
    stepEl.className = 'analysis-step';

    const actionEl = document.createElement('h3');
    actionEl.textContent = step.action;

    const intentEl = document.createElement('p');
    intentEl.textContent = step.intent;

    stepEl.appendChild(actionEl);
    stepEl.appendChild(intentEl);
    workflowSteps.appendChild(stepEl);
  }

  // Update debug information
  updateDebugInformation(analysis);
}

// Update debug information (shared between normal and roasting analysis)
function updateDebugInformation(analysis: WorkflowAnalysis): void {
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
function setActiveTab(tabId: 'events' | 'analysis' | 'history' | 'debug'): void {
  // Update tab states
  eventsTab.classList.toggle('active', tabId === 'events');
  analysisTab.classList.toggle('active', tabId === 'analysis');
  historyTab.classList.toggle('active', tabId === 'history');
  debugTab.classList.toggle('active', tabId === 'debug');

  // Update content visibility
  eventsContent.classList.toggle('active', tabId === 'events');
  analysisContent.classList.toggle('active', tabId === 'analysis');
  historyContent.classList.toggle('active', tabId === 'history');
  debugContent.classList.toggle('active', tabId === 'debug');

  // Run initial checks if debug tab is activated
  if (tabId === 'debug') {
    checkEnvironment();
    checkModelAvailability();
  }
  
  // Load history if history tab is activated
  if (tabId === 'history') {
    loadHistory();
  }
}

// Start recording workflow
function startRecording(): void {
  startMarkBtn.disabled = true;
  stopMarkBtn.disabled = false;

  chrome.runtime.sendMessage({ kind: 'mark', action: 'start' });
}

// Stop recording workflow
function stopRecording(): void {
  startMarkBtn.disabled = false;
  stopMarkBtn.disabled = true;

  // Switch to analysis tab and show loading indicator
  setActiveTab('analysis');
  showAnalysisLoading();

  // Send stop message to service worker
  chrome.runtime.sendMessage({ kind: 'mark', action: 'stop' });
}

// Retry analysis
function retryAnalysis(): void {
  // Show loading indicator
  setActiveTab('analysis');
  showAnalysisLoading();

  // Send retry message to service worker
  chrome.runtime.sendMessage({ kind: 'retryAnalysis' }, response => {
    if (!response || !response.success) {
      // Hide loading and show error
      hideAnalysisLoading();

      const errorMessage = response?.error || 'Unknown error retrying analysis';
      displayAnalysis({
        summary: 'Error Retrying Analysis',
        steps: [
          {
            action: 'Error',
            intent: errorMessage,
          },
        ],
        debug: {
          error: errorMessage,
          modelStatus: 'error',
        },
      });
    }
    // On success, we'll get a message via port with the analysis results
  });
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
  analysisLoading.style.display = 'none';
  workflowSteps.innerHTML = '';
  workflowSuggestions.innerHTML = '';
  workflowSummary.textContent = '';
  workflowPrompt.value = '';
});

startMarkBtn.addEventListener('click', startRecording);
stopMarkBtn.addEventListener('click', stopRecording);
retryAnalysisBtn.addEventListener('click', retryAnalysis);

// Copy workflow prompt to clipboard
copyPromptBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(workflowPrompt.value);
    copyPromptBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyPromptBtn.textContent = 'Copy Prompt';
    }, 2000);
  } catch (error) {
    console.error('Failed to copy prompt:', error);
    // Fallback: select the text
    workflowPrompt.select();
    workflowPrompt.setSelectionRange(0, 99999);
    copyPromptBtn.textContent = 'Text Selected';
    setTimeout(() => {
      copyPromptBtn.textContent = 'Copy Prompt';
    }, 2000);
  }
});

eventsTab.addEventListener('click', () => setActiveTab('events'));
analysisTab.addEventListener('click', () => setActiveTab('analysis'));
historyTab.addEventListener('click', () => setActiveTab('history'));
debugTab.addEventListener('click', () => setActiveTab('debug'));

// Debug tab functionality
// Check environment
function checkEnvironment() {
  // Check radio buttons state based on current setting
  loadAISettings();

  // Check if LanguageModel is available
  if (typeof LanguageModel !== 'undefined') {
    aiTrialStatusEl.textContent = '✅ Yes';
  } else {
    aiTrialStatusEl.textContent = '❌ No';
  }

  // Check if key LanguageModel methods are available
  if (
    typeof LanguageModel !== 'undefined' &&
    'availability' in LanguageModel &&
    'create' in LanguageModel
  ) {
    langModelStatusEl.textContent = '✅ Yes';
  } else {
    langModelStatusEl.textContent = '❌ No';
  }
}

// Load AI settings from storage
async function loadAISettings() {
  chrome.storage.local.get(['use_remote_ai', 'roasting_mode'], result => {
    const useRemoteAI = result.use_remote_ai === true;
    const roastingMode = result.roasting_mode === true;

    // Set radio buttons
    (document.getElementById('remoteAiRadio') as HTMLInputElement).checked = useRemoteAI;
    (document.getElementById('localAiRadio') as HTMLInputElement).checked = !useRemoteAI;
    
    // Set roasting mode checkbox
    roastingModeCheckbox.checked = roastingMode;
  });
}

// Handle AI model selection change
function handleAIModelChange() {
  const useRemoteAI = (document.getElementById('remoteAiRadio') as HTMLInputElement).checked;

  // Save setting to storage and notify service worker
  try {
    chrome.runtime.sendMessage(
      {
        kind: 'setRemoteAI',
        enabled: useRemoteAI,
      },
      response => {
        if (response?.success) {
          console.log('AI model switched successfully');
          updateAIModelLabel();
        } else {
          // Even without a response, try to update the label since the storage should be updated
          console.log('No response from service worker, but continuing anyway');
          updateAIModelLabel();
        }
      },
    );

    // Update storage directly as well for redundancy
    chrome.storage.local.set({ use_remote_ai: useRemoteAI }, () => {
      console.log('AI model setting saved to storage');
      updateAIModelLabel();
    });
  } catch (error) {
    console.error('Error in handleAIModelChange:', error);
  }
}

// Handle roasting mode toggle change
function handleRoastingModeChange() {
  const roastingMode = roastingModeCheckbox.checked;

  // Save setting to storage
  chrome.storage.local.set({ roasting_mode: roastingMode }, () => {
    console.log('Roasting mode setting saved to storage:', roastingMode);
  });
}

// Check model availability
async function checkModelAvailability() {
  statusEl.textContent = 'Checking...';
  statusEl.className = 'status';

  try {
    // Check actual availability status
    const available = await LanguageModel.availability();
    if (available === 'available') {
      statusEl.textContent = '✅ Available';
      statusEl.className = 'status available';
    } else if (available === 'downloadable' || available === 'downloading') {
      statusEl.textContent = '⚠️ Available after download';
      statusEl.className = 'status available';
    } else {
      statusEl.textContent = `❌ Not Available (status: ${available})`;
      statusEl.className = 'status unavailable';
    }

    // Try to get parameters
    try {
      const params = await LanguageModel.params();
      paramsEl.textContent = JSON.stringify(params, null, 2);
    } catch (error) {
      paramsEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    // Model capabilities is part of the params response
    capabilitiesEl.textContent = 'Model capabilities included in params response';
  } catch (error) {
    statusEl.textContent = `❌ Error checking availability: ${error instanceof Error ? error.message : 'Unknown error'}`;
    statusEl.className = 'status unavailable';
  }
}

// Add event listeners for debug tab
checkBtn.addEventListener('click', checkModelAvailability);
simpleDiagnosticBtn.addEventListener('click', runDiagnosticTest);
document.getElementById('localAiRadio')?.addEventListener('change', handleAIModelChange);
document.getElementById('remoteAiRadio')?.addEventListener('change', handleAIModelChange);
roastingModeCheckbox.addEventListener('change', handleRoastingModeChange);

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

// Update AI model label based on current setting
async function updateAIModelLabel() {
  try {
    const useRemoteAI = await isRemoteAIEnabled();
    aiModelLabel.textContent = useRemoteAI ? 'Using: Claude AI' : 'Using: Chrome AI';

    // Also update radio buttons if they exist
    const localRadio = document.getElementById('localAiRadio') as HTMLInputElement | null;
    const remoteRadio = document.getElementById('remoteAiRadio') as HTMLInputElement | null;

    if (localRadio && remoteRadio) {
      localRadio.checked = !useRemoteAI;
      remoteRadio.checked = useRemoteAI;
    }
  } catch (error) {
    console.error('Error updating AI model label:', error);
    aiModelLabel.textContent = 'Using: Unknown';
  }
}

// History management functions
async function saveAnalysisToHistory(analysis: WorkflowAnalysis): Promise<void> {
  try {
    const historyEntry: WorkflowHistoryEntry = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      analysis,
      title: generateHistoryTitle(analysis.summary),
    };
    
    await saveHistoryEntry(historyEntry);
  } catch (error) {
    console.error('Failed to save analysis to history:', error);
  }
}

function generateHistoryTitle(summary: string): string {
  // Generate a concise title from the summary
  const words = summary.split(' ').slice(0, 6);
  let title = words.join(' ');
  if (summary.split(' ').length > 6) {
    title += '...';
  }
  return title || 'Workflow Analysis';
}

async function loadHistory(): Promise<void> {
  try {
    const entries = await getAllHistoryEntries();
    renderHistoryList(entries);
  } catch (error) {
    console.error('Failed to load history:', error);
    historyList.innerHTML = '<div class="history-placeholder"><p>Error loading history.</p></div>';
  }
}

function renderHistoryList(entries: WorkflowHistoryEntry[]): void {
  if (entries.length === 0) {
    historyList.innerHTML = `
      <div class="history-placeholder">
        <p>No workflow analyses in history yet.</p>
        <p>Complete a workflow analysis to see it appear here.</p>
      </div>
    `;
    return;
  }

  historyList.innerHTML = entries.map(entry => `
    <div class="history-item" data-id="${entry.id}">
      <div class="history-item-header">
        <h3 class="history-item-title">${entry.title}</h3>
        <span class="history-item-date">${formatHistoryDate(entry.timestamp)}</span>
      </div>
      <p class="history-item-summary">${entry.analysis.summary}</p>
      <div class="history-item-actions">
        <button class="btn btn-secondary history-action-btn" onclick="viewHistoryItem('${entry.id}')">View</button>
        <button class="btn btn-danger history-action-btn" onclick="deleteHistoryItem('${entry.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function formatHistoryDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Global functions for onclick handlers
(window as any).viewHistoryItem = async (id: string) => {
  try {
    const entries = await getAllHistoryEntries();
    const entry = entries.find(e => e.id === id);
    if (entry) {
      displayAnalysis(entry.analysis);
    }
  } catch (error) {
    console.error('Failed to view history item:', error);
  }
};

(window as any).deleteHistoryItem = async (id: string) => {
  if (confirm('Are you sure you want to delete this analysis?')) {
    try {
      await deleteHistoryEntry(id);
      loadHistory(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete history item:', error);
    }
  }
};

// Clear history button handler
clearHistoryBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all analysis history? This cannot be undone.')) {
    try {
      await clearAllHistory();
      loadHistory(); // Refresh the list
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }
});

// Initialize when document is loaded
(async function init() {
  await updateAIModelLabel();

  // Listen for storage changes to update model label
  chrome.storage.onChanged.addListener(changes => {
    if (changes.use_remote_ai) {
      updateAIModelLabel();
    }
  });

  // When debug tab is clicked, make sure radio buttons are updated
  debugTab.addEventListener('click', async () => {
    await updateAIModelLabel();
  });
})();
