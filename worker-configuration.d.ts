interface Env {
  APP_ENV: string;
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_BASE_URL: string;
  CACHE_TTL_SECONDS: string;
  DB: D1Database;
  TRANSLATION_CACHE: KVNamespace;
}
