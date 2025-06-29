import { analyzeWorkflow as analyzeWorkflowLocal, isAIModelAvailable } from './ai';
import { saveChunk } from './db';
import { exportData } from './export';
import { type DetectedPattern, detectRepetitivePattern } from './pattern-detector';
import {
  analyzeWorkflow as analyzeWorkflowRemote,
  isRemoteAIConfigured,
  isRemoteAIEnabled,
  setRemoteAIEnabled,
  testRemoteAI,
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

// Workflow mode management
type WorkflowMode = 'idle' | 'manual_recording' | 'ambient_active';

class WorkflowManager {
  private mode: WorkflowMode = 'ambient_active';
  private ambientChecker: NodeJS.Timeout | null = null;
  private lastAmbientCheck = 0;

  constructor() {
    // Start ambient detection by default
    this.startAmbientDetection();
  }

  getMode(): WorkflowMode {
    return this.mode;
  }

  // Manual recording methods
  startManualRecording() {
    console.log('Starting manual recording, stopping ambient detection');

    // Stop ambient detection completely
    this.stopAmbientDetection();
    this.mode = 'manual_recording';

    // Notify connected panels about mode change
    broadcastModeChange('manual_recording');
  }

  stopManualRecording() {
    console.log('Stopping manual recording');
    this.mode = 'idle';

    // Notify connected panels about mode change
    broadcastModeChange('idle');

    // Resume ambient detection after a delay
    setTimeout(() => {
      if (this.mode === 'idle') {
        console.log('Resuming ambient detection');
        this.startAmbientDetection();
      }
    }, 5000); // 5 second delay before resuming ambient
  }

  // Ambient detection methods
  private startAmbientDetection() {
    if (this.mode !== 'manual_recording') {
      this.mode = 'ambient_active';
      console.log('Ambient detection started');

      // Notify connected panels about mode change
      broadcastModeChange('ambient_active');

      // Check every minute
      this.ambientChecker = setInterval(() => {
        this.checkForPatterns();
      }, 60000); // 1 minute

      // Also check immediately
      this.checkForPatterns();
    }
  }

  private stopAmbientDetection() {
    if (this.ambientChecker) {
      clearInterval(this.ambientChecker);
      this.ambientChecker = null;
      console.log('Ambient detection stopped');
    }
  }

  private async checkForPatterns() {
    // Only run if still in ambient mode
    if (this.mode !== 'ambient_active') return;

    // Avoid checking too frequently
    const now = Date.now();
    if (now - this.lastAmbientCheck < 60000) return; // Minimum 1 minute between checks
    this.lastAmbientCheck = now;

    console.log('Checking for patterns...');
    const pattern = await detectRepetitivePattern(ring);

    if (pattern && pattern.confidence > 0.75) {
      console.log('Pattern detected with confidence:', pattern.confidence);
      await this.notifyUserOfPattern(pattern);
    }
  }

  async notifyUserOfPattern(pattern: DetectedPattern) {
    // Update badge to notify user
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });

    // Store pattern for panel display
    await chrome.storage.local.set({
      ambientPattern: {
        pattern,
        detectedAt: Date.now(),
        status: 'pending_review',
      },
    });

    // Notify all connected panels
    broadcastPatternDetected(pattern);
  }

  // Method to dismiss detected pattern
  async dismissPattern() {
    // Clear badge
    chrome.action.setBadgeText({ text: '' });

    // Get current pattern before clearing
    const result = await chrome.storage.local.get('ambientPattern');
    if (result.ambientPattern) {
      // Save to history with dismissed status
      await this.savePatternToHistory(result.ambientPattern.pattern, 'dismissed');
    }

    // Clear from storage
    await chrome.storage.local.remove('ambientPattern');
  }

  // Save pattern to history
  async savePatternToHistory(pattern: DetectedPattern, status: 'analyzed' | 'dismissed') {
    const result = await chrome.storage.local.get('patternHistory');
    const history = result.patternHistory || [];

    // Add to history
    history.push({
      pattern,
      detectedAt: Date.now(),
      status,
    });

    // Keep only last 50 patterns
    const trimmedHistory = history.slice(-50);

    await chrome.storage.local.set({ patternHistory: trimmedHistory });
  }
}

// Create global workflow manager instance
const workflowManager = new WorkflowManager();

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
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  // Synchronous messages
  if (msg.kind === 'evtBatch' && msg.evts) {
    push(msg.evts);
    sendResponse({ success: true });
    return false;
  }

  if (msg.kind === 'nav' && msg.url) {
    push([{ type: 'nav', url: msg.url, t: Date.now() }]);
    sendResponse({ success: true });
    return false;
  }

  if (msg.kind === 'export') {
    handleExport();
    sendResponse({ success: true });
    return false;
  }

  // Handle workflow marks
  if (msg.kind === 'mark') {
    handleWorkflowMark(msg.action);
    sendResponse({ success: true });
    return false;
  }

  // Handle manual workflow analysis request
  if (msg.kind === 'analyzeWorkflow') {
    handleWorkflowAnalysis();
    sendResponse({ success: true });
    return false;
  }

  // Async messages - return true to keep channel open
  if (msg.kind === 'retryAnalysis') {
    if (currentWorkflow && currentWorkflow.endIndex !== undefined) {
      handleWorkflowAnalysis();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No workflow available to retry' });
    }
    return false;
  }

  // Handle ambient pattern analysis request
  if (msg.kind === 'analyzeAmbientPattern') {
    (async () => {
      try {
        const stored = await chrome.storage.local.get('ambientPattern');
        if (stored.ambientPattern?.pattern) {
          const pattern = stored.ambientPattern.pattern as DetectedPattern;
          // Convert pattern to workflow format for analysis
          const analysis = await analyzePatternAsWorkflow(pattern);

          // Save to history as analyzed
          await workflowManager.savePatternToHistory(pattern, 'analyzed');

          // Clear the current pattern notification
          chrome.action.setBadgeText({ text: '' });
          await chrome.storage.local.remove('ambientPattern');

          sendResponse({ success: true, analysis });
        } else {
          sendResponse({ success: false, error: 'No ambient pattern found' });
        }
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle ambient pattern dismissal
  if (msg.kind === 'dismissAmbientPattern') {
    (async () => {
      await workflowManager.dismissPattern();
      sendResponse({ success: true });
    })();
    return true; // Keep channel open for async response
  }

  // Handle remote AI settings
  if (msg.kind === 'setRemoteAI') {
    (async () => {
      try {
        await setRemoteAIEnabled(msg.enabled);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error setting remote AI:', error);
        sendResponse({ success: false, error: String(error) });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle remote AI test
  if (msg.kind === 'testRemoteAI') {
    (async () => {
      try {
        const result = await testRemoteAI();
        sendResponse({ success: true, result });
      } catch (error) {
        console.error('Error testing remote AI:', error);
        sendResponse({ success: false, error: String(error) });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle manual pattern check
  if (msg.kind === 'manualPatternCheck') {
    (async () => {
      try {
        console.log('Manual pattern check requested');
        const pattern = await detectRepetitivePattern(ring);

        // If pattern is found with good confidence, trigger notification
        if (pattern && pattern.confidence > 0.75) {
          await workflowManager.notifyUserOfPattern(pattern);
        }

        sendResponse({ success: true, pattern });
      } catch (error) {
        console.error('Error checking patterns:', error);
        sendResponse({ success: false, error: String(error) });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Default response
  sendResponse({ success: true });
  return false;
});

// Push events to ring buffer and broadcast to connected sidepanels
function push(events: RawEvent[]): void {
  ring.push(...events);
  if (ring.length > MAX_EVENTS) ring = ring.slice(-MAX_EVENTS);

  // Broadcast to all connected ports
  for (const port of ports) {
    try {
      port.postMessage({ delta: events } as PortMessage);
    } catch (error) {
      console.error('Error posting message to port:', error);
      ports.delete(port);
    }
  }
}

// Broadcast mode change to all connected panels
function broadcastModeChange(mode: WorkflowMode): void {
  for (const port of ports) {
    try {
      port.postMessage({ modeChange: mode } as PortMessage);
    } catch (error) {
      console.error('Error broadcasting mode change:', error);
      ports.delete(port);
    }
  }
}

// Broadcast pattern detection to all connected panels
function broadcastPatternDetected(pattern: DetectedPattern): void {
  for (const port of ports) {
    try {
      port.postMessage({ patternDetected: pattern } as PortMessage);
    } catch (error) {
      console.error('Error broadcasting pattern detection:', error);
      ports.delete(port);
    }
  }
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
      (chrome.sidePanel as unknown as { open: (options: { windowId: number }) => void }).open({
        windowId: tab.windowId,
      });
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
    // Use WorkflowManager to handle mode switching
    workflowManager.startManualRecording();

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

    // Use WorkflowManager to handle mode switching
    workflowManager.stopManualRecording();

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
    if (currentWorkflow?.startIndex == null || currentWorkflow?.endIndex == null) {
      throw new Error('Invalid workflow indices');
    }
    const workflowEvents = ring.slice(currentWorkflow.startIndex, currentWorkflow.endIndex + 1);

    // Check if roasting mode is enabled
    const roastingMode = await new Promise<boolean>(resolve => {
      chrome.storage.local.get(['roasting_mode'], result => {
        resolve(result.roasting_mode === true);
      });
    });

    // Analyze the workflow using local AI
    const analysis = await analyzeWorkflowLocal(workflowEvents, customPrompt, roastingMode);

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
    if (currentWorkflow?.startIndex == null || currentWorkflow?.endIndex == null) {
      throw new Error('Invalid workflow indices');
    }
    const workflowEvents = ring.slice(currentWorkflow.startIndex, currentWorkflow.endIndex + 1);

    // Check if roasting mode is enabled
    const roastingMode = await new Promise<boolean>(resolve => {
      chrome.storage.local.get(['roasting_mode'], result => {
        resolve(result.roasting_mode === true);
      });
    });

    // Analyze the workflow using remote AI
    const analysis = await analyzeWorkflowRemote(workflowEvents, customPrompt, roastingMode);

    // Broadcast the analysis to all connected ports
    broadcastAnalysis(analysis);
  } catch (error) {
    console.error('Error during remote workflow analysis:', error);
  }
}

// Helper to broadcast analysis to all connected ports
function broadcastAnalysis(analysis: WorkflowAnalysis): void {
  for (const port of ports) {
    try {
      port.postMessage({ analysis } as PortMessage);
    } catch (error) {
      console.error('Error posting analysis message to port:', error);
    }
  }
}

// Analyze a detected pattern as if it were a manually recorded workflow
async function analyzePatternAsWorkflow(pattern: DetectedPattern): Promise<WorkflowAnalysis> {
  try {
    // Check which AI to use
    const useRemoteAI = await isRemoteAIEnabled();

    if (useRemoteAI) {
      const configured = await isRemoteAIConfigured();
      if (!configured) {
        return {
          summary: 'Remote AI not configured',
          steps: [
            {
              action: 'Configuration needed',
              intent: 'Please configure your Anthropic API key in the Debug tab',
            },
          ],
        };
      }

      // Analyze with remote AI
      return await analyzeWorkflowRemote(
        pattern.sequence,
        'This is a repetitive pattern detected automatically. Analyze what the user is trying to accomplish.',
      );
    } else {
      // Check local AI availability
      const available = await isAIModelAvailable();
      if (!available) {
        return {
          summary: 'Chrome AI not available',
          steps: [
            {
              action: 'AI Model Unavailable',
              intent: "Please ensure you're using Chrome 131+ and have enabled Chrome AI",
            },
          ],
        };
      }

      // Analyze with local AI
      return await analyzeWorkflowLocal(
        pattern.sequence,
        'This is a repetitive pattern detected automatically. Analyze what the user is trying to accomplish.',
      );
    }
  } catch (error) {
    console.error('Error analyzing pattern:', error);
    return {
      summary: 'Error analyzing pattern',
      steps: [
        {
          action: 'Analysis failed',
          intent: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    };
  }
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
