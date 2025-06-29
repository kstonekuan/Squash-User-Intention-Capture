<script lang="ts">
import { onMount } from 'svelte';
import type { PortMessage } from '../../src/types';
import { addEvents, initEventLog } from '../stores/events';
import { loadSettings, useRemoteAI } from '../stores/settings';
import {
  analysisLoading,
  currentAnalysis,
  detectedPattern,
  workflowMode,
} from '../stores/workflow';
import AnalysisTab from './AnalysisTab.svelte';
import DebugTab from './DebugTab.svelte';
// Import all child components
import EventsTab from './EventsTab.svelte';
import HistoryTab from './HistoryTab.svelte';
import PatternNotification from './PatternNotification.svelte';
import PatternsTab from './PatternsTab.svelte';

// activeTab is now defined at the bottom of the script section
let port: chrome.runtime.Port;

onMount(() => {
  // Load settings from storage
  loadSettings();

  // Connect to background service worker
  port = chrome.runtime.connect({ name: 'log' });

  // Handle messages from service worker
  port.onMessage.addListener((message: PortMessage) => {
    if ('init' in message && message.init) {
      initEventLog(message.init);
    }

    if ('delta' in message && message.delta) {
      addEvents(message.delta);
    }

    if ('analysis' in message && message.analysis) {
      analysisLoading.set(false);
      currentAnalysis.set(message.analysis);
      activeTab = 'analysis';
    }

    if ('modeChange' in message && message.modeChange) {
      workflowMode.set(message.modeChange);
    }

    if ('patternDetected' in message && message.patternDetected) {
      detectedPattern.set(message.patternDetected);
    }
  });

  // Check for pending pattern notifications
  chrome.storage.local.get(['ambientPattern'], result => {
    if (result.ambientPattern && result.ambientPattern.status === 'pending_review') {
      detectedPattern.set(result.ambientPattern.pattern);
    }
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener(changes => {
    if (changes.use_remote_ai) {
      useRemoteAI.set(changes.use_remote_ai.newValue);
    }

    if (changes.ambientPattern) {
      if (changes.ambientPattern.newValue?.status === 'pending_review') {
        detectedPattern.set(changes.ambientPattern.newValue.pattern);
      } else {
        detectedPattern.set(null);
      }
    }
  });

  // Listen for custom tab switch event
  window.addEventListener('switchTab', ((
    e: CustomEvent<'events' | 'analysis' | 'history' | 'patterns' | 'debug'>,
  ) => {
    activeTab = e.detail;
  }) as EventListener);

  return () => {
    port.disconnect();
  };
});

// Functions moved to bottom of script section

const aiModelLabel = $derived($useRemoteAI ? 'Using: Claude API' : 'Using: Chrome AI');

// Derived UI state
const uiState = $derived({
  modeText:
    $workflowMode === 'manual_recording'
      ? 'Recording'
      : $workflowMode === 'ambient_active'
        ? 'Ambient Detection'
        : 'Idle',
  modeClass:
    $workflowMode === 'manual_recording'
      ? 'recording'
      : $workflowMode === 'ambient_active'
        ? 'ambient'
        : 'idle',
  showPulseDot: $workflowMode === 'manual_recording',
  startButtonDisabled: $workflowMode === 'manual_recording',
  stopButtonDisabled: $workflowMode !== 'manual_recording',
});

// Make activeTab reactive
let activeTab = $state<'events' | 'analysis' | 'history' | 'patterns' | 'debug'>('events');

// Function names shouldn't have underscores unless they're unused
function handleStartMark() {
  chrome.runtime.sendMessage({ kind: 'mark', action: 'start' });
}

function handleStopMark() {
  chrome.runtime.sendMessage({ kind: 'mark', action: 'stop' });
  // Show loading state for analysis
  analysisLoading.set(true);
}

function handleAnalyzePattern() {
  activeTab = 'analysis';
  analysisLoading.set(true);
  chrome.runtime.sendMessage({ kind: 'analyzeAmbientPattern' }, response => {
    if (response.success && response.analysis) {
      analysisLoading.set(false);
      currentAnalysis.set(response.analysis);
      detectedPattern.set(null);
    } else {
      analysisLoading.set(false);
      console.error('Failed to analyze pattern:', response.error);
    }
  });
}

function handleDismissPattern() {
  chrome.runtime.sendMessage({ kind: 'dismissAmbientPattern' });
  detectedPattern.set(null);
}
</script>

<div class="container">
  <div class="header">
    <h1>Squash: Intent Capture</h1>
    <div class="toolbar">
      <span id="aiModelLabel" class="model-label">{aiModelLabel}</span>
    </div>
  </div>
  
  <div class="mode-indicator">
    <span class="mode-badge {uiState.modeClass}">
      {#if uiState.showPulseDot}
        <span class="pulse-dot {uiState.modeClass === 'recording' ? 'record-dot' : ''}"></span>
      {/if}
      {uiState.modeText}
    </span>
  </div>
  
  <PatternNotification
    pattern={$detectedPattern}
    onAnalyze={handleAnalyzePattern}
    onDismiss={handleDismissPattern}
  />
  
  <div class="workflow-actions">
    <button 
      id="startMarkBtn" 
      class="btn btn-primary" 
      onclick={handleStartMark}
      disabled={uiState.startButtonDisabled}
    >
      Start Mark
    </button>
    <button 
      id="stopMarkBtn" 
      class="btn btn-danger" 
      onclick={handleStopMark}
      disabled={uiState.stopButtonDisabled}
    >
      Stop Mark
    </button>
  </div>
  
  <div class="content">
    <div class="tabs" role="tablist">
      <button 
        class="tab"
        class:active={activeTab === 'events'}
        onclick={() => activeTab = 'events'}
        role="tab"
        aria-selected={activeTab === 'events'}
        aria-controls="events-panel"
      >
        Events
      </button>
      <button 
        class="tab"
        class:active={activeTab === 'analysis'}
        onclick={() => activeTab = 'analysis'}
        role="tab"
        aria-selected={activeTab === 'analysis'}
        aria-controls="analysis-panel"
      >
        Analysis
      </button>
      <button 
        class="tab"
        class:active={activeTab === 'history'}
        onclick={() => activeTab = 'history'}
        role="tab"
        aria-selected={activeTab === 'history'}
        aria-controls="history-panel"
      >
        History
      </button>
      <button 
        class="tab"
        class:active={activeTab === 'patterns'}
        onclick={() => activeTab = 'patterns'}
        role="tab"
        aria-selected={activeTab === 'patterns'}
        aria-controls="patterns-panel"
      >
        Patterns
      </button>
      <button 
        class="tab"
        class:active={activeTab === 'debug'}
        onclick={() => activeTab = 'debug'}
        role="tab"
        aria-selected={activeTab === 'debug'}
        aria-controls="debug-panel"
      >
        Debug
      </button>
    </div>
    
    <div 
      id="events-panel"
      class="tab-content" 
      class:active={activeTab === 'events'}
      role="tabpanel"
      aria-labelledby="events-tab"
    >
      <EventsTab />
    </div>
    
    <div 
      id="analysis-panel"
      class="tab-content" 
      class:active={activeTab === 'analysis'}
      role="tabpanel"
      aria-labelledby="analysis-tab"
    >
      <AnalysisTab />
    </div>
    
    <div 
      id="history-panel"
      class="tab-content" 
      class:active={activeTab === 'history'}
      role="tabpanel"
      aria-labelledby="history-tab"
    >
      <HistoryTab />
    </div>
    
    <div 
      id="patterns-panel"
      class="tab-content" 
      class:active={activeTab === 'patterns'}
      role="tabpanel"
      aria-labelledby="patterns-tab"
    >
      <PatternsTab />
    </div>
    
    <div 
      id="debug-panel"
      class="tab-content" 
      class:active={activeTab === 'debug'}
      role="tabpanel"
      aria-labelledby="debug-tab"
    >
      <DebugTab />
    </div>
  </div>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: var(--header-bg);
    border-bottom: 1px solid var(--border-color);
    height: 40px;
    box-sizing: border-box;
  }

  .header h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  
  .model-label {
    font-size: 12px;
    background-color: var(--section-bg);
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--text-color);
    opacity: 0.8;
    margin-right: 6px;
  }

  .mode-indicator {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 8px;
    background-color: var(--section-bg);
    border-bottom: 1px solid var(--border-color);
  }

  .mode-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 500;
  }

  .mode-badge.ambient {
    background-color: rgba(76, 175, 80, 0.1);
    color: #4caf50;
    border: 1px solid rgba(76, 175, 80, 0.3);
  }

  .mode-badge.recording {
    background-color: rgba(244, 67, 54, 0.1);
    color: #f44336;
    border: 1px solid rgba(244, 67, 54, 0.3);
  }

  .mode-badge.idle {
    background-color: rgba(158, 158, 158, 0.1);
    color: #9e9e9e;
    border: 1px solid rgba(158, 158, 158, 0.3);
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #4caf50;
    animation: pulse 2s infinite;
  }

  .record-dot {
    background-color: #f44336;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
  }

  .workflow-actions {
    display: flex;
    padding: 8px;
    border-bottom: 1px solid var(--border-color);
    gap: 8px;
  }

  .content {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    overflow: hidden;
  }

  .tabs {
    display: flex;
    background-color: var(--section-bg);
    border-bottom: 1px solid var(--border-color);
  }

  .tab {
    padding: 8px 14px;
    cursor: pointer;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 14px;
    background: none;
    color: var(--text-color);
    font-family: inherit;
  }

  .tab.active {
    border-bottom-color: var(--secondary-btn);
    font-weight: 500;
  }

  .tab-content {
    display: none;
    flex-grow: 1;
    overflow: auto;
  }

  .tab-content.active {
    display: flex;
    flex-direction: column;
  }

  .btn {
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
    color: var(--text-color);
  }

  .btn:hover:not(:disabled) {
    background-color: var(--row-hover);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: var(--primary-btn);
    color: white;
    border-color: var(--primary-btn);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--primary-btn-hover);
  }

  .btn-danger {
    background-color: var(--danger-btn);
    color: white;
    border-color: var(--danger-btn);
  }

  .btn-danger:hover:not(:disabled) {
    background-color: var(--danger-btn-hover);
  }
</style>