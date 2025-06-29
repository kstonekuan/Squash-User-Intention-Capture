import { writable } from 'svelte/store';
import { roastingMode } from './workflow';

// Store for AI model selection
export const useRemoteAI = writable(false);

// Store for ambient detection settings
export const ambientDetectionEnabled = writable(true);

export interface AmbientSettings {
  sensitivity: 'low' | 'medium' | 'high';
  checkInterval: number;
}

export const ambientSettings = writable<AmbientSettings>({
  sensitivity: 'medium',
  checkInterval: 180000, // 3 minutes
});

// Load settings from Chrome storage
export async function loadSettings() {
  chrome.storage.local.get(
    ['use_remote_ai', 'roasting_mode', 'ambient_detection_enabled', 'ambient_detection_settings'],
    result => {
      if (result.use_remote_ai !== undefined) {
        useRemoteAI.set(result.use_remote_ai);
      }

      if (result.roasting_mode !== undefined) {
        roastingMode.set(result.roasting_mode);
      }

      if (result.ambient_detection_enabled !== undefined) {
        ambientDetectionEnabled.set(result.ambient_detection_enabled);
      }

      if (result.ambient_detection_settings) {
        ambientSettings.set(result.ambient_detection_settings);
      }
    },
  );
}

// Save AI model selection
export function saveAIModelSelection(useRemote: boolean) {
  chrome.storage.local.set({ use_remote_ai: useRemote });
  chrome.runtime.sendMessage({ kind: 'setRemoteAI', enabled: useRemote });
}

// Save roasting mode
export function saveRoastingMode(enabled: boolean) {
  chrome.storage.local.set({ roasting_mode: enabled });
}

// Save ambient detection settings
export function saveAmbientDetectionEnabled(enabled: boolean) {
  chrome.storage.local.set({ ambient_detection_enabled: enabled });
  chrome.runtime.sendMessage({ kind: 'toggleAmbientDetection', enabled });
}

export function saveAmbientSettings(settings: AmbientSettings) {
  chrome.storage.local.set({ ambient_detection_settings: settings });
}
