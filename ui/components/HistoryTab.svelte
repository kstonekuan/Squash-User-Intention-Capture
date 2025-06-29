<script lang="ts">
import { onMount } from 'svelte';
import {
  clearAllHistory,
  deleteHistoryEntry,
  historyEntries,
  loadHistory,
} from '../stores/history';
import { currentAnalysis } from '../stores/workflow';
import HistoryCard from './HistoryCard.svelte';

onMount(() => {
  loadHistory();
});

async function handleView(id: string) {
  const entry = $historyEntries.find(e => e.id === id);
  if (entry) {
    currentAnalysis.set(entry.analysis);
    // Switch to analysis tab by dispatching custom event
    window.dispatchEvent(new CustomEvent('switchTab', { detail: 'analysis' }));
  }
}

async function handleDelete(id: string) {
  if (confirm('Delete this analysis from history?')) {
    await deleteHistoryEntry(id);
  }
}

async function handleClearAll() {
  if (confirm('Clear all workflow analysis history?')) {
    await clearAllHistory();
  }
}
</script>

<div class="history-container">
  <div class="history-header">
    <h2>Workflow Analysis History</h2>
    <button 
      class="btn btn-danger" 
      onclick={handleClearAll}
      disabled={$historyEntries.length === 0}
    >
      Clear All
    </button>
  </div>
  
  <div class="history-list">
    {#if $historyEntries.length === 0}
      <div class="history-placeholder">
        <p>No workflow analyses in history yet.</p>
        <p>Complete a workflow analysis to see it appear here.</p>
      </div>
    {:else}
      {#each $historyEntries as entry (entry.id)}
        <HistoryCard 
          {entry}
          onView={handleView}
          onDelete={handleDelete}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .history-container {
    padding: 12px;
    height: 100%;
    overflow-y: auto;
  }

  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }

  .history-header h2 {
    font-size: 16px;
    margin: 0;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .history-placeholder {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-color);
    opacity: 0.6;
  }

  .history-placeholder p {
    margin: 8px 0;
    font-size: 14px;
  }
</style>