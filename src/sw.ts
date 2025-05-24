import { analyzeWorkflow as analyzeWorkflowLocal, isAIModelAvailable } from './ai';
import { saveChunk } from './db';
import { exportData } from './export';
import {
  analyzeWorkflow as analyzeWorkflowRemote,
  isRemoteAIConfigured,
  isRemoteAIEnabled,
} from './remote-ai';
import type { Message, PortMessage, RawEvent, WorkflowAnalysis, WorkflowMarkers } from './types';

const MAX_EVENTS = 10_000;
let ring: RawEvent[] = []; // ring-buffer in memory
const ports = new Set<chrome.runtime.Port>(); // live side-panel connections

// Persist to IndexedDB periodically
const PERSIST_INTERVAL_MS = 2000;
let lastPersistedIndex = 0;

// Workflow markers
let currentWorkflow: WorkflowMarkers | null = null;

// Tab management
chrome.tabs.onActivated.addListener(activeInfo => {
  // Get the tab details to include the title
  chrome.tabs.get(activeInfo.tabId, tab => {
    const event: RawEvent = {
      type: 'tab',
      action: 'activated',
      t: Date.now(),
      title: tab.title || 'Untitled Tab',
    };
    push([event]);
  });
});

chrome.tabs.onCreated.addListener(() => {
  const event: RawEvent = {
    type: 'tab',
    action: 'created',
    t: Date.now(),
  };
  push([event]);
});

chrome.tabs.onRemoved.addListener(() => {
  const event: RawEvent = {
    type: 'tab',
    action: 'removed',
    t: Date.now(),
  };
  push([event]);
});

// Receive batched events from content script
chrome.runtime.onMessage.addListener(async (msg: Message, _sender, sendResponse) => {
  if (msg.kind === 'evtBatch' && msg.evts) push(msg.evts);

  if (msg.kind === 'nav' && msg.url) {
    push([{ type: 'nav', url: msg.url, t: Date.now() }]);
  }

  if (msg.kind === 'export') {
    handleExport();
  }

  // Handle workflow marks
  if (msg.kind === 'mark') {
    handleWorkflowMark(msg.action);
  }

  // Handle manual workflow analysis request
  if (msg.kind === 'analyzeWorkflow') {
    handleWorkflowAnalysis();
  }

  // Handle retry analysis request
  if (msg.kind === 'retryAnalysis') {
    if (currentWorkflow && currentWorkflow.endIndex !== undefined) {
      handleWorkflowAnalysis();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No workflow available to retry' });
    }
    return true;
  }

  // Handle remote AI settings
  if (msg.kind === 'setRemoteAI') {
    try {
      const { setRemoteAIEnabled } = await import('./remote-ai');
      await setRemoteAIEnabled(msg.enabled);
      // Make sure to return true so Chrome knows we'll call sendResponse later
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error setting remote AI:', error);
      sendResponse({ success: false, error: String(error) });
    }
    return true; // Keep the message channel open for async response
  }

  // Handle remote AI test
  if (msg.kind === 'testRemoteAI') {
    try {
      const { testRemoteAI } = await import('./remote-ai');
      const result = await testRemoteAI();
      sendResponse({ success: true, result });
    } catch (error) {
      console.error('Error testing remote AI:', error);
      sendResponse({ success: false, error: String(error) });
    }
    return true; // Keep the message channel open for async response
  }

  sendResponse({ success: true });
  return true; // Keep the message channel open for async responses
});

// Push events to ring buffer and broadcast to connected sidepanels
function push(events: RawEvent[]): void {
  ring.push(...events);
  if (ring.length > MAX_EVENTS) ring = ring.slice(-MAX_EVENTS);

  // Broadcast to all connected ports
  ports.forEach(port => {
    try {
      port.postMessage({ delta: events } as PortMessage);
    } catch (error) {
      console.error('Error posting message to port:', error);
      ports.delete(port);
    }
  });
}

// Stream to side-panel
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'log') return;
  ports.add(port);

  // Send initial state
  port.postMessage({ init: ring } as PortMessage);

  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
});

// Toolbar click opens panel
chrome.action.onClicked.addListener(tab => {
  if (tab.windowId && chrome.sidePanel) {
    try {
      // First ensure the side panel is enabled and configured
      chrome.sidePanel.setOptions({
        path: 'ui/sidepanel.html',
        enabled: true,
      });

      // Use cast to any to bypass TypeScript error with the open method
      // which exists in the actual Chrome API but might be missing in type definitions
      (chrome.sidePanel as any).open({ windowId: tab.windowId });
    } catch (error) {
      console.error('Error with side panel API:', error);
    }
  }
});

// Handle workflow mark events
function handleWorkflowMark(action: 'start' | 'stop'): void {
  const now = Date.now();
  const markEvent: RawEvent = {
    type: 'mark',
    action,
    t: now,
  };

  // Add the mark event to the ring buffer
  push([markEvent]);

  if (action === 'start') {
    // Start a new workflow
    currentWorkflow = {
      startIndex: ring.length - 1,
      startTime: now,
    };
    console.log('Workflow recording started', currentWorkflow);
  } else if (action === 'stop' && currentWorkflow) {
    // Complete the current workflow
    currentWorkflow.endIndex = ring.length - 1;
    currentWorkflow.endTime = now;
    console.log('Workflow recording stopped', currentWorkflow);

    // Automatically analyze the workflow
    handleWorkflowAnalysis();
  }
}

// Analyze the current workflow with AI
async function handleWorkflowAnalysis(customPrompt?: string): Promise<void> {
  if (!currentWorkflow || currentWorkflow.endIndex === undefined) {
    console.error('No complete workflow available for analysis');
    return;
  }

  // Check if remote AI is enabled
  const useRemoteAI = await isRemoteAIEnabled();
  console.log('Using remote AI:', useRemoteAI);

  if (useRemoteAI) {
    await handleRemoteAnalysis(customPrompt);
  } else {
    await handleLocalAnalysis(customPrompt);
  }
}

// Handle local (Chrome built-in) AI analysis
async function handleLocalAnalysis(customPrompt?: string): Promise<void> {
  // Check if AI model is available
  const modelAvailable = await isAIModelAvailable();
  if (!modelAvailable) {
    const errorAnalysis: WorkflowAnalysis = {
      summary: 'AI Model Not Available',
      steps: [
        {
          action: 'Error: Chrome AI Model not available in this browser',
          intent:
            'Please ensure you are using Chrome 131+ with the AI Origin Trial enabled, or switch to remote AI in the Debug panel',
        },
      ],
    };

    // Broadcast the error analysis to all connected ports
    broadcastAnalysis(errorAnalysis);
    return;
  }

  try {
    // Extract the events between start and stop markers
    const workflowEvents = ring.slice(currentWorkflow!.startIndex, currentWorkflow!.endIndex! + 1);

    // Analyze the workflow using local AI
    const analysis = await analyzeWorkflowLocal(workflowEvents, customPrompt);

    // Broadcast the analysis to all connected ports
    broadcastAnalysis(analysis);
  } catch (error) {
    console.error('Error during local workflow analysis:', error);
  }
}

// Handle remote (Claude API) AI analysis
async function handleRemoteAnalysis(customPrompt?: string): Promise<void> {
  // Check if remote AI is configured
  const isConfigured = await isRemoteAIConfigured();
  if (!isConfigured) {
    const errorAnalysis: WorkflowAnalysis = {
      summary: 'Claude API Not Configured',
      steps: [
        {
          action: 'Error: Claude API key not configured',
          intent: 'Please add VITE_ANTHROPIC_API_KEY to your .env file',
        },
      ],
    };

    broadcastAnalysis(errorAnalysis);
    return;
  }

  try {
    // Extract the events between start and stop markers
    const workflowEvents = ring.slice(currentWorkflow!.startIndex, currentWorkflow!.endIndex! + 1);

    // Analyze the workflow using remote AI
    const analysis = await analyzeWorkflowRemote(workflowEvents, customPrompt);

    // Broadcast the analysis to all connected ports
    broadcastAnalysis(analysis);
  } catch (error) {
    console.error('Error during remote workflow analysis:', error);
  }
}

// Helper to broadcast analysis to all connected ports
function broadcastAnalysis(analysis: WorkflowAnalysis): void {
  ports.forEach(port => {
    try {
      port.postMessage({ analysis } as PortMessage);
    } catch (error) {
      console.error('Error posting analysis message to port:', error);
    }
  });
}

// Periodically persist events to IndexedDB
async function persistEvents() {
  try {
    if (lastPersistedIndex < ring.length) {
      const newEvents = ring.slice(lastPersistedIndex);
      if (newEvents.length > 0) {
        await saveChunk(newEvents);
        lastPersistedIndex = ring.length;
      }
    }
  } catch (error) {
    console.error('Error persisting events:', error);
  }
}

// Handle export request
async function handleExport() {
  try {
    await exportData();
  } catch (error) {
    console.error('Error exporting data:', error);
  }
}

// Start persistence interval
setInterval(persistEvents, PERSIST_INTERVAL_MS);
