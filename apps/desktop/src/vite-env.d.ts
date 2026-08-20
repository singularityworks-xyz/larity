/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_CONTROL_URL: string;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_SESSION_ID?: string;
  readonly VITE_WS_URL: string;
  readonly VITE_WS_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
