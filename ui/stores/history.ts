import { writable } from 'svelte/store';
import {
  clearAllHistory as clearDb,
  deleteHistoryEntry as deleteFromDb,
  getAllHistoryEntries,
  saveHistoryEntry as saveToDb,
} from '../../src/db';
import type { WorkflowAnalysis, WorkflowHistoryEntry } from '../../src/types';

// Store for history entries
export const historyEntries = writable<WorkflowHistoryEntry[]>([]);

// Load history from IndexedDB
export async function loadHistory() {
  try {
    const entries = await getAllHistoryEntries();
    historyEntries.set(entries);
  } catch (error) {
    console.error('Failed to load history:', error);
    historyEntries.set([]);
  }
}

// Save analysis to history
export async function saveAnalysisToHistory(analysis: WorkflowAnalysis) {
  try {
    const historyEntry: WorkflowHistoryEntry = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      analysis,
      title: generateHistoryTitle(analysis.summary),
    };

    await saveToDb(historyEntry);

    // Reload history to reflect changes
    await loadHistory();
  } catch (error) {
    console.error('Failed to save analysis to history:', error);
  }
}

// Delete history entry
export async function deleteHistoryEntry(id: string) {
  try {
    await deleteFromDb(id);
    // Reload history to reflect changes
    await loadHistory();
  } catch (error) {
    console.error('Failed to delete history entry:', error);
  }
}

// Clear all history
export async function clearAllHistory() {
  try {
    await clearDb();
    historyEntries.set([]);
  } catch (error) {
    console.error('Failed to clear history:', error);
  }
}

function generateHistoryTitle(summary: string): string {
  // Generate a concise title from the summary
  const words = summary.split(' ').filter(word => word.length > 3);
  if (words.length <= 5) {
    return summary;
  }

  // Take first few meaningful words
  return `${words.slice(0, 5).join(' ')}...`;
}
