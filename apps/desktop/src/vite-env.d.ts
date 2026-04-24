/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTROL_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_WS_USER_ID?: string;
  readonly VITE_SESSION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
