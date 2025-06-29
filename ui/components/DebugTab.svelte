<script lang="ts">
import { onMount } from 'svelte';
import { ambientDetectionEnabled, saveAIModelSelection, useRemoteAI } from '../stores/settings';

let localAIStatus = $state('Checking...');
let localAIAvailable = $state(false);
let langModelAvailable = $state(false);
let langModelCreateAvailable = $state(false);
let modelParams = $state('Checking...');
let capabilities = $state('Checking...');
const localTestResults = $state('No local tests run yet');
let remoteTestResults = $state('No remote tests run yet');
let testingRemote = $state(false);
let checkingPatterns = $state(false);
let patternCheckResult = $state('');

onMount(() => {
  checkEnvironment();
  checkModelAvailability();
});

function checkEnvironment() {
  // Check if LanguageModel is available
  langModelAvailable = typeof LanguageModel !== 'undefined';

  // Check if LanguageModel.create is available
  langModelCreateAvailable =
    typeof LanguageModel !== 'undefined' && typeof LanguageModel.create === 'function';
}

async function checkModelAvailability() {
  localAIStatus = 'Checking...';
  localAIAvailable = false;

  try {
    // Check actual availability status
    if (typeof LanguageModel === 'undefined') {
      localAIStatus = '❌ Not Available (LanguageModel API not found)';
      return;
    }

    const available = await LanguageModel.availability();
    if (available === 'available') {
      localAIStatus = '✅ Available';
      localAIAvailable = true;
    } else if (available === 'downloading') {
      localAIStatus = '⚠️ Available after download';
      localAIAvailable = true;
    } else {
      localAIStatus = `❌ Not Available (status: ${available})`;
    }

    // Try to get parameters
    try {
      const params = await LanguageModel.params();
      modelParams = JSON.stringify(params, null, 2);
    } catch (error) {
      modelParams = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    // Model capabilities information
    capabilities = 'Capabilities are now included in the params response';
  } catch (error) {
    localAIStatus = `❌ Error checking availability: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

function handleAIModelChange(useRemote: boolean) {
  saveAIModelSelection(useRemote);
}

async function testRemoteAI() {
  testingRemote = true;
  remoteTestResults = 'Testing Claude API...';

  chrome.runtime.sendMessage({ kind: 'testRemoteAI' }, response => {
    testingRemote = false;
    if (response?.success) {
      remoteTestResults = JSON.stringify(response.result, null, 2);
    } else {
      remoteTestResults = `Error testing Claude API: ${response?.error || 'Unknown error'}`;
    }
  });
}

function manualCheckPatterns() {
  checkingPatterns = true;
  patternCheckResult = 'Checking for patterns...';

  chrome.runtime.sendMessage({ kind: 'manualPatternCheck' }, response => {
    checkingPatterns = false;
    if (response?.success) {
      // Just show the raw LLM response
      patternCheckResult = JSON.stringify(response, null, 2);
    } else {
      patternCheckResult = `Error checking patterns: ${response?.error || 'Unknown error'}`;
    }
  });
}
</script>

<div class="debug-tab">
  <h2>AI Model Debug Panel</h2>
  
  <div class="card">
    <h3>AI Model Selection</h3>
    <label class="radio-label">
      <input 
        type="radio" 
        name="aiModel" 
        checked={!$useRemoteAI}
        onchange={() => handleAIModelChange(false)}
      >
      Use Chrome Built-in AI (requires Chrome 131+)
    </label>
    <label class="radio-label">
      <input 
        type="radio" 
        name="aiModel" 
        checked={$useRemoteAI}
        onchange={() => handleAIModelChange(true)}
      >
      Use Anthropic Claude API (requires API key)
    </label>
  </div>

  {#if $useRemoteAI}
    <div class="card">
      <h3>Claude API Settings</h3>
      <p>
        <strong>API Key Status:</strong> Using API key from environment variables (VITE_ANTHROPIC_API_KEY in .env file)
      </p>
      <p class="note">
        The API key is configured in the .env file. Make sure VITE_ANTHROPIC_API_KEY is set in your environment.
      </p>
      <button class="btn btn-primary" onclick={testRemoteAI} disabled={testingRemote}>
        {testingRemote ? 'Testing...' : 'Test Claude API'}
      </button>
      <pre class="test-results">{remoteTestResults}</pre>
    </div>
  {/if}
  
  <div class="card">
    <h3>Chrome Built-in AI Status</h3>
    <p>Current status: <span class="status" class:available={localAIAvailable}>{localAIStatus}</span></p>
    <button class="btn" onclick={checkModelAvailability}>Check Again</button>
  </div>
  
  <div class="card">
    <h3>API Detection</h3>
    <p>Is LanguageModel available? <span class="detection-status">{langModelAvailable ? '✅ Yes' : '❌ No'}</span></p>
    <p>Is LanguageModel.create available? <span class="detection-status">{langModelCreateAvailable ? '✅ Yes' : '❌ No'}</span></p>
  </div>
  
  <div class="card">
    <h3>Model Details</h3>
    <p><strong>Model parameters:</strong></p>
    <pre>{modelParams}</pre>
    <p><strong>Capabilities:</strong> {capabilities}</p>
  </div>
  
  <div class="card">
    <h3>Local AI Test Results</h3>
    <pre class="test-results">{localTestResults}</pre>
  </div>
  
  <div class="card">
    <h3>Ambient Pattern Detection Test</h3>
    <p>Ambient detection is: <strong>{$ambientDetectionEnabled ? 'Enabled' : 'Disabled'}</strong></p>
    <p class="note">
      Ambient detection normally checks every 3 minutes. Use this button to manually trigger a check for testing.
    </p>
    <button class="btn btn-primary" onclick={manualCheckPatterns} disabled={checkingPatterns}>
      {checkingPatterns ? 'Checking...' : 'Check for Patterns Now'}
    </button>
    {#if patternCheckResult}
      <pre class="test-results">{patternCheckResult}</pre>
    {/if}
  </div>
</div>

<style>
  .debug-tab {
    padding: 16px;
    overflow-y: auto;
    height: 100%;
  }
  
  h2 {
    font-size: 18px;
    margin: 0 0 16px 0;
  }
  
  h3 {
    font-size: 16px;
    margin: 0 0 12px 0;
  }
  
  .card {
    background: var(--section-bg);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid var(--border-color);
  }
  
  .radio-label {
    display: block;
    margin: 8px 0;
    cursor: pointer;
  }
  
  .radio-label input {
    margin-right: 8px;
  }
  
  .status {
    font-weight: bold;
    color: var(--danger-btn);
  }
  
  .status.available {
    color: var(--primary-btn);
  }
  
  .detection-status {
    font-weight: 500;
  }
  
  .note {
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.8;
    padding: 8px;
    background-color: var(--row-hover);
    border-left: 3px solid var(--secondary-btn);
    margin: 10px 0;
    border-radius: 4px;
  }
  
  pre {
    background: var(--row-hover);
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    font-size: 12px;
    margin: 10px 0 0 0;
  }
  
  .test-results {
    max-height: 200px;
    overflow-y: auto;
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
</style>