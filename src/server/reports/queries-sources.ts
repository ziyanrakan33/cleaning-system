import { prisma } from "@/lib/prisma";
import type { ReportResult } from "./queries-execution";

const CONFLICT_STATUS_LABEL: Record<string, string> = { OPEN: "פתוחה", RESOLVED: "הוכרעה", ACCEPTED_BOTH: "שני הערכים תקפים" };
const VERIFICATION_STATUS_LABEL: Record<string, string> = {
  EXTRACTED: "חולץ", REQUIRES_REVIEW: "דורש בדיקה", VERIFIED: "אומת", REJECTED: "נדחה", CONFLICTED: "בסתירה",
};

// ---------------------------------------------------------------------------
// 14. Source conflicts — exportable version of the /sources conflicts tab
// ---------------------------------------------------------------------------
export async function sourceConflictsReport(): Promise<ReportResult> {
  const conflicts = await prisma.sourceConflict.findMany({ orderBy: [{ status: "asc" }, { createdAt: "asc" }] });

  const rows = conflicts.map((c) => ({
    topic: c.topic,
    status: CONFLICT_STATUS_LABEL[c.status] ?? c.status,
    valueA: c.valueA,
    sourceA: c.sourceA,
    valueB: c.valueB,
    sourceB: c.sourceB,
    valueC: c.valueC ?? "—",
    sourceC: c.sourceC ?? "—",
    resolvedValue: c.resolvedValue ?? "—",
  }));

  return {
    columns: [
      { header: "נושא", key: "topic", width: 28 },
      { header: "סטטוס", key: "status", width: 14 },
      { header: "ערך א'", key: "valueA", width: 16 },
      { header: "מקור א'", key: "sourceA", width: 30 },
      { header: "ערך ב'", key: "valueB", width: 16 },
      { header: "מקור ב'", key: "sourceB", width: 30 },
      { header: "ערך ג'", key: "valueC", width: 16 },
      { header: "מקור ג'", key: "sourceC", width: 30 },
      { header: "ערך שהוכרע", key: "resolvedValue", width: 16 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 15. Data pending verification — exportable version of the /sources evidence tab
// ---------------------------------------------------------------------------
export async function pendingVerificationReport(): Promise<ReportResult> {
  const evidence = await prisma.sourceEvidence.findMany({
    where: { verificationStatus: { in: ["EXTRACTED", "REQUIRES_REVIEW"] } },
    orderBy: [{ verificationStatus: "asc" }, { createdAt: "asc" }],
  });

  const rows = evidence.map((e) => ({
    entityType: e.entityType,
    fieldName: e.fieldName ?? "—",
    extractedValue: e.extractedValue ?? "(לא נטען)",
    sourceFile: e.sourceFile,
    sourceSection: e.sourceSection ?? e.sourceImageRegion ?? "—",
    confidence: e.confidence,
    status: VERIFICATION_STATUS_LABEL[e.verificationStatus] ?? e.verificationStatus,
  }));

  return {
    columns: [
      { header: "סוג רשומה", key: "entityType", width: 20 },
      { header: "שדה", key: "fieldName", width: 18 },
      { header: "ערך שחולץ", key: "extractedValue", width: 22 },
      { header: "קובץ מקור", key: "sourceFile", width: 30 },
      { header: "סעיף / אזור בתמונה", key: "sourceSection", width: 30 },
      { header: "ביטחון", key: "confidence", width: 10 },
      { header: "סטטוס", key: "status", width: 14 },
    ],
    rows,
  };
}
