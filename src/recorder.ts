import type { Message, RawEvent } from './types';

// Configuration
const BATCH_MS = 500;
const BATCH_MAX = 25;
let batch: RawEvent[] = [];

// Utility to get a good element descriptor for logging
function getElementDescription(el: HTMLElement): string {
  // Get element tag name (with null check)
  let desc = el.tagName ? el.tagName.toLowerCase() : 'unknown';

  // Add id if present
  if (el.id) {
    desc += `#${el.id}`;
  }

  // Add classes if any
  if (el.className && typeof el.className === 'string') {
    try {
      const classes = el.className
        .split(' ')
        .filter(c => c)
        .map(c => `.${c}`)
        .join('');
      if (classes) {
        desc += classes;
      }
    } catch (error) {
      console.error('Error processing className:', error);
    }
  }

  // Add text content hint for buttons, links, etc.
  try {
    if (
      el.tagName &&
      ['A', 'BUTTON', 'LABEL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName) &&
      el.textContent &&
      el.textContent.trim()
    ) {
      const text = el.textContent.trim().substring(0, 20);
      desc += ` "${text}${text.length > 20 ? '...' : ''}"`;
    }
  } catch (error) {
    console.error('Error processing textContent:', error);
  }

  return desc;
}

// Flush batched events to background service worker
function flush() {
  if (!batch.length) return;
  chrome.runtime.sendMessage({
    kind: 'evtBatch',
    evts: batch,
  } as Message);
  batch = [];
}

// Record an interaction event
function recordEvent(type: string, event: Event) {
  try {
    if (!event.target) return;

    // Ensure target is an HTMLElement before proceeding
    if (!(event.target instanceof HTMLElement)) {
      console.warn('Event target is not an HTMLElement', event.target);
      return;
    }

    const target = event.target as HTMLElement;
    let value: string | undefined;
    let action = type;

    // Extract additional info based on event type
    if (type === 'change' || type === 'input-submit' || type === 'input-debounced') {
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (target.type === 'password') {
          // Mask password values
          value = '••••••••';
        } else {
          value = target.value;
        }

        // For input-submit, we want to indicate it was captured at submission
        if (type === 'input-submit') {
          action = 'input-at-submit';
        }
      }
    } else if (type === 'submit') {
      // For form submissions
      action = 'submit';
    }

    const userEvent: RawEvent = {
      type: 'user',
      target: getElementDescription(target),
      action,
      t: Date.now(),
      url: window.location.href,
      ...(value !== undefined && { value }),
    };

    batch.push(userEvent);

    if (batch.length >= BATCH_MAX) {
      flush();
    }
  } catch (error) {
    console.error('Error recording event:', error);
  }
}

// Set up click event listeners
document.addEventListener(
  'click',
  e => {
    try {
      // Ensure target is an HTMLElement before proceeding
      if (!(e.target instanceof HTMLElement)) {
        console.warn('Click target is not an HTMLElement', e.target);
        return;
      }

      const target = e.target as HTMLElement;
      // Don't record clicks on the body or document
      if (!target.tagName || target.tagName === 'BODY' || target.tagName === 'HTML') {
        return;
      }

      // Check if this is an anchor link with a hash
      if (target.tagName === 'A' && target instanceof HTMLAnchorElement) {
        const url = target.href;
        if (url?.includes('#') && !window.location.href.endsWith(url.substring(url.indexOf('#')))) {
          // This is a hash link that's not already in the current URL
          batch.push({
            type: 'hashchange',
            from: window.location.href,
            to: url,
            t: Date.now(),
            url: window.location.href,
          });

          if (batch.length >= BATCH_MAX) {
            flush();
          }
        }
      }

      recordEvent('click', e);
    } catch (error) {
      console.error('Error processing click event:', error);
    }
  },
  true,
);

// Form interactions
document.addEventListener(
  'submit',
  e => {
    try {
      if (!(e.target instanceof HTMLFormElement)) {
        console.warn('Submit target is not a form', e.target);
        return;
      }

      const form = e.target as HTMLFormElement;
      const formElements = Array.from(form.elements);

      // Record the form submission
      recordEvent('submit', e);

      // Record the values of form inputs at submission time
      for (const element of formElements) {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          // Skip buttons and hidden fields
          if (
            element instanceof HTMLInputElement &&
            (element.type === 'button' || element.type === 'submit' || element.type === 'hidden')
          ) {
            continue;
          }

          // Create a synthetic event with the target as the input element
          const syntheticEvent = new Event('change');
          Object.defineProperty(syntheticEvent, 'target', { value: element });

          // Record the input value at form submission time
          recordEvent('input-submit', syntheticEvent);
        }
      }
    } catch (error) {
      console.error('Error recording form submission:', error);
    }
  },
  true,
);

// Record input events with debounce
let inputTimeout: number | null = null;
const INPUT_DEBOUNCE_MS = 1000; // 1 second debounce

document.addEventListener(
  'input',
  e => {
    if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      return;
    }

    // Skip password fields
    if (e.target instanceof HTMLInputElement && e.target.type === 'password') {
      return;
    }

    // Debounce input events
    if (inputTimeout) {
      window.clearTimeout(inputTimeout);
    }

    inputTimeout = window.setTimeout(() => {
      recordEvent('input-debounced', e);
      inputTimeout = null;
    }, INPUT_DEBOUNCE_MS);
  },
  true,
);

// Record change events (for dropdowns, etc.)
document.addEventListener(
  'change',
  e => {
    // Special handling for select elements to capture the selected option value and text
    if (e.target instanceof HTMLSelectElement) {
      const select = e.target;
      const selectedOption = select.options[select.selectedIndex];
      const value = select.value;
      const text = selectedOption ? selectedOption.text : '';

      // Create a custom event with additional data
      const syntheticEvent = new Event('change');
      Object.defineProperty(syntheticEvent, 'target', { value: select });

      // Store both the value and display text
      const userEvent: RawEvent = {
        type: 'user',
        target: getElementDescription(select),
        action: 'select-option',
        value: `${value} (${text})`, // Include both value and text
        t: Date.now(),
        url: window.location.href,
      };

      batch.push(userEvent);

      if (batch.length >= BATCH_MAX) {
        flush();
      }
    } else {
      // Regular change event for other elements
      recordEvent('change', e);
    }
  },
  true,
);

// Scroll events (debounced)
let scrollTimeout: number | null = null;
document.addEventListener(
  'scroll',
  e => {
    if (scrollTimeout) {
      window.clearTimeout(scrollTimeout);
    }

    scrollTimeout = window.setTimeout(() => {
      recordEvent('scroll', e);
      scrollTimeout = null;
    }, 100); // Debounce to avoid too many events
  },
  true,
);

// Navigation events
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({
    kind: 'nav',
    url: location.href,
  } as Message);
});

// Page visibility changes
document.addEventListener('visibilitychange', () => {
  batch.push({
    type: 'visibility',
    action: document.visibilityState,
    t: Date.now(),
    url: window.location.href,
  });

  if (batch.length >= BATCH_MAX) {
    flush();
  }
});

// Keypress events (only record which keys were pressed, not the specific characters)
document.addEventListener(
  'keydown',
  e => {
    // Handle Enter key press on input fields specially
    if (
      e.key === 'Enter' &&
      (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
    ) {
      // Don't capture Enter on multiline textareas unless Ctrl/Cmd is pressed (form submission)
      if (
        e.target instanceof HTMLTextAreaElement &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.target.value.includes('\n')
      ) {
        return;
      }

      // If it's a single line input or textarea with Ctrl+Enter, capture the value
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      const value = target.type === 'password' ? '••••••••' : target.value;

      batch.push({
        type: 'user',
        target: getElementDescription(target),
        action: 'input-enter',
        value,
        t: Date.now(),
        url: window.location.href,
      });

      if (batch.length >= BATCH_MAX) {
        flush();
      }
      return;
    }

    // Skip if the target is an input field - we'll capture those via input events
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    // Record special keys and combinations
    if (
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.shiftKey ||
      e.key === 'Enter' ||
      e.key === 'Escape' ||
      e.key === 'Tab' ||
      e.key.startsWith('Arrow') ||
      e.key.startsWith('Page')
    ) {
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
        url: window.location.href,
      });

      if (batch.length >= BATCH_MAX) {
        flush();
      }
    }
  },
  true,
);

// Text selection/highlighting capture
let selectionTimeout: number | null = null;
document.addEventListener(
  'selectionchange',
  () => {
    // Debounce to avoid capturing too many events during selection
    if (selectionTimeout) {
      window.clearTimeout(selectionTimeout);
    }

    selectionTimeout = window.setTimeout(() => {
      try {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          return; // Skip if no selection or empty selection
        }

        const selectedText = selection.toString().trim();
        // Limit length to avoid extremely long selections
        const trimmedText =
          selectedText.length > 500 ? `${selectedText.substring(0, 500)}...` : selectedText;

        // Get parent element of selection for context
        let targetElement: HTMLElement | null = null;
        if (selection.anchorNode) {
          targetElement = selection.anchorNode.parentElement;
        }

        batch.push({
          type: 'user',
          target: targetElement ? getElementDescription(targetElement) : 'text',
          action: 'select',
          value: trimmedText,
          t: Date.now(),
          url: window.location.href,
        });

        if (batch.length >= BATCH_MAX) {
          flush();
        }
      } catch (error) {
        console.error('Error processing text selection:', error);
      }

      selectionTimeout = null;
    }, 500); // Wait for selection to complete before capturing
  },
  true,
);

// Record URL hash changes
window.addEventListener('hashchange', e => {
  batch.push({
    type: 'hashchange',
    from: e.oldURL,
    to: e.newURL,
    t: Date.now(),
    url: window.location.href,
  });

  if (batch.length >= BATCH_MAX) {
    flush();
  }
});

// Extended XMLHttpRequest interface for tracking
interface ExtendedXMLHttpRequest extends XMLHttpRequest {
  _workflowMethod?: string;
  _workflowUrl?: string | URL;
}

// Observe AJAX Requests using XHR
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null,
) {
  // Store method and URL for later use in send
  (this as ExtendedXMLHttpRequest)._workflowMethod = method;
  (this as ExtendedXMLHttpRequest)._workflowUrl = url;
  // Simply call the original with all the arguments
  return originalXHROpen.call(this, method, url, async ?? true, username, password);
};

XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
  // Log the XHR request
  const extendedThis = this as ExtendedXMLHttpRequest;
  batch.push({
    type: 'xhr',
    method: extendedThis._workflowMethod ?? 'GET',
    url: extendedThis._workflowUrl ? extendedThis._workflowUrl.toString() : '',
    // Don't log the actual request body for privacy reasons
    t: Date.now(),
    pageUrl: window.location.href,
  });

  if (batch.length >= BATCH_MAX) {
    flush();
  }

  return originalXHRSend.call(this, body);
};

// Observe fetch requests
const originalFetch = window.fetch;
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
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
    pageUrl: window.location.href,
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
  url: window.location.href,
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
