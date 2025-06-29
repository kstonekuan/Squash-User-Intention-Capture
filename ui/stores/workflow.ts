import { derived, writable } from 'svelte/store';
import type { DetectedPattern } from '../../src/pattern-detector';
import type { WorkflowAnalysis } from '../../src/types';

// Workflow mode states
export type WorkflowMode = 'idle' | 'manual_recording' | 'ambient_active';

// Store for current workflow mode
export const workflowMode = writable<WorkflowMode>('ambient_active');

// Store for current analysis
export const currentAnalysis = writable<WorkflowAnalysis | null>(null);

// Store for detected ambient pattern
export const detectedPattern = writable<DetectedPattern | null>(null);

// Store for analysis loading state
export const analysisLoading = writable(false);

// Store for roasting mode
export const roastingMode = writable(false);

// Derived store for UI state based on mode
export const uiState = derived(workflowMode, $mode => {
  switch ($mode) {
    case 'ambient_active':
      return {
        startButtonDisabled: false,
        stopButtonDisabled: true,
        modeText: 'Ambient Detection Active',
        modeClass: 'ambient',
        showPulseDot: true,
      };
    case 'manual_recording':
      return {
        startButtonDisabled: true,
        stopButtonDisabled: false,
        modeText: 'Recording Workflow...',
        modeClass: 'recording',
        showPulseDot: true,
      };
    case 'idle':
      return {
        startButtonDisabled: true,
        stopButtonDisabled: true,
        modeText: 'Processing...',
        modeClass: 'idle',
        showPulseDot: false,
      };
  }
});
