import type { Message, PortMessage, RawEvent } from './types';
import { saveChunk } from './db';
import { exportData } from './export';

const MAX_EVENTS = 10_000;
let ring: RawEvent[] = [];          // ring-buffer in memory
let ports = new Set<chrome.runtime.Port>();   // live side-panel connections

// Persist to IndexedDB periodically
const PERSIST_INTERVAL_MS = 2000;
let lastPersistedIndex = 0;

// Tab management
chrome.tabs.onActivated.addListener(() => {
  const event: RawEvent = { 
    type: 'tab',
    action: 'activated', 
    t: Date.now() 
  };
  push([event]);
});

chrome.tabs.onCreated.addListener(() => {
  const event: RawEvent = {
    type: 'tab',
    action: 'created',
    t: Date.now()
  };
  push([event]);
});

chrome.tabs.onRemoved.addListener(() => {
  const event: RawEvent = {
    type: 'tab',
    action: 'removed',
    t: Date.now()
  };
  push([event]);
});

// Receive batched events from content script
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.kind === 'evtBatch' && msg.evts) push(msg.evts);
  if (msg.kind === 'nav' && msg.url) {
    push([{ type: 'nav', url: msg.url, t: Date.now() }]);
  }
  if (msg.kind === 'export') {
    handleExport();
  }
  sendResponse();
  return true; // Keep the message channel open for async responses
});

// Push events to ring buffer and broadcast to connected sidepanels
function push(events: RawEvent[]): void {
  ring.push(...events);
  if (ring.length > MAX_EVENTS) ring = ring.slice(-MAX_EVENTS);
  
  // Broadcast to all connected ports
  ports.forEach(port => {
    try {
      port.postMessage({ delta: events } as PortMessage);
    } catch (error) {
      console.error('Error posting message to port:', error);
      ports.delete(port);
    }
  });
}

// Stream to side-panel
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'log') return;
  ports.add(port);
  
  // Send initial state
  port.postMessage({ init: ring } as PortMessage);
  
  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
});

// Toolbar click opens panel
chrome.action.onClicked.addListener(tab => {
  if (tab.windowId && chrome.sidePanel) {
    try {
      // First ensure the side panel is enabled and configured
      chrome.sidePanel.setOptions({
        path: 'ui/sidepanel.html',
        enabled: true
      });
      
      // Use cast to any to bypass TypeScript error with the open method
      // which exists in the actual Chrome API but might be missing in type definitions
      (chrome.sidePanel as any).open({ windowId: tab.windowId });
    } catch (error) {
      console.error('Error with side panel API:', error);
    }
  }
});

// Periodically persist events to IndexedDB
async function persistEvents() {
  try {
    if (lastPersistedIndex < ring.length) {
      const newEvents = ring.slice(lastPersistedIndex);
      if (newEvents.length > 0) {
        await saveChunk(newEvents);
        lastPersistedIndex = ring.length;
      }
    }
  } catch (error) {
    console.error('Error persisting events:', error);
  }
}

// Handle export request
async function handleExport() {
  try {
    await exportData();
  } catch (error) {
    console.error('Error exporting data:', error);
  }
}

// Start persistence interval
setInterval(persistEvents, PERSIST_INTERVAL_MS);