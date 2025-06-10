/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global variables defined in astro.config.mjs
declare const __GUILD_ID__: string;
