/// <reference types="vite/client" />
/// <reference types="@types/dom-chromium-ai" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY: string;
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
