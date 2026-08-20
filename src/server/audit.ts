import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Writes an audit entry for a consequential change.
 *
 * Audit writes must never take down the operation they are recording, so
 * failures are logged and swallowed rather than thrown.
 */
export async function audit(entry: {
  entityType: string;
  entityId?: string | null;
  action: string;
  userId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  description?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        action: entry.action,
        userId: entry.userId ?? null,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        description: entry.description ?? null,
      },
    });
  } catch (err) {
    logger.error({ action: entry.action, entityType: entry.entityType, entityId: entry.entityId, err }, "audit write failed");
  }
}
