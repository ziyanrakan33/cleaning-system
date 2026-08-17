/** Shared Hebrew labels for the defect module, so the list, the detail screen and the map agree. */

export const DEFECT_STATUS_LABEL: Record<string, string> = {
  NEW: "חדש",
  ASSIGNED: "הועבר לטיפול",
  IN_PROGRESS: "בטיפול",
  AWAITING_PROOF: "ממתין להוכחה",
  FIXED: "תוקן",
  REJECTED: "נדחה",
  APPEALED: "בערעור",
  CLOSED: "נסגר",
};

export const DEFECT_STATUS_CLASS: Record<string, string> = {
  NEW: "bg-accent/15 text-accent",
  ASSIGNED: "bg-accent/10 text-accent",
  IN_PROGRESS: "bg-warning/15 text-warning",
  AWAITING_PROOF: "bg-warning/20 text-warning",
  FIXED: "bg-success/15 text-success",
  REJECTED: "bg-danger/15 text-danger",
  APPEALED: "bg-critical/15 text-critical",
  CLOSED: "bg-muted/15 text-muted",
};

export const SEVERITY_LABEL: Record<string, string> = {
  LOW: "נמוכה",
  MEDIUM: "בינונית",
  HIGH: "גבוהה",
  CRITICAL: "קריטית",
};

export const SEVERITY_CLASS: Record<string, string> = {
  LOW: "text-muted",
  MEDIUM: "text-foreground",
  HIGH: "text-warning",
  CRITICAL: "text-danger font-semibold",
};

export const ORIGIN_LABEL: Record<string, string> = {
  INSPECTION: "סיור פיקוח",
  CALL_CENTER: "פניית מוקד",
  MANAGER: "הנחיית מנהל",
  CONTRACTOR: "דיווח הקבלן",
  OTHER: "אחר",
};

export const DEDUCTION_STATUS_LABEL: Record<string, string> = {
  NONE: "ללא קיזוז",
  PROPOSED: "מוצע",
  APPROVED: "אושר",
  WAIVED: "בוטל",
  APPLIED: "הוחל",
};

export const DEDUCTION_STATUS_CLASS: Record<string, string> = {
  NONE: "text-muted",
  PROPOSED: "text-warning",
  APPROVED: "text-danger",
  WAIVED: "text-success",
  APPLIED: "text-danger",
};

export const COMPLAINT_STATUS_LABEL: Record<string, string> = {
  NEW: "חדשה",
  ASSIGNED: "הועברה לטיפול",
  IN_PROGRESS: "בטיפול",
  RESOLVED: "טופלה",
  REJECTED: "נדחתה",
  CLOSED: "נסגרה",
};

export const INSPECTION_ROUND_LABEL: Record<string, string> = {
  MORNING_10: "פעימה ראשונה — 10:00",
  MIDDAY_12: "פעימה שנייה — 12:00",
  AD_HOC: "סיור מיוחד",
};

export const INSPECTION_STATUS_LABEL: Record<string, string> = {
  PLANNED: "מתוכנן",
  IN_PROGRESS: "בביצוע",
  COMPLETED: "הושלם",
  CANCELLED: "בוטל",
};

export const EVENT_ACTION_LABEL: Record<string, string> = {
  CREATED: "הליקוי נפתח",
  STATUS_CHANGE: "שינוי סטטוס",
  PHOTO_BEFORE_ADDED: "נוספה תמונת לפני",
  PHOTO_AFTER_ADDED: "נוספה תמונת אחרי",
  DEDUCTION_APPROVED: "הקיזוז אושר",
  DEDUCTION_WAIVED: "הקיזוז בוטל",
  APPEAL_LODGED: "הוגש ערעור",
  APPEAL_ACCEPTED: "הערעור התקבל",
  APPEAL_DENIED: "הערעור נדחה",
};

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "בעוד 3 שעות" / "באיחור של יומיים" — the deadline is what the field cares about. */
export function relativeDeadline(iso: string | null): string {
  if (!iso) return "ללא מועד יעד";
  const diffMs = new Date(iso).getTime() - Date.now();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const hours = Math.round(abs / (60 * 60 * 1000));
  const days = Math.round(abs / (24 * 60 * 60 * 1000));
  const amount = hours < 48 ? `${hours} שעות` : `${days} ימים`;
  return overdue ? `באיחור של ${amount}` : `בעוד ${amount}`;
}
