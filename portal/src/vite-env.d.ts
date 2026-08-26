/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** JSON opcional: [{ unitId, unitName, publicApiUrl }] */
  readonly VITE_CENTRALS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
