<script lang="ts">
import type { RawEvent } from '../../src/types';

interface Props {
  event: RawEvent;
}

const { event }: Props = $props();

const formattedTime = $derived(formatTime(event.t));
const eventClass = $derived(getEventClass());
const eventContent = $derived(formatEventContent());

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTarget(target: string): string {
  return target.length > 40 ? `${target.substring(0, 37)}...` : target;
}

function formatUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = urlObj.pathname + urlObj.search;
    return path === '/'
      ? domain
      : `${domain}${path.length > 30 ? `${path.substring(0, 27)}...` : path}`;
  } catch {
    return url.length > 40 ? `${url.substring(0, 37)}...` : url;
  }
}

function truncateValue(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.substring(0, maxLength - 3)}...` : value;
}

function getEventClass(): string {
  switch (event.type) {
    case 'user':
      return event.action === 'click' ? 'click' : 'inp';
    case 'nav':
      return 'nav';
    case 'tab':
      return 'tab';
    case 'page':
      return 'page';
    case 'key':
      return 'key';
    case 'hover':
      return 'hover';
    case 'hashchange':
      return 'hash';
    case 'xhr':
    case 'fetch':
      return 'net';
    case 'mark':
      return 'mark workflow-mark';
    case 'visibility':
      return 'vis';
    default:
      return 'dom';
  }
}

function getActionIcon(action: string): string {
  switch (action) {
    case 'click':
      return '👆';
    case 'input-debounced':
    case 'input-at-submit':
    case 'input-enter':
      return '⌨️';
    case 'select-option':
      return '📋';
    case 'submit':
      return '📤';
    case 'scroll':
      return '📜';
    case 'select':
      return '🔤';
    default:
      return '⚡';
  }
}

function formatAction(action: string): string {
  switch (action) {
    case 'input-debounced':
      return 'Type';
    case 'input-at-submit':
      return 'Input';
    case 'input-enter':
      return 'Enter';
    case 'select-option':
      return 'Select';
    default:
      return action.charAt(0).toUpperCase() + action.slice(1);
  }
}

function formatEventContent(): string {
  switch (event.type) {
    case 'user': {
      const icon = getActionIcon(event.action);
      const action = formatAction(event.action);
      const target = formatTarget(event.target);
      const value = event.value ? ` = "${truncateValue(event.value, 50)}"` : '';
      return `${icon} ${action} on ${target}${value}`;
    }

    case 'nav':
      return `🌐 Navigate to ${formatUrl(event.url)}`;

    case 'tab': {
      const tabIcon =
        event.action === 'activated' ? '📑' : event.action === 'created' ? '➕' : '➖';
      const title = event.title ? `: ${truncateValue(event.title, 40)}` : '';
      return `${tabIcon} Tab ${event.action}${title}`;
    }

    case 'page': {
      const pageIcon = event.action === 'visit' ? '🌍' : event.action === 'load' ? '⚡' : '📄';
      return `${pageIcon} Page ${event.action} at ${formatUrl(event.url)}`;
    }

    case 'key': {
      const modifiers = [];
      if (event.modifiers.ctrl) modifiers.push('Ctrl');
      if (event.modifiers.alt) modifiers.push('Alt');
      if (event.modifiers.shift) modifiers.push('Shift');
      if (event.modifiers.meta) modifiers.push('Meta');
      const keyCombo = modifiers.length ? `${modifiers.join('+')}+${event.key}` : event.key;
      return `⌨️ Press ${keyCombo}`;
    }

    case 'hover':
      return `🎯 Hover on ${formatTarget(event.target)}`;

    case 'hashchange':
      return `#️⃣ Hash ${event.from} → ${event.to}`;

    case 'xhr':
    case 'fetch':
      return `🔄 ${event.type.toUpperCase()} ${event.method} ${formatUrl(event.url)}`;

    case 'visibility': {
      const visIcon = event.action === 'visible' ? '👁️' : '🙈';
      return `${visIcon} Page ${event.action}`;
    }

    case 'mark':
      return event.action === 'start' ? '🚩 === WORKFLOW START ===' : '🏁 === WORKFLOW STOP ===';

    default:
      return JSON.stringify(event).slice(0, 80);
  }
}
</script>

<li class="row {eventClass}">
  <span class="timestamp">{formattedTime}</span>
  {eventContent}
</li>

<style>
  .row {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 14px;
  }

  .row:hover {
    background-color: var(--row-hover);
  }

  .row.workflow-mark {
    background-color: rgba(var(--mark-color-rgb, 231, 76, 60), 0.1);
    border-left: 3px solid var(--mark-color);
    font-weight: bold;
  }

  .timestamp {
    color: #888;
    margin-right: 8px;
    font-size: 12px;
  }

  /* Event type colors */
  .nav { color: var(--nav-color); }
  .dom { color: var(--dom-color); }
  .inp { color: var(--inp-color); }
  .click { color: var(--click-color); }
  .key { color: var(--key-color); }
  .hover { color: var(--hover-color); }
  .page { color: var(--page-color); }
  .vis { color: var(--vis-color); }
  .hash { color: var(--hash-color); }
  .net { color: var(--net-color); }
  .tab { color: var(--tab-color); font-style: italic; }
  .mark { color: var(--mark-color); font-weight: bold; }
</style>