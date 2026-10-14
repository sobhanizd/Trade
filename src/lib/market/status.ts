import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Records provider health. Failures here never break the calling job. */
export async function recordProviderResult(provider: string, ok: boolean, latencyMs?: number, error?: string) {
  try {
    const now = new Date();
    await db().providerStatus.upsert({
      where: { provider },
      create: ok
        ? { provider, lastSuccessAt: now, consecutiveFailures: 0, lastLatencyMs: latencyMs ?? null }
        : { provider, lastErrorAt: now, lastError: error?.slice(0, 500) ?? "unknown", consecutiveFailures: 1 },
      update: ok
        ? { lastSuccessAt: now, consecutiveFailures: 0, lastLatencyMs: latencyMs ?? null }
        : { lastErrorAt: now, lastError: error?.slice(0, 500) ?? "unknown", consecutiveFailures: { increment: 1 } },
    });
  } catch (e) {
    logger.warn("could not record provider status", { provider, error: e });
  }
}

/** Wrap a provider call with timing + status recording. */
export async function tracked<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    const r = await fn();
    await recordProviderResult(provider, true, Date.now() - t);
    return r;
  } catch (e) {
    await recordProviderResult(provider, false, Date.now() - t, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
