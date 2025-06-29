<script lang="ts">
import { clearEventLog, eventLog } from '../stores/events';
import EventLogItem from './EventLogItem.svelte';

let logContainer: HTMLUListElement;
let follow = $state(true);

// Auto-scroll behavior
function handleScroll() {
  if (logContainer) {
    follow = logContainer.scrollTop + logContainer.clientHeight >= logContainer.scrollHeight - 4;
  }
}

// Scroll to bottom when new events arrive
$effect(() => {
  if (follow && $eventLog.length && logContainer) {
    requestAnimationFrame(() => {
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    });
  }
});

function handleClear() {
  if (confirm('Clear all events?')) {
    clearEventLog();
  }
}

function handleExport() {
  chrome.runtime.sendMessage({ kind: 'export' });
}
</script>

<div class="events-tab">
  <div class="events-header">
    <div class="events-info">
      <span class="event-count">{$eventLog.length} events</span>
      {#if !follow}
        <span class="scroll-paused">⏸️ Scroll paused</span>
      {/if}
    </div>
    <div class="events-actions">
      <button class="btn" onclick={handleExport}>Export</button>
      <button class="btn" onclick={handleClear}>Clear</button>
    </div>
  </div>
  
  <ul 
    id="log" 
    bind:this={logContainer}
    onscroll={handleScroll}
  >
    {#each $eventLog as event (event.t + Math.random())}
      <EventLogItem {event} />
    {/each}
  </ul>
</div>

<style>
  .events-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .events-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--section-bg);
  }

  .events-info {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.8;
  }

  .event-count {
    font-weight: 500;
  }

  .scroll-paused {
    color: #ff9800;
    font-size: 12px;
  }

  .events-actions {
    display: flex;
    gap: 8px;
  }

  #log {
    flex-grow: 1;
    overflow-y: auto;
    padding: 0;
    margin: 0;
    list-style: none;
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

  .btn:hover {
    background-color: var(--row-hover);
  }
</style>