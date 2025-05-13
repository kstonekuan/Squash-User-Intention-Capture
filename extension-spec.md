# **Workflow Recorder Chrome Extension — Technical Spec v0.3**

This document describes the updated architecture for the Workflow Recorder extension, focusing on comprehensive user interaction tracking using custom event listeners.

---

## 1 · Goals & Scope (v0.3)

| ✔ In Scope                                                          | ✖ Out of Scope (future)      |
| ------------------------------------------------------------------- | ---------------------------- |
| Capture **browser** and **in‑page** events (custom event listeners) | Cloud sync, ML intent engine |
| Track detailed user interactions (clicks, forms, keys, network)     | Cross‑device merge           |
| **IndexedDB** ring‑buffer + "Export JSON"                           | Screenshot / video capture   |
| **Live event stream** in a **Side Panel** (Chrome 114+)             | Canvas / WebGL diffing       |

---

## 2 · High‑Level Architecture (MV3)

```
┌──────────────────────────────┐
│ Background Service‑Worker    │  ring‑buffer · tab/nav hooks
└──────────────▲───────────────┘
               │ port("log")
┌──────────────┴───────────────┐
│ Side Panel                   │  categorized UI with color coding
└──────────────▲───────────────┘
               │ sendMessage(batch)
┌──────────────┴───────────────┐
│ Content Script               │  custom event listeners
└──────────────────────────────┘
```

---

## 3 · Data Schema (v0.3)

```ts
type RawEvent =
  // User interaction events
  | { 
      type: 'user'; 
      target: string; 
      action: string; 
      value?: string; 
      t: number; 
      url: string;
    }
  // Page navigation events
  | { 
      type: 'nav'; 
      url: string; 
      t: number;
    }
  // Tab events
  | { 
      type: 'tab'; 
      action: 'activated' | 'created' | 'removed'; 
      t: number;
    }
  // Page lifecycle events
  | {
      type: 'page';
      action: 'visit' | 'load' | 'DOMContentLoaded';
      t: number;
      url: string;
    }
  // Visibility state changes
  | {
      type: 'visibility';
      action: 'visible' | 'hidden';
      t: number;
      url: string;
    }
  // Keyboard events
  | {
      type: 'key';
      action: 'keydown';
      key: string;
      modifiers: {
        ctrl: boolean;
        alt: boolean;
        shift: boolean;
        meta: boolean;
      };
      t: number;
      url: string;
    }
  // Mouse hover events
  | {
      type: 'hover';
      target: string;
      t: number;
      url: string;
    }
  // URL hash changes
  | {
      type: 'hashchange';
      from: string;
      to: string;
      t: number;
      url: string;
    }
  // XHR requests
  | {
      type: 'xhr';
      method: string;
      url: string;
      t: number;
      pageUrl: string;
    }
  // Fetch API requests
  | {
      type: 'fetch';
      method: string;
      url: string;
      t: number;
      pageUrl: string;
    };
```

---

## 4 · Event Recording Implementation

The extension records the following types of events:

1. **Click events** - Records clicks on elements with detailed target information
2. **Form interactions** - Captures form submissions, input events, and value changes
3. **Keyboard events** - Records keypresses with modifier key information (ctrl, alt, shift, meta)
4. **Mouse events** - Tracks significant hover interactions (debounced)
5. **Navigation** - Follows page loads, DOM content loaded, and page unload events 
6. **Hash changes** - Monitors URL hash changes for single-page applications
7. **Network requests** - Intercepts XHR and Fetch API calls to track AJAX interactions
8. **Tab events** - Captures tab creation, activation, and removal
9. **Visibility** - Monitors when tabs become visible or hidden

For privacy, the extension:
1. Masks password inputs
2. Does not record actual network request/response bodies
3. Provides configurable options to control recording granularity

---

## 5 · UI Enhancements

The side panel provides a real-time view of recorded events with:

1. **Color-coded categories** - Different event types have distinct colors
2. **Chronological timeline** - Events are displayed in order with timestamps
3. **Auto-scrolling** - Follows new events but can be paused by scrolling up
4. **Event filtering** - Filter buttons to show only specific event types (TODO)
5. **Export functionality** - Export recorded data as compressed JSON

---

## 6 · Storage & Export

* Ring‑buffer lives in memory for sidebar speed
* Every 2s persist newest events to **IndexedDB** (`workflow‑db › chunks`)
* "Export" button assembles chunks → ND‑JSON → gzip (`pako`) → download

---

## 7 · Build & Tooling

```
npm i typescript vite @crxjs/vite-plugin pako eslint prettier
```

* TypeScript implementation with strict typing
* `npm run build` → `dist/` unpacked extension

---

## 8 · Installation & Use

1. Load unpacked extension from `dist/` directory
2. Click extension icon to open the side panel
3. Browse normally - all actions are recorded automatically
4. Use "Export" to save recorded data
5. Use "Clear" to reset the display

---