import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function audit(type: string, userId: string | null, detail?: Record<string, unknown>, ipHash?: string | null) {
  try {
    await db().auditEvent.create({ data: { type, userId, detail: (detail ?? undefined) as object | undefined, ipHash: ipHash ?? null } });
  } catch (e) {
    logger.warn("audit write failed", { type, error: e });
  }
}
