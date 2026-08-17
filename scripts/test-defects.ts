/**
 * Exercises the defect/complaint/inspection module: the state machine's role
 * gating, the deduction approve/waive flow (§825), the seven-day appeal window
 * and its final decision (§826), and the requirement that a fix cannot be
 * accepted without an "after" photo.
 *
 * Creates throwaway users, a defect type, a zone and defects/complaints, runs
 * the real service functions against them, and removes everything in the
 * finally block.
 *
 *   npx tsx --env-file=.env scripts/test-defects.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  allowedTransitions,
  changeStatus,
  createComplaint,
  createDefect,
  decideAppeal,
  decideDeduction,
  DefectError,
  effectiveDeduction,
  lodgeAppeal,
} from "@/server/defects/service";
import { can } from "@/lib/permissions";
import { getDefectDetail } from "@/server/defects/getDefectDetail";
import { MUNICIPALITY_FIX_SURCHARGE_PERCENT, verifyDefectCatalog } from "@/server/tender/defectCatalog";

const TAG = "__TEST_DEFECTS__";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectError(fn: () => Promise<unknown>, name: string, matches?: RegExp) {
  try {
    await fn();
    check(name, false, "לא נזרקה שגיאה");
  } catch (e) {
    if (!(e instanceof DefectError)) {
      check(name, false, `שגיאה לא צפויה: ${String(e)}`);
      return;
    }
    check(name, matches ? matches.test(e.message) : true, e.message);
  }
}

async function makeUser(role: string, suffix: string) {
  const email = `${TAG.toLowerCase()}_${suffix}@test.local`;
  const passwordHash = await bcrypt.hash("x", 4);
  return prisma.user.upsert({
    where: { email },
    update: { role: role as never, active: true },
    create: { name: `${TAG} ${role}`, email, passwordHash, role: role as never, active: true },
  });
}

async function cleanup() {
  const defects = await prisma.defect.findMany({
    where: { title: { startsWith: TAG } },
    select: { id: true },
  });
  const ids = defects.map((d) => d.id);
  if (ids.length > 0) {
    await prisma.defectPhoto.deleteMany({ where: { defectId: { in: ids } } });
    await prisma.defectEvent.deleteMany({ where: { defectId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Defect", entityId: { in: ids } } });
    await prisma.defect.deleteMany({ where: { id: { in: ids } } });
  }

  const complaints = await prisma.complaint.findMany({
    where: { subject: { startsWith: TAG } },
    select: { id: true },
  });
  if (complaints.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Complaint", entityId: { in: complaints.map((c) => c.id) } },
    });
    await prisma.complaint.deleteMany({ where: { id: { in: complaints.map((c) => c.id) } } });
  }

  await prisma.defectType.deleteMany({ where: { code: { startsWith: TAG } } });

  const zones = await prisma.operationalZone.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  if (zones.length > 0) {
    await prisma.operationalZone.deleteMany({ where: { id: { in: zones.map((z) => z.id) } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
}

async function main() {
  console.log("בדיקת קטלוג הליקויים");
  const catalogProblems = verifyDefectCatalog();
  check("קטלוג הליקויים עקבי", catalogProblems.length === 0, catalogProblems.join("; "));

  console.log("\nהכנת נתוני בדיקה");
  await cleanup();

  const inspector = await makeUser("INSPECTOR", "inspector");
  const contractorMgr = await makeUser("CONTRACTOR_MANAGER", "contractor");
  const siteSupervisor = await makeUser("SITE_SUPERVISOR", "supervisor");
  const deptManager = await makeUser("DEPT_MANAGER", "dept");
  const finance = await makeUser("FINANCE", "finance");
  const viewer = await makeUser("VIEWER", "viewer");

  const zone = await prisma.operationalZone.create({
    data: { code: `${TAG}Z1`, name: `${TAG} אזור`, color: "#000000", active: true },
  });

  const defectType = await prisma.defectType.create({
    data: {
      code: `${TAG}LK1`,
      name: `${TAG} סוג ליקוי`,
      deductionAmount: 500,
      unitBasis: "לכל מקרה בודד",
      category: "בדיקה",
      defaultFixHours: 24,
      sortOrder: 999,
    },
  });

  console.log("\nבדיקות הרשאות סטטוס (state machine)");
  check(
    "מפקח יכול להעביר לטיפול (ASSIGNED)",
    allowedTransitions("NEW", "INSPECTOR").some((t) => t.to === "ASSIGNED")
  );
  check(
    "עובד רגיל אינו רואה שום מעבר אפשרי מ-NEW",
    allowedTransitions("NEW", "EMPLOYEE").length === 0
  );
  check(
    "קבלן אינו יכול לאשר תיקון (AWAITING_PROOF → FIXED)",
    !allowedTransitions("AWAITING_PROOF", "CONTRACTOR_MANAGER").some((t) => t.to === "FIXED")
  );
  check(
    "מפקח כן יכול לאשר תיקון (AWAITING_PROOF → FIXED)",
    allowedTransitions("AWAITING_PROOF", "INSPECTOR").some((t) => t.to === "FIXED")
  );
  check(
    "קבלן יכול לדווח על תיקון (IN_PROGRESS → AWAITING_PROOF)",
    allowedTransitions("IN_PROGRESS", "CONTRACTOR_MANAGER").some((t) => t.to === "AWAITING_PROOF")
  );
  check(
    "אין מעברים אפשריים מליקוי סגור (CLOSED)",
    allowedTransitions("CLOSED", "ADMIN").length === 0
  );
  check(
    "רק מנהל אגף יכול להכריע בערעור, לא מפקח",
    !allowedTransitions("APPEALED", "INSPECTOR").some((t) => t.to === "CLOSED") &&
      allowedTransitions("APPEALED", "DEPT_MANAGER").some((t) => t.to === "CLOSED")
  );

  console.log("\nבדיקות יצירת ליקוי");
  const defect = await createDefect({
    defectTypeId: defectType.id,
    zoneId: zone.id,
    title: `${TAG} בור במדרכה`,
    severity: "HIGH",
    origin: "INSPECTION",
    reportedById: inspector.id,
  });
  check("הליקוי נוצר עם מספר אסמכתא", /^LK-\d{4}-\d{4}$/.test(defect.reference), defect.reference);
  check("סטטוס התחלתי הוא NEW", defect.status === "NEW");
  check(
    "מועד היעד חושב מהקטלוג (24 שעות)",
    defect.dueAt !== null &&
      Math.abs(defect.dueAt.getTime() - Date.now() - 24 * 60 * 60 * 1000) < 60_000
  );
  check("קיזוז הוצע אוטומטית מסוג הליקוי", defect.deductionStatus === "PROPOSED");
  check(
    "סכום הקיזוז המוצע תואם לקטלוג",
    Number(defect.deductionAmount) === 500
  );

  const event0 = await prisma.defectEvent.findFirst({ where: { defectId: defect.id, action: "CREATED" } });
  check("אירוע פתיחה נרשם בהיסטוריה", !!event0);

  console.log("\nבדיקות מעבר סטטוס אכיפה בפועל");
  await expectError(
    () =>
      changeStatus({
        defectId: defect.id,
        to: "FIXED",
        userId: contractorMgr.id,
        role: "CONTRACTOR_MANAGER",
      }),
    "קבלן אינו יכול לדלג ישירות ל-FIXED",
    /לא ניתן להעביר|אין לך הרשאה/
  );

  await changeStatus({ defectId: defect.id, to: "ASSIGNED", userId: inspector.id, role: "INSPECTOR", assignedToId: contractorMgr.id });
  await changeStatus({ defectId: defect.id, to: "IN_PROGRESS", userId: contractorMgr.id, role: "CONTRACTOR_MANAGER" });
  const inProgress = await changeStatus({
    defectId: defect.id,
    to: "AWAITING_PROOF",
    userId: contractorMgr.id,
    role: "CONTRACTOR_MANAGER",
  });
  check("הליקוי עבר ל-AWAITING_PROOF", inProgress.status === "AWAITING_PROOF");

  console.log("\nבדיקת חסימת אישור תיקון ללא תמונת 'אחרי'");
  await expectError(
    () => changeStatus({ defectId: defect.id, to: "FIXED", userId: inspector.id, role: "INSPECTOR" }),
    "לא ניתן לאשר תיקון בלי תמונת אחרי",
    /תמונת/
  );

  await prisma.defectPhoto.create({
    data: {
      defectId: defect.id,
      kind: "AFTER",
      mimeType: "image/png",
      sizeBytes: 10,
      data: Buffer.from([1, 2, 3]),
      uploadedById: contractorMgr.id,
    },
  });

  const fixed = await changeStatus({
    defectId: defect.id,
    to: "FIXED",
    userId: inspector.id,
    role: "INSPECTOR",
    note: `${TAG} התיקון אושר`,
  });
  check("לאחר הוספת תמונת אחרי, האישור מצליח", fixed.status === "FIXED");
  check("fixedAt נרשם", fixed.fixedAt !== null);

  console.log("\nבדיקות קיזוז (§825) והרשאות כספים");
  check("מנהל אגף אינו רשאי לאשר קיזוז", !can("DEPT_MANAGER", "finance.approveDeduction"));
  check("מנהל מערכת רשאי לאשר קיזוז", can("ADMIN", "finance.approveDeduction"));

  const withSurcharge = await decideDeduction({
    defectId: defect.id,
    decision: "APPROVED",
    applySurcharge: true,
    userId: deptManager.id,
  });
  check("הקיזוז אושר", withSurcharge.deductionStatus === "APPROVED");
  check(
    `תוספת §822 של ${MUNICIPALITY_FIX_SURCHARGE_PERCENT}% נרשמה`,
    withSurcharge.deductionSurchargePercent === MUNICIPALITY_FIX_SURCHARGE_PERCENT
  );
  check(
    "חישוב הקיזוז האפקטיבי כולל את התוספת",
    effectiveDeduction(withSurcharge) === 500 * 1.15
  );
  check(
    "חלון הערעור נפתח ל-7 ימים",
    withSurcharge.appealDueAt !== null &&
      Math.abs(withSurcharge.appealDueAt.getTime() - Date.now() - 7 * 24 * 60 * 60 * 1000) < 60_000
  );

  console.log("\nבדיקת דליפת סכום קיזוז דרך היסטוריית האירועים");
  // Regression test for a real bug the browser smoke test caught: the
  // DEDUCTION_APPROVED event note is generated with the shekel amount baked
  // into the text ("קיזוז 500 ₪ ..."), so it must be withheld the same way
  // deduction.amount is — otherwise a contractor without finance.view sees
  // the figure anyway, just inside the history timeline instead of the
  // deduction panel.
  const detailForContractor = await getDefectDetail(defect.id, "CONTRACTOR_MANAGER");
  const contractorApprovalEvent = detailForContractor?.events.find(
    (e) => e.action === "DEDUCTION_APPROVED"
  );
  check("נציג קבלן רואה את אירוע אישור הקיזוז", !!contractorApprovalEvent);
  check(
    "אך הערת האירוע אינה כוללת סכום בשקלים",
    contractorApprovalEvent?.note === null,
    JSON.stringify(contractorApprovalEvent?.note)
  );
  check("נציג קבלן אינו רואה את סכום הקיזוז עצמו", detailForContractor?.deduction.amount === null);

  const detailForAdmin = await getDefectDetail(defect.id, "ADMIN");
  const adminApprovalEvent = detailForAdmin?.events.find((e) => e.action === "DEDUCTION_APPROVED");
  check(
    "מנהל עם הרשאת כספים כן רואה את הסכום בהיסטוריה",
    !!adminApprovalEvent?.note && /₪/.test(adminApprovalEvent.note),
    adminApprovalEvent?.note ?? "null"
  );

  const waived = await decideDeduction({ defectId: defect.id, decision: "WAIVED", userId: deptManager.id });
  check("קיזוז שאושר יכול עדיין לעבור לביטול (WAIVED)", waived.deductionStatus === "WAIVED");

  // Re-approve for the appeal flow below.
  await decideDeduction({ defectId: defect.id, decision: "APPROVED", userId: deptManager.id });

  console.log("\nבדיקות ערעור (§826)");
  check("קבלן רשאי להגיש ערעור", can("CONTRACTOR_MANAGER", "defects.appeal"));
  check("מפקח אינו רשאי להגיש ערעור", !can("INSPECTOR", "defects.appeal"));
  check("מנהל אגף רשאי להכריע בערעור", can("DEPT_MANAGER", "defects.decideAppeal"));
  check("קבלן אינו רשאי להכריע בערעור", !can("CONTRACTOR_MANAGER", "defects.decideAppeal"));

  const appealed = await lodgeAppeal({
    defectId: defect.id,
    text: `${TAG} הליקוי תוקן בפועל לפני המועד`,
    userId: contractorMgr.id,
  });
  check("הליקוי עבר לסטטוס APPEALED", appealed.status === "APPEALED");
  check(
    "מועד ההכרעה נקבע ל-14 יום",
    appealed.appealDueAt !== null &&
      Math.abs(appealed.appealDueAt.getTime() - Date.now() - 14 * 24 * 60 * 60 * 1000) < 60_000
  );

  await expectError(
    () => lodgeAppeal({ defectId: defect.id, text: "ניסיון כפול", userId: contractorMgr.id }),
    "לא ניתן להגיש ערעור כפול",
    /כבר הוגש/
  );

  const decided = await decideAppeal({
    defectId: defect.id,
    accepted: true,
    decision: `${TAG} הערעור התקבל — הוכחה שהתיקון בוצע בזמן`,
    userId: deptManager.id,
  });
  check("לאחר ההכרעה הליקוי נסגר", decided.status === "CLOSED");
  check("קבלת הערעור מבטלת את הקיזוז", decided.deductionStatus === "WAIVED");
  check("ההכרעה נרשמה", decided.appealDecision?.includes(TAG) ?? false);

  const finalEvents = await prisma.defectEvent.findMany({
    where: { defectId: defect.id },
    orderBy: { createdAt: "asc" },
  });
  check(
    "כל שרשרת האירועים נשמרה (יצירה עד הכרעת ערעור)",
    finalEvents.some((e) => e.action === "CREATED") &&
      finalEvents.some((e) => e.action === "APPEAL_LODGED") &&
      finalEvents.some((e) => e.action === "APPEAL_ACCEPTED"),
    finalEvents.map((e) => e.action).join(", ")
  );

  console.log("\nבדיקת ליקוי ללא סוג — לא מוצע קיזוז");
  const noTypeDefect = await createDefect({
    title: `${TAG} ליקוי ללא סוג מוגדר`,
    reportedById: inspector.id,
  });
  check("ליקוי ללא defectTypeId אינו מקבל קיזוז", noTypeDefect.deductionStatus === "NONE");
  await expectError(
    () => decideDeduction({ defectId: noTypeDefect.id, decision: "APPROVED", userId: deptManager.id }),
    "לא ניתן לאשר קיזוז לליקוי שלא הוצע לו קיזוז",
    /לא הוצע/
  );

  console.log("\nבדיקת קפאת אזור המכרז על הליקוי");
  // The zone here has no contract area, so the defect should have none either
  // rather than guessing.
  check("ליקוי באזור ללא שיוך קבלן נשאר ללא contractAreaId", defect.contractAreaId === null);

  console.log("\nבדיקות תלונות (§640)");
  const complaint = await createComplaint({
    subject: `${TAG} תלונה על ערימת פסולת`,
    zoneId: zone.id,
    receivedById: inspector.id,
  });
  check("התלונה נוצרה עם מספר אסמכתא", /^TL-\d{4}-\d{4}$/.test(complaint.reference), complaint.reference);
  check("סטטוס התחלתי NEW", complaint.status === "NEW");

  console.log("\nבדיקות הרשאות צפייה");
  check("צופה בלבד אינו רואה ליקויים", !can("VIEWER", "defects.view"));
  check("כספים רואה ליקויים אך לא מבצע פעולות", can("FINANCE", "defects.view") && !can("FINANCE", "defects.create"));
  check("מנהל עבודה יכול לעבוד על ליקוי אך לא לפתוח חדש", can("SITE_SUPERVISOR", "defects.work") && !can("SITE_SUPERVISOR", "defects.create"));
  void siteSupervisor;
  void viewer;
  void finance;

  console.log(`\n${passed} בדיקות עברו, ${failures.length} נכשלו`);
  if (failures.length > 0) {
    console.error("\nכשלים:");
    for (const f of failures) console.error("  ✗", f);
  }
}

main()
  .catch((e) => {
    console.error("הבדיקה נכשלה בשגיאה:", e);
    failures.push(String(e));
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures.length > 0 ? 1 : 0);
  });
