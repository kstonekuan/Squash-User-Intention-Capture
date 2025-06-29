<script lang="ts">
import type { WorkflowHistoryEntry } from '../../src/types';

interface Props {
  entry: WorkflowHistoryEntry;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

const { entry, onView, onDelete }: Props = $props();

function formatHistoryDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}

function handleView() {
  onView(entry.id);
}

function handleDelete() {
  onDelete(entry.id);
}
</script>

<div class="history-item" data-id={entry.id}>
  <div class="history-item-header">
    <h3 class="history-item-title">{entry.title}</h3>
    <span class="history-item-date">{formatHistoryDate(entry.timestamp)}</span>
  </div>
  <p class="history-item-summary">{entry.analysis.summary}</p>
  <div class="history-item-actions">
    <button class="btn btn-secondary history-action-btn" onclick={handleView}>
      View
    </button>
    <button class="btn btn-danger history-action-btn" onclick={handleDelete}>
      Delete
    </button>
  </div>
</div>

<style>
  .history-item {
    background-color: var(--section-bg);
    border-radius: 8px;
    padding: 12px;
    border: 1px solid var(--border-color);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .history-item:hover {
    background-color: var(--row-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .history-item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .history-item-title {
    font-weight: 500;
    font-size: 14px;
    color: var(--text-color);
    margin: 0;
    flex: 1;
    margin-right: 8px;
  }

  .history-item-date {
    font-size: 12px;
    color: var(--text-color);
    opacity: 0.6;
    white-space: nowrap;
  }

  .history-item-summary {
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.8;
    line-height: 1.4;
    margin: 0;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .history-item-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .history-item:hover .history-item-actions {
    opacity: 1;
  }

  .history-action-btn {
    padding: 3px 8px;
    font-size: 11px;
    border-radius: 3px;
  }
</style>