/**
 * Create (or reset the password of) the owner account.
 *   npm run user:create -- --email you@example.com      (or --username alex)
 * The password is read from the CP_PASSWORD env var or prompted (hidden).
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { bootstrap } from "@/lib/bootstrap";
import { db, disconnectDb } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { DEFAULT_ASSETS } from "@/lib/market/assets";
import { defaultSettings } from "@/lib/settings/schema";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function promptHidden(q: string): Promise<string> {
  let muted = false;
  const out = new Writable({ write: (chunk, enc, cb) => { if (!muted) process.stdout.write(chunk, enc as BufferEncoding); cb(); } });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
    muted = true;
  });
}

async function main() {
  const email = (arg("username") ?? arg("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/^[a-z0-9._-]{3,64}$/.test(email))
    throw new Error("Usage: npm run user:create -- --username yourname   (or --email you@example.com)");
  const password = process.env.CP_PASSWORD ?? (await promptHidden("Password (min 12 chars): "));
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);
  await bootstrap();
  const passwordHash = await hashPassword(password);
  const existing = await db().user.findUnique({ where: { email } });
  if (existing) {
    await db().user.update({ where: { id: existing.id }, data: { passwordHash } });
    await db().session.deleteMany({ where: { userId: existing.id } });
    console.log(`Password updated for ${email}; all sessions revoked.`);
    return;
  }
  const user = await db().user.create({ data: { email, passwordHash, settings: { create: { data: defaultSettings() } } } });
  const assets = await db().asset.findMany({ where: { symbol: { in: DEFAULT_ASSETS.map((a) => a.symbol) } } });
  await db().watchlistItem.createMany({ data: assets.map((a, i) => ({ userId: user.id, assetId: a.id, position: i })) });
  console.log(`Created user ${email} with the default watchlist (${assets.map((a) => a.symbol).join(", ")}).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
