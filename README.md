# Workflow Recorder Chrome Extension

A Chrome extension that records browser activities and in-page events to help analyze user workflows.

## Features

- Records DOM events using rrweb
- Tracks browser navigation and tab events
- Displays a live event stream in a Chrome Side Panel
- Stores events in IndexedDB for persistence
- Exports recorded data as compressed JSON

## Development

### Prerequisites

- Node.js 16+
- npm or pnpm

### Setup

```bash
# Install dependencies
npm install
# or
pnpm install

### Building for Production

```bash
npm run build
# or
pnpm build
```

This will create a `dist` directory with the unpacked extension.

### Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory

## Usage

1. Click the extension icon in the toolbar to open the Side Panel
2. Browse websites as usual, and your activities will be recorded
3. Use the "Export" button in the Side Panel to download your recorded data

## Privacy

- Text with the CSS class `workflow-mask` will be masked in the recording
- All data is stored locally on your device; nothing is sent to any server

## License

MIT