# **Workflow Recorder Chrome Extension — Technical Spec v0.5**

This document describes the updated architecture for the Workflow Recorder extension, focusing on comprehensive user interaction tracking, workflow marking, and AI-powered intent analysis.

---

## 1 · Goals & Scope (v0.5)

| ✔ In Scope                                                          | ✖ Out of Scope (future)      |
| ------------------------------------------------------------------- | ---------------------------- |
| Capture **browser** and **in‑page** events (custom event listeners) | Cloud sync                   |
| Track detailed user interactions (clicks, forms, keys, network)     | Cross‑device merge           |
| **Workflow marking** with Start/Stop buttons                        | Screenshot / video capture   |
| **Chrome AI Prompt API** for workflow intent analysis               | Canvas / WebGL diffing       |
| **IndexedDB** ring‑buffer + "Export JSON"                           | Multi-workflow management    |
| **Live event stream** in a **Side Panel** (Chrome 114+)             |                              |

---

## 2 · High‑Level Architecture (MV3)

```
┌──────────────────────────────┐
│ Background Service‑Worker    │  ring‑buffer · tab/nav hooks · mark storage
└──────────────▲───────────────┘
               │ port("log")
┌──────────────┴───────────────┐
│ Side Panel                   │  categorized UI with color coding · marks · AI analysis
└──────────────▲───────────────┘
               │ sendMessage(batch)
┌──────────────┴───────────────┐
│ Content Script               │  custom event listeners
└──────────────────────────────┘
```

---

## 3 · Data Schema (v0.5)

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
    }
  // Workflow marking events (new in v0.5)
  | {
      type: 'mark';
      action: 'start' | 'stop';
      t: number;
    };

// AI Analysis response (new in v0.5)
interface WorkflowAnalysis {
  summary: string;        // Overall workflow purpose
  steps: {                // Step-by-step breakdown
    action: string;       // What the user did
    intent: string;       // Why they did it
  }[];
  suggestions?: string[]; // Optional improvement suggestions
}
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
10. **Workflow marks** - Captures user-defined start and stop points in the workflow stream

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
4. **Event filtering** - Filter buttons to show only specific event types
5. **Export functionality** - Export recorded data as compressed JSON
6. **Start/Stop buttons** - Mark the beginning and end of a workflow sequence
7. **AI Analysis panel** - Display intent analysis of the marked workflow
8. **Edit prompt** - Customize the AI prompt for different analysis perspectives

**New mark UI:**
- Start/Stop markers are highlighted in the event stream
- Only one active workflow can be marked at a time
- AI analysis is automatically triggered on workflow stop

---

## 6 · Storage & Export

* Ring‑buffer lives in memory for sidebar speed
* Every 2s persist newest events to **IndexedDB** (`workflow‑db › chunks`)
* Workflow markers are persisted with special mark type events
* "Export" button assembles chunks → ND‑JSON → gzip (`pako`) → download

---

## 7 · AI Integration

The extension uses the Chrome AI Prompt API to analyze the marked workflow sequence:

1. **Model Access** - Uses Chrome's on-device AI model (Gemini Nano)
2. **Prompt Construction** - Automatically formats workflow events into a structured prompt
3. **Intent Analysis** - Analyzes the sequence of user actions to infer overall goals and step intentions
4. **Developer Mode** - Allows customization of the prompt for different analysis perspectives

Implementation details:
* Uses `chrome.aiOriginTrial.languageModel` APIs for prompt processing
* Requires Chrome 131+ with AI Origin Trial permissions
* Process runs locally on-device, no data is sent to the cloud
* Only analyzes the events between Start and Stop markers
* Provides a UI for viewing and customizing the analysis

Examples of generated insights:
* User intention for each significant action
* Overall workflow pattern identification
* Potential efficiency suggestions

---

## 8 · Build & Tooling

```
npm i typescript vite @crxjs/vite-plugin pako eslint prettier
```

* TypeScript implementation with strict typing
* `npm run build` → `dist/` unpacked extension
* Manifest updated to include AI Origin Trial permissions

**Manifest Changes:**
```json
{
  "permissions": [
    "tabs", "webNavigation", "sidePanel", 
    "storage", "downloads", "aiLanguageModelOriginTrial"
  ]
}
```

---

## 9 · Installation & Use

1. Load unpacked extension from `dist/` directory
2. Click extension icon to open the side panel
3. Browse normally - all actions are recorded automatically
4. Click **Start Mark** to begin workflow recording
5. Perform the workflow actions to be analyzed
6. Click **Stop Mark** to end workflow recording and trigger AI analysis
7. View the analysis in the side panel
8. Use **Export** to save recorded data
9. Use **Clear** to reset the display

---