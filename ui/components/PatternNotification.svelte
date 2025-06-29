<script lang="ts">
import type { DetectedPattern } from '../../src/pattern-detector';

interface Props {
  pattern: DetectedPattern | null;
  onAnalyze: () => void;
  onDismiss: () => void;
}

const { pattern, onAnalyze, onDismiss }: Props = $props();
</script>

{#if pattern}
  <div class="pattern-notification" style="display: block;">
    <div class="notification-content">
      <div class="notification-icon">🔄</div>
      <div class="notification-text">
        <h4>Repetitive Pattern Detected!</h4>
        <p>{pattern.description || `You performed similar actions ${pattern.occurrences} times`}</p>
      </div>
    </div>
    <div class="notification-actions">
      <button class="btn btn-primary btn-sm" onclick={onAnalyze}>Analyze</button>
      <button class="btn btn-sm" onclick={onDismiss}>Dismiss</button>
    </div>
  </div>
{/if}

<style>
  .pattern-notification {
    margin: 8px;
    padding: 12px;
    background-color: rgba(255, 152, 0, 0.1);
    border: 1px solid rgba(255, 152, 0, 0.3);
    border-radius: 8px;
    animation: slideIn 0.3s ease-out;
  }

  .notification-content {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .notification-icon {
    font-size: 24px;
  }

  .notification-text h4 {
    margin: 0 0 4px 0;
    font-size: 14px;
    color: #ff9800;
  }

  .notification-text p {
    margin: 0;
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.8;
  }

  .notification-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-sm {
    padding: 4px 12px;
    font-size: 12px;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>