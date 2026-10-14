import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter });
}

/** Lazily-created singleton (survives Next.js dev hot reloads). */
export function db(): PrismaClient {
  if (!globalForPrisma.__prisma) globalForPrisma.__prisma = create();
  return globalForPrisma.__prisma;
}

export async function disconnectDb() {
  if (globalForPrisma.__prisma) {
    await globalForPrisma.__prisma.$disconnect();
    globalForPrisma.__prisma = undefined;
  }
}

/** Cheap connectivity probe for health checks. */
export async function pingDb(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t = Date.now();
  try {
    await db().$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - t };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split("\n")[0] : "unknown" };
  }
}
