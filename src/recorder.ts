import type { Message } from './types';

// Configuration
const BATCH_MS = 500;
const BATCH_MAX = 25;
let batch: any[] = [];

// Event types we want to capture
type UserEvent = {
  type: string;
  target: string;
  action: string;
  value?: string;
  t: number;
  url: string;
};

// Utility to get a good element descriptor for logging
function getElementDescription(el: HTMLElement): string {
  // Get element tag name
  let desc = el.tagName.toLowerCase();
  
  // Add id if present
  if (el.id) {
    desc += `#${el.id}`;
  }

  // Add classes if any
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(' ')
      .filter(c => c)
      .map(c => `.${c}`)
      .join('');
    if (classes) {
      desc += classes;
    }
  }

  // Add text content hint for buttons, links, etc.
  if (
    ['A', 'BUTTON', 'LABEL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']
      .includes(el.tagName) && 
    el.textContent && 
    el.textContent.trim()
  ) {
    const text = el.textContent.trim().substring(0, 20);
    desc += ` "${text}${text.length > 20 ? '...' : ''}"`;
  }

  return desc;
}

// Flush batched events to background service worker
function flush() {
  if (!batch.length) return;
  chrome.runtime.sendMessage({
    kind: 'evtBatch',
    evts: batch
  } as Message);
  batch = [];
}

// Record an interaction event
function recordEvent(type: string, event: Event) {
  if (!event.target) return;
  
  const target = event.target as HTMLElement;
  let value: string | undefined;
  let action = type;
  
  // Extract additional info based on event type
  if (type === 'input' || type === 'change') {
    if (target instanceof HTMLInputElement || 
        target instanceof HTMLSelectElement || 
        target instanceof HTMLTextAreaElement) {
      if (target.type === 'password') {
        // Mask password values
        value = '••••••••';
      } else {
        value = target.value;
      }
    }
  } else if (type === 'submit') {
    // For form submissions
    action = 'submit';
  }
  
  const userEvent: UserEvent = {
    type: 'user',
    target: getElementDescription(target),
    action,
    t: Date.now(),
    url: window.location.href
  };
  
  if (value !== undefined) {
    userEvent.value = value;
  }
  
  batch.push(userEvent);
  
  if (batch.length >= BATCH_MAX) {
    flush();
  }
}

// Set up click event listeners
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  // Don't record clicks on the body or document
  if (target.tagName === 'BODY' || target.tagName === 'HTML') {
    return;
  }
  recordEvent('click', e);
}, true);

// Form interactions
document.addEventListener('submit', (e) => {
  recordEvent('submit', e);
}, true);

document.addEventListener('input', (e) => {
  recordEvent('input', e);
}, true);

document.addEventListener('change', (e) => {
  recordEvent('change', e);
}, true);

// Scroll events (debounced)
let scrollTimeout: number | null = null;
document.addEventListener('scroll', (e) => {
  if (scrollTimeout) {
    window.clearTimeout(scrollTimeout);
  }
  
  scrollTimeout = window.setTimeout(() => {
    recordEvent('scroll', e);
    scrollTimeout = null;
  }, 100);  // Debounce to avoid too many events
}, true);

// Navigation events
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({
    kind: 'nav',
    url: location.href
  } as Message);
});

// Page visibility changes
document.addEventListener('visibilitychange', () => {
  batch.push({
    type: 'visibility',
    action: document.visibilityState,
    t: Date.now(),
    url: window.location.href
  });
  
  if (batch.length >= BATCH_MAX) {
    flush();
  }
});

// Keypress events (only record which keys were pressed, not the specific characters)
document.addEventListener('keydown', (e) => {
  // Skip if the target is an input field - we'll capture those via input events
  if (e.target instanceof HTMLInputElement || 
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement) {
    return;
  }

  // Record special keys and combinations
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || 
      e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab' ||
      e.key.startsWith('Arrow') || e.key.startsWith('Page')) {
      
    batch.push({
      type: 'key',
      action: 'keydown',
      key: e.key,
      modifiers: {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      },
      t: Date.now(),
      url: window.location.href
    });
    
    if (batch.length >= BATCH_MAX) {
      flush();
    }
  }
}, true);

// Mouse events for hover state tracking (debounced)
let mouseTimeout: number | null = null;
document.addEventListener('mouseover', (e) => {
  if (mouseTimeout) {
    window.clearTimeout(mouseTimeout);
  }
  
  mouseTimeout = window.setTimeout(() => {
    const target = e.target as HTMLElement;
    // Skip body and document elements
    if (target.tagName === 'BODY' || target.tagName === 'HTML') {
      return;
    }
    
    batch.push({
      type: 'hover',
      target: getElementDescription(target),
      t: Date.now(),
      url: window.location.href
    });
    
    if (batch.length >= BATCH_MAX) {
      flush();
    }
    
    mouseTimeout = null;
  }, 300);  // Debounce to only capture significant hovers
}, true);

// Record URL hash changes
window.addEventListener('hashchange', (e) => {
  batch.push({
    type: 'hashchange',
    from: e.oldURL,
    to: e.newURL,
    t: Date.now(),
    url: window.location.href
  });
  
  if (batch.length >= BATCH_MAX) {
    flush();
  }
});

// Record page load events
window.addEventListener('load', () => {
  batch.push({
    type: 'page',
    action: 'load',
    t: Date.now(),
    url: window.location.href
  });
  
  if (batch.length >= BATCH_MAX) {
    flush();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  batch.push({
    type: 'page',
    action: 'DOMContentLoaded',
    t: Date.now(),
    url: window.location.href
  });
  
  if (batch.length >= BATCH_MAX) {
    flush();
  }
});

// Observe AJAX Requests using XHR
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(
  method: string, 
  url: string | URL, 
  _async?: boolean, 
  _username?: string | null, 
  _password?: string | null
) {
  // Store method and URL for later use in send
  (this as any)._workflowMethod = method;
  (this as any)._workflowUrl = url;
  // Simply call the original with all the arguments
  return originalXHROpen.apply(this, arguments as any);
};

XMLHttpRequest.prototype.send = function(body) {
  // Log the XHR request
  batch.push({
    type: 'xhr',
    method: (this as any)._workflowMethod,
    url: (this as any)._workflowUrl,
    // Don't log the actual request body for privacy reasons
    t: Date.now(),
    pageUrl: window.location.href
  });
  
  if (batch.length >= BATCH_MAX) {
    flush();
  }
  
  return originalXHRSend.apply(this, [body] as any);
};

// Observe fetch requests
const originalFetch = window.fetch;
window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
  let resource: string;
  
  if (typeof input === 'string') {
    resource = input;
  } else if (input instanceof URL) {
    resource = input.toString();
  } else {
    // It's a Request object
    resource = input.url;
  }
  
  const method = init?.method || 'GET';
  
  batch.push({
    type: 'fetch',
    method,
    url: resource,
    t: Date.now(),
    pageUrl: window.location.href
  });
  
  if (batch.length >= BATCH_MAX) {
    flush();
  }
  
  return originalFetch.call(window, input, init);
};

// Set interval to flush batched events
setInterval(flush, BATCH_MS);

// Record initial page view
batch.push({
  type: 'page',
  action: 'visit',
  t: Date.now(),
  url: window.location.href
});

// Handle errors to prevent extension crashes
chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  try {
    // Handle any messages that might be sent to the content script
    sendResponse();
  } catch (error) {
    console.error('Error in content script:', error);
    sendResponse();
  }
  return true; // Keep the message channel open for async responses
});