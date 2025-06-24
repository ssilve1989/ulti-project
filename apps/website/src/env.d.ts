/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TOKEN?: string;
  readonly VITE_DEFAULT_GUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global variables defined in astro.config.mjs
declare const __GUILD_ID__: string;
