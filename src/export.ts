import * as pako from 'pako';
import { getAllChunks } from './db';
import type { RawEvent } from './types';

export async function exportData(): Promise<void> {
  try {
    // Get all chunks from IndexedDB
    const chunks = await getAllChunks();

    // Flatten chunks into a single array of events
    const allEvents = chunks.reduce<RawEvent[]>((acc, chunk) => {
      return acc.concat(chunk.events);
    }, []);

    // Sort events by timestamp (if they have one)
    const sortedEvents = allEvents.sort((a, b) => (a.t || 0) - (b.t || 0));

    // Convert events to ND-JSON format (newline-delimited JSON)
    const ndJson = sortedEvents.map(event => JSON.stringify(event)).join('\n');

    // Compress with gzip
    const compressed = pako.gzip(ndJson);

    // Convert to blob
    const blob = new Blob([compressed], { type: 'application/gzip' });

    // Generate filename with current date/time
    const date = new Date();
    const filename = `workflow-recording-${date.toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json.gz`;

    // Create object URL for download
    const url = URL.createObjectURL(blob);

    // Trigger download
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true,
    });

    // Clean up object URL after short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return Promise.resolve();
  } catch (error) {
    console.error('Error exporting data:', error);
    return Promise.reject(error);
  }
}
