<script lang="ts">
import type { WorkflowAnalysis } from '../../src/types';
import { saveAnalysisToHistory } from '../stores/history';
import { analysisLoading, currentAnalysis, roastingMode } from '../stores/workflow';

let showDebugInfo = $state(false);

function handleRetryAnalysis() {
  chrome.runtime.sendMessage({ kind: 'retryAnalysis' });
}

function handleCopyPrompt() {
  if ($currentAnalysis?.workflowPrompt) {
    navigator.clipboard.writeText($currentAnalysis.workflowPrompt);
  }
}

function toggleDebugInfo() {
  showDebugInfo = !showDebugInfo;
}

// Save analysis to history when it arrives
let prevAnalysis: WorkflowAnalysis | null = null;

$effect(() => {
  // Only save if it's a new analysis (not the same one)
  if ($currentAnalysis && $currentAnalysis !== prevAnalysis && !$analysisLoading) {
    prevAnalysis = $currentAnalysis;
    saveAnalysisToHistory($currentAnalysis);
  }
});
</script>

<div class="analysis-tab">
  {#if !$currentAnalysis && !$analysisLoading}
    <div class="analysis-placeholder">
      <p>Mark a workflow with Start/Stop buttons to see AI analysis here.</p>
    </div>
  {/if}

  {#if $analysisLoading}
    <div class="analysis-loading">
      <div class="loading-spinner"></div>
      <p>Analyzing workflow...</p>
    </div>
  {/if}

  {#if $currentAnalysis && !$analysisLoading}
    <div class="analysis-results">
      {#if $roastingMode}
        <div class="analysis-section">
          <div class="roast-hero-card">
            <h2>🔥 AI Assisted Task Roasting 🔥</h2>
            <p class="roast-hero-text">{$currentAnalysis.summary}</p>
          </div>
        </div>
      {:else}
        <div class="analysis-section">
          <h2>Workflow Summary</h2>
          <p>{$currentAnalysis.summary}</p>
        </div>
      {/if}

      <div class="analysis-section">
        <h2>Step-by-Step Analysis</h2>
        <div class="workflow-steps">
          {#each $currentAnalysis.steps as step}
            <div class="analysis-step">
              <h3>{step.action}</h3>
              <p>{step.intent}</p>
            </div>
          {/each}
        </div>
      </div>

      {#if $currentAnalysis.suggestions && $currentAnalysis.suggestions.length > 0 && !$roastingMode}
        <div class="analysis-section analysis-suggestions">
          <h2>Suggestions</h2>
          <ul>
            {#each $currentAnalysis.suggestions as suggestion}
              <li>{suggestion}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if $currentAnalysis.workflowPrompt && !$roastingMode}
        <div class="analysis-section">
          <h2>Workflow Prompt</h2>
          <div class="workflow-prompt-container">
            <textarea 
              readonly 
              class="workflow-prompt"
              value={$currentAnalysis.workflowPrompt}
            ></textarea>
            <button class="btn btn-secondary" onclick={handleCopyPrompt}>
              Copy Prompt
            </button>
          </div>
        </div>
      {/if}

      <div class="analysis-actions">
        <button class="btn btn-primary" onclick={handleRetryAnalysis}>
          Retry Analysis
        </button>
      </div>

      {#if $currentAnalysis.debug}
        <div class="analysis-section analysis-debug">
          <h2>Debug Information</h2>
          <div class="debug-toggle">
            <button 
              class="btn {$currentAnalysis.debug.error ? 'btn-danger' : 'btn-secondary'}" 
              onclick={toggleDebugInfo}
            >
              {showDebugInfo ? 'Hide' : 'Show'} {$currentAnalysis.debug.error ? 'Error' : 'Debug'} Info
            </button>
          </div>
          
          {#if showDebugInfo}
            <div class="debug-info">
              <div class="debug-info-section">
                <h3>Error Details</h3>
                <pre class="debug-code {$currentAnalysis.debug.error ? 'error-highlight' : ''}">{$currentAnalysis.debug.error || 'No errors'}</pre>
              </div>
              <div class="debug-info-section">
                <h3>Model Status</h3>
                <pre class="debug-code">{$currentAnalysis.debug.modelStatus || 'Unknown'}</pre>
              </div>
              <div class="debug-info-section">
                <h3>Prompt Sent to Model</h3>
                <pre class="debug-code">{$currentAnalysis.debug.prompt || 'No prompt available'}</pre>
              </div>
              <div class="debug-info-section">
                <h3>Raw Model Response</h3>
                <pre class="debug-code">{$currentAnalysis.debug.rawResponse || 'No response available'}</pre>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .analysis-tab {
    padding: 12px;
    overflow-y: auto;
    height: 100%;
  }

  .analysis-placeholder {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-color);
    opacity: 0.6;
  }

  .analysis-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 0;
  }

  .loading-spinner {
    border: 4px solid rgba(var(--secondary-btn-rgb, 33, 150, 243), 0.2);
    border-radius: 50%;
    border-top: 4px solid var(--secondary-btn);
    width: 40px;
    height: 40px;
    margin-bottom: 16px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .analysis-section {
    margin-bottom: 16px;
  }

  .analysis-section h2 {
    font-size: 16px;
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border-color);
  }

  .analysis-section p {
    margin: 0 0 8px 0;
    line-height: 1.5;
    font-size: 14px;
  }

  .workflow-steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .analysis-step {
    padding: 8px;
    margin-bottom: 8px;
    border-radius: 4px;
    background-color: var(--section-bg);
    border-left: 3px solid var(--secondary-btn);
  }

  .analysis-step h3 {
    font-size: 14px;
    margin: 0 0 4px 0;
  }

  .analysis-step p {
    margin: 0;
    color: var(--text-color);
    opacity: 0.8;
    font-size: 14px;
  }

  .analysis-suggestions {
    margin-top: 16px;
    padding: 8px;
    background-color: var(--section-bg);
    border-radius: 4px;
  }

  .analysis-suggestions ul {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
  }

  .workflow-prompt-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .workflow-prompt {
    width: 100%;
    min-height: 80px;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background-color: var(--section-bg);
    color: var(--text-color);
    resize: vertical;
    font-family: inherit;
    font-size: 14px;
  }

  .analysis-actions {
    margin: 16px 0;
    display: flex;
    justify-content: center;
  }

  /* Roasting mode styles */
  .roast-hero-card {
    background: linear-gradient(135deg, #ff6b6b, #ee5a52);
    border-radius: 16px;
    padding: 32px 24px;
    margin: 16px 0;
    text-align: center;
    box-shadow: 0 8px 32px rgba(238, 90, 82, 0.3);
    border: none;
    position: relative;
    overflow: hidden;
  }

  .roast-hero-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.1) 75%), 
                linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.1) 75%);
    background-size: 20px 20px;
    background-position: 0 0, 10px 10px;
    opacity: 0.3;
    pointer-events: none;
  }

  .roast-hero-card h2 {
    color: white;
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 16px 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    position: relative;
    z-index: 1;
    border: none;
  }

  .roast-hero-text {
    color: white;
    font-size: 20px;
    font-weight: 500;
    line-height: 1.4;
    margin: 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    position: relative;
    z-index: 1;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @media (prefers-color-scheme: dark) {
    .roast-hero-card {
      background: linear-gradient(135deg, #d63384, #c2185b);
      box-shadow: 0 8px 32px rgba(214, 51, 132, 0.4);
    }
  }

  /* Debug styles */
  .analysis-debug {
    margin-top: 24px;
    border-top: 1px dashed var(--border-color);
    padding-top: 16px;
  }

  .debug-toggle {
    margin-bottom: 12px;
  }

  .debug-info-section {
    margin-bottom: 16px;
  }

  .debug-info-section h3 {
    font-size: 14px;
    margin: 0 0 8px 0;
    color: var(--text-color);
    opacity: 0.8;
  }

  .debug-code {
    max-height: 200px;
    overflow-y: auto;
    font-size: 12px;
    background-color: var(--section-bg);
    color: var(--text-color);
    padding: 12px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    font-family: monospace;
    white-space: pre-wrap;
  }

  .error-highlight {
    background-color: rgba(var(--danger-btn-rgb, 244, 67, 54), 0.1);
    border-left: 3px solid var(--danger-btn);
  }
</style>