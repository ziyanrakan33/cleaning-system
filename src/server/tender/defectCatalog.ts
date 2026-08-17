/**
 * The agreed-deduction table from the tender (טבלה 15, "הליקוי / סכום הקיזוז
 * המוסכם בשקלים חדשים לכל מקרה בודד").
 *
 * `unitBasis` keeps the contract's own wording for what counts as one
 * occurrence, because it genuinely differs per row — some are per day, some per
 * item per worker, one is per bag. Normalising that away would make the
 * deduction arithmetic look more certain than the contract actually is.
 *
 * `defaultFixHours` is NOT from the fines table. Only three deadlines are
 * stated anywhere in the tender (below); every other row is left null so the
 * inspector sets the deadline per §821 rather than the system inventing one.
 */

export type DefectTypeSeed = {
  code: string;
  name: string;
  deductionAmount: number;
  unitBasis: string;
  category: string;
  defaultFixHours: number | null;
  sortOrder: number;
  notes?: string;
};

export const DEFECT_CATALOG_SOURCE = "מכרז, נספח ט' לחוזה הקבלנות, טבלת הקיזוזים המוסכמים";

export const DEFECT_TYPES: DefectTypeSeed[] = [
  // ---- ציוד ומדים ----
  {
    code: "LK-01",
    name: "אי לבישת אפוד זוהר",
    deductionAmount: 100,
    unitBasis: "לכל מקרה בודד",
    category: "ציוד ובטיחות",
    defaultFixHours: null,
    sortOrder: 1,
  },
  {
    code: "LK-02",
    name: "העדר ציוד נדרש לעובדי הנקיון",
    deductionAmount: 200,
    unitBasis: "לכל פריט בנפרד, לכל עובד, ליום עבודה",
    category: "ציוד ובטיחות",
    defaultFixHours: null,
    sortOrder: 2,
  },
  {
    code: "LK-03",
    name: "אי העסקת עובד במדים (לרבות כל אמצעי נוסף בהתאם להוראות החוזה)",
    deductionAmount: 200,
    unitBasis: "לכל יום",
    category: "ציוד ובטיחות",
    defaultFixHours: null,
    sortOrder: 3,
  },

  // ---- כוח אדם ----
  {
    code: "LK-04",
    name: "אי העסקת עובד בצוות הטיאוט/הניקיון",
    deductionAmount: 400,
    unitBasis: "לכל יום",
    category: "כוח אדם",
    defaultFixHours: null,
    sortOrder: 4,
  },
  {
    code: "LK-05",
    name: "אי העסקת מנהל עבודה אזורי/עירוני",
    deductionAmount: 1000,
    unitBasis: "לכל יום או חלק ממנו",
    category: "כוח אדם",
    defaultFixHours: null,
    sortOrder: 5,
  },
  {
    code: "LK-06",
    name: "ניהול שיחה פרטית בטלפון על ידי העובד",
    deductionAmount: 200,
    unitBasis: "לכל מקרה בודד",
    category: "כוח אדם",
    defaultFixHours: null,
    sortOrder: 6,
  },
  {
    code: "LK-07",
    name: "העסקת עובד ללא שהוצא עבורו אישור עבודה ו/או האישור אינו תקף",
    deductionAmount: 10000,
    unitBasis: "לכל מקרה בודד",
    category: "כוח אדם",
    defaultFixHours: null,
    sortOrder: 7,
    notes: "הקיזוז הגבוה ביותר בטבלה.",
  },
  {
    code: "LK-08",
    name: "אי תיקון הפרה של זכויות עובדים שנמצאה על ידי בודק שכר",
    deductionAmount: 1000,
    unitBasis: "לכל יום הפרה",
    category: "כוח אדם",
    // §804/§809: 30 days from notification to produce the corrective affidavit.
    defaultFixHours: 30 * 24,
    sortOrder: 8,
    notes: "המכרז קוצב 30 ימים לתיקון הממצאים והמצאת תצהיר רו\"ח (§804, §809).",
  },
  {
    code: "LK-09",
    name: "מסירת עבודות לקבלן משנה ללא אישור",
    deductionAmount: 2500,
    unitBasis: "לכל יום",
    category: "כוח אדם",
    defaultFixHours: null,
    sortOrder: 9,
  },

  // ---- כלי רכב וציוד מכני ----
  {
    code: "LK-10",
    name: "אי העמדת מכונת טיאוט בהתאם למפורט במסמכי החוזה",
    deductionAmount: 3000,
    unitBasis: "ליום",
    category: "כלי רכב וציוד מכני",
    // §591: a working replacement must be on site within 4 hours of the fault.
    defaultFixHours: 4,
    sortOrder: 10,
    notes: "המכרז מחייב העמדת מכונה חלופית תקינה תוך 4 שעות מהתקלה (§591).",
  },
  {
    code: "LK-11",
    name: "אי העמדת טנדר בהתאם למפורט במסמכי המכרז",
    deductionAmount: 1000,
    unitBasis: "לכל יום",
    category: "כלי רכב וציוד מכני",
    defaultFixHours: null,
    sortOrder: 11,
  },
  {
    code: "LK-12",
    name: "אי העמדת חרמש מוטורי",
    deductionAmount: 1000,
    unitBasis: "לכל יום",
    category: "כלי רכב וציוד מכני",
    defaultFixHours: null,
    sortOrder: 12,
  },
  {
    code: "LK-13",
    name: "אי אספקת חרמש חליפי במקרה של תקלה",
    deductionAmount: 500,
    unitBasis: "לכל מקרה בודד",
    category: "כלי רכב וציוד מכני",
    // "עד בוקר היום למחרת" — treated as one working day.
    defaultFixHours: 24,
    sortOrder: 13,
    notes: "עד בוקר היום למחרת, לרבות ביצוע תוכנית העבודה שלא בוצעה בגין היום החולף.",
  },
  {
    code: "LK-14",
    name: "אי שטיפה וחיטוי מכונת הטיאוט בסוף כל יום",
    deductionAmount: 200,
    unitBasis: "לכל מקרה בודד",
    category: "כלי רכב וציוד מכני",
    defaultFixHours: null,
    sortOrder: 14,
  },
  {
    code: "LK-15",
    name: "היעדר מערכת בקרה לעגלות העובדים הידניים (חיישן מיקום ואיתור)",
    deductionAmount: 200,
    unitBasis: "לכל יום שלא עובד ו/או לא קיים",
    category: "כלי רכב וציוד מכני",
    defaultFixHours: null,
    sortOrder: 15,
  },

  // ---- ביצוע העבודה ----
  {
    code: "LK-16",
    name: "אי סיום כל העבודות בהתאם לתוכנית העבודה",
    deductionAmount: 3000,
    unitBasis: "ליום",
    category: "ביצוע העבודה",
    defaultFixHours: null,
    sortOrder: 16,
  },
  {
    code: "LK-17",
    name: "אי ריקון אשפה מאשפתונים והחלפת שקית, או אי ניקוי לוח מודעות",
    deductionAmount: 80,
    unitBasis: "לכל מקרה בודד",
    category: "ביצוע העבודה",
    defaultFixHours: null,
    sortOrder: 17,
    notes: "הקיזוז הנמוך ביותר בטבלה.",
  },
  {
    code: "LK-18",
    name: "אי החלפת שקיות אשפתונים בהתאם לצבעים שנקבעו",
    deductionAmount: 200,
    unitBasis: "לכל אשפתון, לכל שקית וליום",
    category: "ביצוע העבודה",
    defaultFixHours: null,
    sortOrder: 18,
    notes: "צבע השקית מתחלף מדי יום לפי מחזור של שלושה צבעים (§533).",
  },
  {
    code: "LK-19",
    name: "עשבייה אשר גובהה מעל 5 ס\"מ",
    deductionAmount: 500,
    unitBasis: "לכל מקרה בודד",
    category: "ביצוע העבודה",
    defaultFixHours: null,
    sortOrder: 19,
  },
  {
    code: "LK-20",
    name: "אי ביצוע הוראות המנהל או המפקח",
    deductionAmount: 500,
    unitBasis: "לכל הוראה",
    category: "ביצוע העבודה",
    defaultFixHours: null,
    sortOrder: 20,
  },
  {
    code: "LK-21",
    name: "איחור בתיקון נזק לתשתית (מעבר ל-24 שעות)",
    deductionAmount: 1000,
    unitBasis: "לכל יום",
    category: "ביצוע העבודה",
    defaultFixHours: 24,
    sortOrder: 21,
  },

  // ---- טיפול בפסולת ----
  {
    code: "LK-22",
    name: "השלכת אשפה ופסולת למכולות ציבוריות או לאזור שהעירייה לא הורתה עליו",
    deductionAmount: 500,
    unitBasis: "לכל שקית/פסולת",
    category: "טיפול בפסולת",
    defaultFixHours: null,
    sortOrder: 22,
  },
  {
    code: "LK-23",
    name: "איסוף פסולת מתכת, אלקטרוניקה או חומר גלם אחר בניגוד להוראות המנהל",
    deductionAmount: 300,
    unitBasis: "לכל מקרה בודד",
    category: "טיפול בפסולת",
    defaultFixHours: null,
    sortOrder: 23,
  },
];

/**
 * §822 — where the contractor misses the deadline and the municipality carries
 * out the fix itself, it recovers its costs plus this surcharge.
 */
export const MUNICIPALITY_FIX_SURCHARGE_PERCENT = 15;

/** §826 — the contractor has seven days from receipt of the list to appeal. */
export const APPEAL_WINDOW_DAYS = 7;

/** §826 — and the department head has fourteen days to rule. Final. */
export const APPEAL_DECISION_DAYS = 14;

/**
 * The camera row of the fines table (300 ₪ per camera not installed or not
 * operating) is deliberately absent from this catalog: cameras are handled by a
 * separate existing system and are out of scope here. See
 * docs/tender-analysis.md.
 */
export const EXCLUDED_FROM_CATALOG = [
  {
    name: "לכל מצלמה בודדת שלא תותקן ו/או לא תופעל על מכונות הטיאוט והטנדרים",
    deductionAmount: 300,
    reason: "מצלמות מטופלות במערכת קיימת ונפרדת ואינן בתחום המערכת הזו.",
  },
];

export function verifyDefectCatalog(): string[] {
  const problems: string[] = [];
  const codes = new Set<string>();
  for (const t of DEFECT_TYPES) {
    if (codes.has(t.code)) problems.push(`קוד כפול: ${t.code}`);
    codes.add(t.code);
    if (t.deductionAmount <= 0) problems.push(`${t.code}: סכום קיזוז לא תקין`);
    if (!t.unitBasis.trim()) problems.push(`${t.code}: חסר בסיס חיוב`);
  }
  // 24 printed rows, minus the camera row that is out of scope.
  const expected = 24 - EXCLUDED_FROM_CATALOG.length;
  if (DEFECT_TYPES.length !== expected) {
    problems.push(`צפויים ${expected} סוגי ליקוי, הוגדרו ${DEFECT_TYPES.length}`);
  }
  return problems;
}
