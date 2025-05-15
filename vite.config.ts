import { resolve } from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  console.log(
    `Building extension in ${mode} mode, trial token available: ${!!env.VITE_TRIAL_TOKEN}`,
  );

  return {
    plugins: [
      crx({
        manifest: {
          manifest_version: 3,
          name: 'Workflow Recorder',
          version: '0.5.0',
          action: { default_title: 'Start / stop recorder' },
          permissions: [
            'tabs',
            'webNavigation',
            'sidePanel',
            'storage',
            'downloads',
            'aiLanguageModelOriginTrial',
          ],
          trial_tokens: [env.VITE_TRIAL_TOKEN || ''],
          minimum_chrome_version: '131',
          host_permissions: ['<all_urls>'],
          background: {
            service_worker: 'src/sw.ts',
            type: 'module',
          },
          content_scripts: [
            {
              matches: ['<all_urls>'],
              js: ['src/recorder.ts'],
              run_at: 'document_start',
            },
          ],
          side_panel: {
            default_path: 'ui/sidepanel.html',
          },
          content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'self'",
            sandbox:
              "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self'",
          },
        },
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  };
});
