// Extension message types
export type Message =
  | { kind: 'evtBatch'; evts: RawEvent[] }
  | { kind: 'nav'; url: string }
  | { kind: 'openOverlay'; tabId: number }
  | { kind: 'export' }
  | { kind: 'mark'; action: 'start' | 'stop' }
  | { kind: 'analyzeWorkflow' }
  | { kind: 'setRemoteAI'; enabled: boolean }
  | { kind: 'testRemoteAI' };

// Port message types
export type PortMessage =
  | { init: RawEvent[] }
  | { delta: RawEvent[] }
  | { analysis: WorkflowAnalysis };

// Raw event types
export type RawEvent =
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
export interface WorkflowAnalysis {
  summary: string; // Overall workflow purpose
  steps: {
    // Step-by-step breakdown
    action: string; // What the user did
    intent: string; // Why they did it
  }[];
  suggestions?: string[]; // Optional improvement suggestions
  debug?: {
    // Debug information (new)
    prompt?: string; // The prompt sent to the model
    error?: string; // Error message, if any
    rawResponse?: string; // Raw response from the model
    modelStatus?: string; // Model status
  };
}

// DB types
export interface DBChunk {
  id?: number;
  timestamp: number;
  events: RawEvent[];
}

// Workflow marks
export interface WorkflowMarkers {
  startIndex: number;
  startTime: number;
  endIndex?: number;
  endTime?: number;
}
