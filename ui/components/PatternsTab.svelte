<script lang="ts">
import { onMount } from 'svelte';
import type { DetectedPattern } from '../../src/pattern-detector';

interface PatternHistory {
  pattern: DetectedPattern;
  detectedAt: number;
  status: 'pending_review' | 'analyzed' | 'dismissed';
}

let patternHistory = $state<PatternHistory[]>([]);
let currentPattern = $state<PatternHistory | null>(null);

onMount(() => {
  loadPatternHistory();

  // Listen for new pattern detections
  chrome.storage.onChanged.addListener(changes => {
    if (changes.ambientPattern) {
      loadPatternHistory();
    }
    if (changes.patternHistory) {
      loadPatternHistory();
    }
  });
});

async function loadPatternHistory() {
  const result = await chrome.storage.local.get(['ambientPattern', 'patternHistory']);

  // Load historical patterns
  const history = result.patternHistory || [];

  // Add current pattern if exists
  if (result.ambientPattern) {
    currentPattern = result.ambientPattern;
  }

  // Combine and sort by detection time
  patternHistory = history.sort(
    (a: PatternHistory, b: PatternHistory) => b.detectedAt - a.detectedAt,
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return date.toLocaleDateString();
}

function handleAnalyzePattern(_pattern: DetectedPattern) {
  // Send to analysis
  chrome.runtime.sendMessage({ kind: 'analyzeAmbientPattern' });
  // Switch to analysis tab
  window.dispatchEvent(new CustomEvent('switchTab', { detail: 'analysis' }));
}

function handleDismissPattern(patternEntry: PatternHistory) {
  // Update status in storage
  updatePatternStatus(patternEntry, 'dismissed');
}

async function updatePatternStatus(patternEntry: PatternHistory, status: 'analyzed' | 'dismissed') {
  const history = await chrome.storage.local.get('patternHistory');
  const patterns = history.patternHistory || [];

  // Update the pattern status
  const updated = patterns.map((p: PatternHistory) =>
    p.detectedAt === patternEntry.detectedAt ? { ...p, status } : p,
  );

  await chrome.storage.local.set({ patternHistory: updated });
  loadPatternHistory();
}

async function clearAllPatterns() {
  if (confirm('Clear all pattern history?')) {
    await chrome.storage.local.remove(['patternHistory', 'ambientPattern']);
    patternHistory = [];
    currentPattern = null;
  }
}
</script>

<div class="patterns-tab">
  <div class="patterns-header">
    <h2>Detected Patterns</h2>
    <button class="btn btn-secondary" onclick={clearAllPatterns} disabled={patternHistory.length === 0 && !currentPattern}>
      Clear History
    </button>
  </div>

  {#if currentPattern}
    <div class="current-pattern-section">
      <h3>Current Pattern</h3>
      <div class="pattern-card current">
        <div class="pattern-header">
          <span class="pattern-time">{formatTime(currentPattern.detectedAt)}</span>
          <span class="pattern-badge pending">Pending Review</span>
        </div>
        <div class="pattern-description">
          {currentPattern.pattern.description || 'Repetitive pattern detected'}
        </div>
        <div class="pattern-stats">
          <span>Confidence: {(currentPattern.pattern.confidence * 100).toFixed(0)}%</span>
          <span>Occurrences: {currentPattern.pattern.occurrences}</span>
        </div>
        <div class="pattern-actions">
          <button class="btn btn-primary" onclick={() => currentPattern && handleAnalyzePattern(currentPattern.pattern)}>
            Analyze
          </button>
          <button class="btn btn-secondary" onclick={() => currentPattern && handleDismissPattern(currentPattern)}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="pattern-history-section">
    <h3>Pattern History</h3>
    {#if patternHistory.length === 0}
      <div class="empty-state">
        <p>No patterns in history yet. Patterns are detected automatically as you browse.</p>
      </div>
    {:else}
      <div class="pattern-list">
        {#each patternHistory as pattern}
          <div class="pattern-card">
            <div class="pattern-header">
              <span class="pattern-time">{formatTime(pattern.detectedAt)}</span>
              <span class="pattern-badge {pattern.status}">{pattern.status.replace('_', ' ')}</span>
            </div>
            <div class="pattern-description">
              {pattern.pattern.description || 'Repetitive pattern'}
            </div>
            <div class="pattern-stats">
              <span>Confidence: {(pattern.pattern.confidence * 100).toFixed(0)}%</span>
              <span>Occurrences: {pattern.pattern.occurrences}</span>
            </div>
            {#if pattern.status === 'pending_review'}
              <div class="pattern-actions">
                <button class="btn btn-primary btn-sm" onclick={() => handleAnalyzePattern(pattern.pattern)}>
                  Analyze
                </button>
                <button class="btn btn-secondary btn-sm" onclick={() => handleDismissPattern(pattern)}>
                  Dismiss
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .patterns-tab {
    padding: 16px;
    overflow-y: auto;
    height: 100%;
  }

  .patterns-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .patterns-header h2 {
    margin: 0;
    font-size: 18px;
  }

  h3 {
    font-size: 16px;
    margin: 16px 0 12px 0;
  }

  .current-pattern-section {
    margin-bottom: 24px;
  }

  .pattern-card {
    background: var(--section-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .pattern-card.current {
    border-color: var(--primary-btn);
    box-shadow: 0 0 0 1px var(--primary-btn);
  }

  .pattern-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .pattern-time {
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.7;
  }

  .pattern-badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
  }

  .pattern-badge.pending {
    background: #ff9800;
    color: white;
  }

  .pattern-badge.analyzed {
    background: #4caf50;
    color: white;
  }

  .pattern-badge.dismissed {
    background: #9e9e9e;
    color: white;
  }

  .pattern-description {
    font-size: 14px;
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .pattern-stats {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.8;
    margin-bottom: 8px;
  }

  .pattern-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .empty-state {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-color);
    opacity: 0.7;
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

  .btn-secondary {
    background-color: var(--secondary-btn);
    color: white;
    border-color: var(--secondary-btn);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--secondary-btn-hover);
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }
</style>