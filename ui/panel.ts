import type { PortMessage, RawEvent } from '../src/types';

// Elements
const log = document.getElementById('log') as HTMLUListElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// Connect to background service worker
const port = chrome.runtime.connect({ name: 'log' });

// Auto-scroll behavior
let follow = true;
log.addEventListener('scroll', () => {
  follow = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
});

// Handle messages from service worker
port.onMessage.addListener((message: PortMessage) => {
  if ('init' in message && message.init) {
    message.init.forEach(add);
  }
  
  if ('delta' in message && message.delta) {
    message.delta.forEach(add);
  }
});

// Add event to the log
function add(event: RawEvent): void {
  const item = document.createElement('li');
  item.className = `row ${getEventClass(event)}`;
  
  const timestamp = document.createElement('span');
  timestamp.className = 'timestamp';
  timestamp.textContent = formatTime(event.t || Date.now());
  
  const content = document.createElement('span');
  content.textContent = format(event);
  
  item.appendChild(timestamp);
  item.appendChild(content);
  log.appendChild(item);
  
  // Auto-scroll
  if (follow) {
    log.scrollTop = log.scrollHeight;
  }
  
  // Limit DOM elements to prevent browser slowdown
  const MAX_VISIBLE_ELEMENTS = 500;
  while (log.children.length > MAX_VISIBLE_ELEMENTS) {
    log.removeChild(log.firstChild as Node);
  }
}

// Format event for display
function format(event: RawEvent): string {
  // User interaction events
  if (event.type === 'user') {
    let text = `${event.action.toUpperCase()} ${event.target}`;
    if (event.value && event.action !== 'password') {
      text += ` → "${event.value}"`;
    }
    return text;
  }
  
  // Navigation events
  if (event.type === 'nav') {
    return `→ NAV ${event.url}`;
  }
  
  // Tab events
  if (event.type === 'tab') {
    return `TAB ${event.action}`;
  }
  
  // Page lifecycle events
  if (event.type === 'page') {
    return `PAGE ${event.action} ${event.url}`;
  }
  
  // Visibility state changes
  if (event.type === 'visibility') {
    return `VIS ${event.action}`;
  }
  
  // Keyboard events
  if (event.type === 'key') {
    const modifiers = [];
    if (event.modifiers.ctrl) modifiers.push('Ctrl');
    if (event.modifiers.alt) modifiers.push('Alt');
    if (event.modifiers.shift) modifiers.push('Shift');
    if (event.modifiers.meta) modifiers.push('Meta');
    
    const keyCombo = modifiers.length 
      ? `${modifiers.join('+')}+${event.key}` 
      : event.key;
      
    return `KEY ${keyCombo}`;
  }
  
  // Mouse hover events
  if (event.type === 'hover') {
    return `HOVER ${event.target}`;
  }
  
  // URL hash changes
  if (event.type === 'hashchange') {
    return `HASH ${new URL(event.to).hash}`;
  }
  
  // XHR requests
  if (event.type === 'xhr') {
    // Get just the path part of the URL
    let urlDisplay = event.url;
    try {
      const url = new URL(event.url, event.pageUrl);
      urlDisplay = url.pathname + url.search;
    } catch (e) {
      // Use the original if parsing fails
    }
    return `XHR ${event.method} ${urlDisplay}`;
  }
  
  // Fetch API requests
  if (event.type === 'fetch') {
    // Get just the path part of the URL
    let urlDisplay = event.url;
    try {
      const url = new URL(event.url, event.pageUrl);
      urlDisplay = url.pathname + url.search;
    } catch (e) {
      // Use the original if parsing fails
    }
    return `FETCH ${event.method} ${urlDisplay}`;
  }

  // Fallback for unknown event types
  return JSON.stringify(event).slice(0, 80);
}

// Get CSS class for event styling
function getEventClass(event: RawEvent): string {
  switch (event.type) {
    case 'user':
      return event.action === 'click' ? 'click' : 'inp';
    case 'nav':
      return 'nav';
    case 'tab':
      return 'tab';
    case 'page':
      return 'page';
    case 'visibility':
      return 'vis';
    case 'key':
      return 'key';
    case 'hover':
      return 'hover';
    case 'hashchange':
      return 'hash';
    case 'xhr':
    case 'fetch':
      return 'net';
    default:
      return '';
  }
}

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Export functionality
exportBtn.addEventListener('click', () => {
  try {
    // Request export from service worker
    chrome.runtime.sendMessage({ kind: 'export' });
  } catch (error) {
    console.error('Export failed:', error);
  }
});

// Clear functionality
clearBtn.addEventListener('click', () => {
  // Clear the UI
  log.innerHTML = '';
});