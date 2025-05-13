import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    crx({
      manifest: {
        manifest_version: 3,
        name: "Workflow Recorder",
        version: "0.5.0",
        action: { default_title: "Start / stop recorder" },
        permissions: [
          "tabs", "webNavigation", "sidePanel",
          "storage", "downloads", "aiLanguageModelOriginTrial"
        ],
        trial_tokens: [
          "Alnh5NtJggd3VseHmshny+4of2NiIFZ+sfU3bdb0V2qXTa/VxU/Ds8OLOhenJmr+srNa2wEoq0yDzQwe2UH8bwgAAAB4eyJvcmlnaW4iOiJjaHJvbWUtZXh0ZW5zaW9uOi8vbWVnaW1oaGpsaW5rbWNrbmNsaGFvY2NubmRqam9qZ2siLCJmZWF0dXJlIjoiQUlQcm9tcHRBUElGb3JFeHRlbnNpb24iLCJleHBpcnkiOjE3NjA0ODYzOTl9"
        ],
        "minimum_chrome_version": "131",
        host_permissions: ["<all_urls>"],
        background: { 
          service_worker: "src/sw.ts", 
          type: "module" 
        },
        content_scripts: [{
          matches: ["<all_urls>"],
          js: ["src/recorder.ts"],
          run_at: "document_start"
        }],
        side_panel: {
          default_path: "ui/sidepanel.html"
        },
        content_security_policy: {
          extension_pages: "script-src 'self'; object-src 'self'",
          sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self'"
        }
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});