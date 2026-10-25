/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Função de importação (a prévia de teste usa uma cópia, sem mexer na oficial). */
  readonly VITE_IMPORT_FUNCTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
