/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** JSON opcional: [{ unitId, unitName, publicApiUrl }] */
  readonly VITE_CENTRALS?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
