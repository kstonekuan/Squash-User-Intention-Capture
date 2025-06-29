import { writable } from 'svelte/store';
import type { RawEvent } from '../../src/types';

// Store for the event log
export const eventLog = writable<RawEvent[]>([]);

// Add events to the log
export function addEvents(events: RawEvent[]) {
  eventLog.update(log => [...log, ...events]);
}

// Clear the event log
export function clearEventLog() {
  eventLog.set([]);
}

// Initialize the event log with initial data
export function initEventLog(events: RawEvent[]) {
  eventLog.set(events);
}
