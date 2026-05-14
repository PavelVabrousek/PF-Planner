import { Pool } from "pg";

type GlobalWithPool = typeof globalThis & {
  pfpPgPool?: Pool;
};

function getDatabaseUrl() {
  return process.env.PFP_SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

export function createPostgresPool() {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    return null;
  }

  const globalWithPool = globalThis as GlobalWithPool;

  if (!globalWithPool.pfpPgPool) {
    globalWithPool.pfpPgPool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 3,
    });
  }

  return globalWithPool.pfpPgPool;
}
