import { execSync } from "node:child_process";
import pg from "pg";
import { E2E_ENV } from "../playwright.config";

export const E2E_USER = { email: "e2e@cryptopilot.test", password: "e2e-password-123456" };

export default async function globalSetup() {
  if (!/e2e/.test(new URL(E2E_ENV.DATABASE_URL).pathname)) throw new Error("E2E database name must contain 'e2e' (safety guard).");
  const env = { ...process.env, ...E2E_ENV, NODE_ENV: "development", CP_PASSWORD: E2E_USER.password } as NodeJS.ProcessEnv;
  const run = (cmd: string) => execSync(cmd, { env, stdio: "pipe", timeout: 300_000 });
  run("npx prisma migrate deploy");
  // Empty the dedicated E2E database (never the dev/prod one — see guard above).
  const client = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'");
  if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await client.end();
  run(`npx tsx scripts/create-user.ts --email ${E2E_USER.email}`);
  // Real market data: snapshot + scan + news (requires internet).
  run("npx tsx worker/index.ts --once");
}
