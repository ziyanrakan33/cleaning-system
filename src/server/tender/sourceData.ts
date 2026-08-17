/**
 * Everything extracted from the four source files in `claudephotos/`.
 *
 * This module is the single place where figures read off the tender document
 * and the two photographed bid tables are written down. Nothing here is
 * inferred, averaged or reconciled — where the sources disagree, both values
 * are carried through to SOURCE_CONFLICTS and a manager decides.
 *
 * See docs/tender-analysis.md for the full derivation, including the
 * arithmetic checks that confirm each bid table was read correctly.
 */

export const SOURCE_FILES = {
  tenderDoc:
    "claudephotos/מכרז טיאוט כפר סבא - טיוטה סופית  -  תוקן  -  מצב תאימות.doc",
  /** Printed title reads "אזור 1"; price columns are "שלג לבן (1986) בע\"מ". */
  area1Table: "claudephotos/WhatsApp Image 2026-08-17 at 08.22.56.jpeg",
  /** Printed title reads "אזור 2"; price column is "פרח השקד בע\"מ". */
  area2Table: "claudephotos/WhatsApp Image 2026-08-17 at 08.22.42.jpeg",
  zoneMap: "claudephotos/05872023-3d0c-44f8-b783-c055edc14ac0.jpeg",
} as const;

export const TENDER = {
  name: "מכרז פומבי למתן שירותי ניקיון וטיאוט רחובות ושטחים פתוחים",
  /** The document is a draft — every occurrence of the number is "מס' _____". */
  number: null,
  municipality: "כפר סבא",
  contractMonths: 36,
  optionYears: 2,
  /** Tender §545 — excludes parks, שצ"פים and groves (§546). */
  totalInfrastructureKm: 197,
  /** Tender §919 — a different measure: the whole municipal jurisdiction. */
  jurisdictionKm: 295,
  maxDecreasePercent: 25,
  maxIncreasePercent: 50,
} as const;

/**
 * Contractor → contract area.
 *
 * NOTE: the task description had these two swapped. The mapping below is taken
 * from the printed table titles and the printed price-column headers, which
 * agree with each other in both images. See docs/tender-analysis.md §"ממצא 1".
 */
export const CONTRACT_AREAS = [
  {
    areaNumber: 1,
    name: "אזור מכרז 1",
    contractorName: 'שלג לבן (1986) בע"מ',
    sourceFile: SOURCE_FILES.area1Table,
    sourceImageRegion: 'כותרת הטבלה ("אזור 1") וכותרות עמודות המחיר ("שלג לבן (1986) בע"מ", "סה"כ שלג לבן")',
    /** Sum of the 12 daily line totals. 52,796.74 × 26 = 1,372,715.24, which
     *  matches the printed "סה"כ לחודש" of 1,372,715 — confirming the read. */
    dailyTotal: 52796.74,
    monthlyTotal: 1372715,
  },
  {
    areaNumber: 2,
    name: "אזור מכרז 2",
    contractorName: 'פרח השקד בע"מ',
    sourceFile: SOURCE_FILES.area2Table,
    sourceImageRegion: 'כותרת הטבלה ("אזור 2") וכותרת עמודת המחיר ("פרח השקד בע"מ")',
    dailyTotal: 60163.48,
    /** Deliberately not loaded: the printed monthly sums for area 2 do not
     *  reconcile with the daily total the way area 1's do. Flagged for review
     *  rather than guessed. */
    monthlyTotal: null,
  },
] as const;

export type ResourceCatalogEntry = {
  code: string;
  name: string;
  category:
    | "SWEEPER_SMALL"
    | "SWEEPER_MEDIUM"
    | "SWEEPER_LARGE"
    | "TASK_VEHICLE"
    | "MIUL"
    | "MANUAL_WORKER"
    | "WASHER"
    | "TRIMMER"
    | "SUPERVISOR"
    | "OTHER";
  shiftType: "MORNING" | "AFTERNOON" | "NIGHT" | "REST_DAY" | "FLEXIBLE";
  standardHours: number;
  /** City-wide quantity from the tender's own table 17. Null for catalog rows
   *  that appear only in the winners' tables. */
  tenderQuantity: number | null;
  requiresDriver: boolean;
  requiresExtraWorker: boolean;
  requiresGps: boolean;
  suitableForRoad: boolean;
  suitableForSidewalk: boolean;
  suitableForPath: boolean;
  availableAtNight: boolean;
  availableOnRestDay: boolean;
  sortOrder: number;
  note?: string;
};

/** Tender table 17 (נספח ד'), plus one row that appears only in the bid tables. */
export const RESOURCE_CATALOG: ResourceCatalogEntry[] = [
  {
    code: "TND-01",
    name: "מכונת טיאוט קטנה — יום עבודה בן 8 שעות, כולל נהג מפעיל",
    category: "SWEEPER_SMALL",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 3,
    requiresDriver: true,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: false,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 1,
    note: "מיועדת לטיאוט מכני של מדרכות ומעברים. מיכל כ-1,800 ליטר לפחות (§518).",
  },
  {
    code: "TND-02",
    name: "מכונת טיאוט בינונית ייעודית עם נהג מפעיל, כולל מערכת שטיפה מובנית",
    category: "SWEEPER_MEDIUM",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 10,
    requiresDriver: true,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: false,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 2,
    note: "מיכל 4,000 ליטר לפחות, מורכבת על שלדת רכב (§521).",
  },
  {
    code: "TND-03",
    name: "מכונת טיאוט בינונית ייעודית — משמרת לילה באזורי תעשייה",
    category: "SWEEPER_MEDIUM",
    shiftType: "NIGHT",
    standardHours: 5,
    tenderQuantity: 2,
    requiresDriver: true,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: false,
    availableAtNight: true,
    availableOnRestDay: false,
    sortOrder: 3,
    note: 'א׳–ה׳ ומוצ"ש, 22:00–03:00 (§505). שים לב לסתירה בשעות — ראה SOURCE_CONFLICTS.',
  },
  {
    code: "TND-04",
    name: "מכונת טיאוט גדולה על שלדת משאית, כולל מערכת שטיפה מובנית",
    category: "SWEEPER_LARGE",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 3,
    requiresDriver: true,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: false,
    suitableForPath: false,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 4,
  },
  {
    code: "TND-05",
    name: "טנדר/רכב משימתי + עגלה נגררת + פועל אחד — משמרת בוקר",
    category: "TASK_VEHICLE",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 9,
    requiresDriver: true,
    requiresExtraWorker: true,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 5,
    note: "ארגז פתוח עם כלוב רשת פריק למניעת נפילת חפצים (§500).",
  },
  {
    code: "TND-06",
    name: "טנדר/רכב משימתי + עגלה נגררת + פועל אחד — משמרת צהריים",
    category: "TASK_VEHICLE",
    shiftType: "AFTERNOON",
    standardHours: 8,
    tenderQuantity: 1,
    requiresDriver: true,
    requiresExtraWorker: true,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 6,
  },
  {
    code: "TND-07",
    name: "רכב מיול עם נהג מפעיל, כולל מערכת שטיפה מובנית",
    category: "MIUL",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 10,
    requiresDriver: true,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 7,
  },
  {
    code: "TND-08",
    name: "עובד שטיפה לרכב מיול",
    category: "WASHER",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 10,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: false,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 8,
  },
  {
    code: "TND-09",
    name: "עובד ניקיון ידני — משמרת בוקר",
    category: "MANUAL_WORKER",
    shiftType: "MORNING",
    standardHours: 6.5,
    tenderQuantity: 47,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 9,
    note: "מצויד בעגלה ניידת עם חיישן איתור (§600, §658). 6.5 שעות נטו.",
  },
  {
    code: "TND-10",
    name: "עובד ניקיון ידני — משמרת צהריים",
    category: "MANUAL_WORKER",
    shiftType: "AFTERNOON",
    standardHours: 6.5,
    tenderQuantity: 9,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 10,
  },
  {
    code: "TND-11",
    name: "עובד שטיפה מיומן למכונות טיאוט בינוניות — משמרת יום",
    category: "WASHER",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 13,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: false,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 11,
    note: 'הולך רגלית עם צינור שטיפה בלחץ לאורך כ-5 ק"מ ליום (§499).',
  },
  {
    code: "TND-12",
    name: "עובד שטיפה מיומן לבינוניות — משמרת לילה באזורי תעשייה",
    category: "WASHER",
    shiftType: "NIGHT",
    standardHours: 5,
    tenderQuantity: 2,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: false,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: false,
    availableAtNight: true,
    availableOnRestDay: false,
    sortOrder: 12,
  },
  {
    code: "TND-13",
    name: "עובד ניקיון ידני — משמרת צהריים 13:00–20:00 ביום מנוחה",
    category: "MANUAL_WORKER",
    shiftType: "REST_DAY",
    standardHours: 7,
    tenderQuantity: 5,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: true,
    sortOrder: 13,
  },
  {
    code: "TND-14",
    name: "עובד חרמש מיומן להפעלת חרמש מוטורי — משמרת יום",
    category: "TRIMMER",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 4,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: false,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 14,
    note: "מועסק רק בהינתן הזמנה מראש ובכתב מהרשות; אינו במצבת העובדים הקבועה (טבלה 14).",
  },
  {
    code: "TND-15",
    name: "מנהל עבודה אזורי כולל רכב",
    category: "SUPERVISOR",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: 2,
    requiresDriver: true,
    requiresExtraWorker: false,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 15,
    note: "אי-העסקתו גוררת קיזוז של 1,000 ₪ לכל יום או חלק ממנו (טבלה 15).",
  },
  {
    code: "TND-16",
    name: "טנדר דאבל קבינה + נהג + שני פועלים — בוקר 06:00–14:00 ביום מנוחה",
    category: "TASK_VEHICLE",
    shiftType: "REST_DAY",
    standardHours: 8,
    tenderQuantity: 1,
    requiresDriver: true,
    requiresExtraWorker: true,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: true,
    sortOrder: 16,
  },
  {
    code: "TND-17",
    name: "טנדר דאבל קבינה + נהג + שני פועלים — משמרת 8 שעות ביום מנוחה",
    category: "TASK_VEHICLE",
    shiftType: "REST_DAY",
    standardHours: 8,
    tenderQuantity: 1,
    requiresDriver: true,
    requiresExtraWorker: true,
    requiresGps: true,
    suitableForRoad: true,
    suitableForSidewalk: true,
    suitableForPath: true,
    availableAtNight: false,
    availableOnRestDay: true,
    sortOrder: 17,
  },
  {
    // Present in BOTH winners' tables (area 1 line 11, area 2 line 11) but absent
    // from the tender's own table 17. Kept as its own catalog row rather than
    // folded into TND-11, so the discrepancy stays visible.
    code: "BID-01",
    name: "עובד שטיפה מיומן למכונת טיאוט גדולה — משמרת יום",
    category: "WASHER",
    shiftType: "MORNING",
    standardHours: 8,
    tenderQuantity: null,
    requiresDriver: false,
    requiresExtraWorker: false,
    requiresGps: false,
    suitableForRoad: true,
    suitableForSidewalk: false,
    suitableForPath: false,
    availableAtNight: false,
    availableOnRestDay: false,
    sortOrder: 18,
    note: "מופיע בשתי טבלאות הזוכים אך לא בטבלת המשאבים של המכרז.",
  },
];

export type QuotaRow = {
  lineNumber: number;
  resourceCode: string;
  quantity: number;
  shiftHours: number;
  maxUnitPrice: number | null;
  unitPrice: number;
  dailyTotal: number;
  note?: string;
};

/** אזור 1 — שלג לבן (1986) בע"מ. Line numbering skips 12, as printed. */
export const AREA_1_QUOTAS: QuotaRow[] = [
  { lineNumber: 1, resourceCode: "TND-01", quantity: 2, shiftHours: 8, maxUnitPrice: null, unitPrice: 1845.52, dailyTotal: 3691.04 },
  { lineNumber: 2, resourceCode: "TND-02", quantity: 6, shiftHours: 8, maxUnitPrice: null, unitPrice: 2230, dailyTotal: 13381.2, note: "המחיר ליחידה מודפס מעוגל לשקל; 13,381.20 ÷ 6 = 2,230.20." },
  { lineNumber: 3, resourceCode: "TND-03", quantity: 2, shiftHours: 5, maxUnitPrice: null, unitPrice: 1263, dailyTotal: 2525.2, note: "המחיר ליחידה מודפס מעוגל לשקל; 2,525.20 ÷ 2 = 1,262.60." },
  { lineNumber: 4, resourceCode: "TND-04", quantity: 1, shiftHours: 8, maxUnitPrice: null, unitPrice: 2277.4, dailyTotal: 2277.4 },
  { lineNumber: 5, resourceCode: "TND-05", quantity: 5, shiftHours: 8, maxUnitPrice: null, unitPrice: 1764, dailyTotal: 8820.5, note: "המחיר ליחידה מודפס מעוגל לשקל; 8,820.50 ÷ 5 = 1,764.10." },
  { lineNumber: 6, resourceCode: "TND-07", quantity: 5, shiftHours: 8, maxUnitPrice: null, unitPrice: 1473, dailyTotal: 7363.2, note: "המחיר ליחידה מודפס מעוגל לשקל; 7,363.20 ÷ 5 = 1,472.64." },
  { lineNumber: 7, resourceCode: "TND-08", quantity: 5, shiftHours: 8, maxUnitPrice: null, unitPrice: 627.76, dailyTotal: 3138.8 },
  { lineNumber: 8, resourceCode: "TND-09", quantity: 10, shiftHours: 6.5, maxUnitPrice: null, unitPrice: 513.3, dailyTotal: 5133 },
  { lineNumber: 9, resourceCode: "TND-11", quantity: 6, shiftHours: 8, maxUnitPrice: null, unitPrice: 627.76, dailyTotal: 3766.56 },
  { lineNumber: 10, resourceCode: "TND-12", quantity: 2, shiftHours: 5, maxUnitPrice: null, unitPrice: 389.4, dailyTotal: 778.8 },
  { lineNumber: 11, resourceCode: "BID-01", quantity: 1, shiftHours: 8, maxUnitPrice: null, unitPrice: 627.76, dailyTotal: 627.76 },
  { lineNumber: 13, resourceCode: "TND-15", quantity: 1, shiftHours: 8, maxUnitPrice: null, unitPrice: 1293.28, dailyTotal: 1293.28 },
];

/** אזור 2 — פרח השקד בע"מ. Every row verified as quantity × unitPrice = dailyTotal. */
export const AREA_2_QUOTAS: QuotaRow[] = [
  { lineNumber: 1, resourceCode: "TND-01", quantity: 1, shiftHours: 8, maxUnitPrice: 2124, unitPrice: 1770, dailyTotal: 1770 },
  { lineNumber: 2, resourceCode: "TND-02", quantity: 6, shiftHours: 8, maxUnitPrice: 2950, unitPrice: 2271.5, dailyTotal: 13629 },
  { lineNumber: 3, resourceCode: "TND-04", quantity: 2, shiftHours: 8, maxUnitPrice: 2950, unitPrice: 2537, dailyTotal: 5074 },
  { lineNumber: 4, resourceCode: "TND-05", quantity: 5, shiftHours: 8, maxUnitPrice: 2124, unitPrice: 1888, dailyTotal: 9440 },
  { lineNumber: 5, resourceCode: "TND-06", quantity: 1, shiftHours: 8, maxUnitPrice: 1298, unitPrice: 1203.6, dailyTotal: 1203.6 },
  { lineNumber: 6, resourceCode: "TND-07", quantity: 5, shiftHours: 8, maxUnitPrice: 2124, unitPrice: 1180, dailyTotal: 5900 },
  { lineNumber: 7, resourceCode: "TND-08", quantity: 5, shiftHours: 8, maxUnitPrice: 708, unitPrice: 660.8, dailyTotal: 3304 },
  { lineNumber: 8, resourceCode: "TND-09", quantity: 10, shiftHours: 6.5, maxUnitPrice: 536.9, unitPrice: 507.4, dailyTotal: 5074 },
  { lineNumber: 9, resourceCode: "TND-10", quantity: 4, shiftHours: 6.5, maxUnitPrice: 536.9, unitPrice: 495.6, dailyTotal: 1982.4 },
  { lineNumber: 10, resourceCode: "TND-11", quantity: 6, shiftHours: 8, maxUnitPrice: 708, unitPrice: 660.8, dailyTotal: 3964.8 },
  { lineNumber: 11, resourceCode: "BID-01", quantity: 2, shiftHours: 8, maxUnitPrice: 708, unitPrice: 660.8, dailyTotal: 1321.6 },
  { lineNumber: 12, resourceCode: "TND-13", quantity: 2, shiftHours: 7, maxUnitPrice: 767, unitPrice: 672.6, dailyTotal: 1345.2 },
  { lineNumber: 13, resourceCode: "TND-14", quantity: 4, shiftHours: 8, maxUnitPrice: 649, unitPrice: 647.82, dailyTotal: 2591.28 },
  { lineNumber: 14, resourceCode: "TND-15", quantity: 1, shiftHours: 8, maxUnitPrice: 1298, unitPrice: 1239, dailyTotal: 1239 },
  { lineNumber: 15, resourceCode: "TND-16", quantity: 1, shiftHours: 8, maxUnitPrice: 2360, unitPrice: 2324.6, dailyTotal: 2324.6 },
];

/**
 * The ten operational zones as read off the map photo: their numbers and their
 * colours. Geometry is deliberately absent — see docs/tender-analysis.md §"ממצא 3".
 *
 * `mapColor` is the colour as it appears on the paper map. `color` is what the
 * app draws with: zones 1/8 share a pink on the map and 3/9 share a yellow, so
 * distinct hues are used to keep the legend unambiguous.
 */
export const OPERATIONAL_ZONES = [
  { zoneNumber: 1, mapColor: "ורוד", color: "#ec4899" },
  { zoneNumber: 2, mapColor: "כתום בהיר", color: "#fb923c" },
  { zoneNumber: 3, mapColor: "צהוב", color: "#eab308" },
  { zoneNumber: 4, mapColor: "כחול-אפור", color: "#60a5fa" },
  { zoneNumber: 5, mapColor: "כתום", color: "#ea580c" },
  { zoneNumber: 6, mapColor: "סגול", color: "#8b5cf6" },
  { zoneNumber: 7, mapColor: "תכלת", color: "#38bdf8" },
  { zoneNumber: 8, mapColor: "ורוד", color: "#f43f5e" },
  { zoneNumber: 9, mapColor: "צהוב", color: "#ca8a04" },
  { zoneNumber: 10, mapColor: "טורקיז", color: "#14b8a6" },
] as const;

export type ConflictSeed = {
  topic: string;
  valueA: string;
  sourceA: string;
  valueB: string;
  sourceB: string;
  valueC?: string;
  sourceC?: string;
  notes: string;
};

/**
 * Disagreements between the sources. Both values are stored; the system never
 * picks one. A manager resolves each in /sources.
 */
export const SOURCE_CONFLICTS: ConflictSeed[] = [
  {
    topic: "כמות מכונות טיאוט בינוניות למשמרת יום",
    valueA: "10",
    sourceA: "מכרז, טבלה 17 שורה 2 (כמות עירונית)",
    valueB: "12 (6 + 6)",
    sourceB: "סכום טבלאות הזוכים: אזור 1 שורה 2 + אזור 2 שורה 2",
    notes: "טבלאות הזוכים מתחייבות ל-2 מכונות יותר מהכמות שבמכרז.",
  },
  {
    topic: "כמות עובדי ניקיון ידני למשמרת בוקר",
    valueA: "47",
    sourceA: "מכרז, טבלה 17 שורה 9 (כמות עירונית)",
    valueB: "20 (10 + 10)",
    sourceB: "סכום טבלאות הזוכים: אזור 1 שורה 8 + אזור 2 שורה 8",
    notes:
      "הפער המהותי ביותר בין המקורות — 27 עובדים. אינו מוסבר באף אחד מקובצי המקור. דורש הכרעת מנהל לפני שימוש בתכנון.",
  },
  {
    topic: "כמות עובדי ניקיון ידני למשמרת צהריים",
    valueA: "9",
    sourceA: "מכרז, טבלה 17 שורה 10",
    valueB: "4 (0 + 4)",
    sourceB: "טבלאות הזוכים — הפריט אינו מופיע כלל בטבלת אזור 1",
    notes: "ייתכן שכל משמרת הצהריים רוכזה באזור 2, אך המקורות אינם אומרים זאת.",
  },
  {
    topic: "כמות טנדרים/רכבי משימה למשמרת בוקר",
    valueA: "9",
    sourceA: "מכרז, טבלה 17 שורה 5",
    valueB: "10 (5 + 5)",
    sourceB: "סכום טבלאות הזוכים: אזור 1 שורה 5 + אזור 2 שורה 4",
    notes: "פער של רכב אחד.",
  },
  {
    topic: "כמות עובדי שטיפה מיומנים למשמרת יום",
    valueA: "13",
    sourceA: "מכרז, טבלה 17 שורה 11",
    valueB: "15 (7 + 8)",
    sourceB: "טבלאות הזוכים, כולל שורות עובד השטיפה למכונה גדולה שאינן במכרז",
    notes:
      "שתי טבלאות הזוכים כוללות פריט 'עובד שטיפה מיומן למכונת טיאוט גדולה' שאינו קיים בטבלת המכרז (נשמר כ-BID-01).",
  },
  {
    topic: "כמות עובדי ניקיון ידני ביום מנוחה",
    valueA: "5",
    sourceA: "מכרז, טבלה 17 שורה 13",
    valueB: "2 (0 + 2)",
    sourceB: "טבלת אזור 2 שורה 12; הפריט אינו מופיע בטבלת אזור 1",
    notes: "",
  },
  {
    topic: "שעות עבודה למכונת טיאוט בינונית בלילה באזורי תעשייה",
    valueA: "5 שעות",
    sourceA: "מכרז, טבלה 17 שורה 3 — נוסח התיאור, וכן §505 ו-§554",
    valueB: "8 שעות",
    sourceB: 'מכרז, טבלה 17 שורה 3 — עמודת "שעות עבודה"',
    valueC: "5 שעות",
    sourceC: "טבלת אזור 1 שורה 3",
    notes:
      "סתירה פנימית בתוך המכרז עצמו. שני מקורות בלתי תלויים תומכים ב-5 שעות, אך עמודת השעות אומרת 8.",
  },
  {
    topic: 'אומדן היקף הק"מ לניקוי',
    valueA: '197 ק"מ',
    sourceA: 'מכרז §545 — "סה"כ תשתיות לניקוי (ק"מ אורך)", ללא גנים ושצ"פים',
    valueB: '295 ק"מ',
    sourceB: "מכרז §919 — היקף שטח שיפוט העירייה",
    valueC: '175.9 ק"מ',
    sourceC: "בסיס הנתונים — ייבוא OSM (160.1 רחובות + 14.4 שבילים + 1.5 מדרחובים)",
    notes:
      'שלושת המספרים מודדים דברים שונים ואינם בהכרח סותרים. הפער בין 197 ל-175.9 מצביע על תשתיות שחסרות בייבוא ה-OSM ויש להשלימן (שצ"פים, מדרכות נפרדות, שטחים ציבוריים).',
  },
];

/** Sanity checks over the tables above; run by the seed and by the test script. */
export function verifySourceData(): string[] {
  const problems: string[] = [];
  const codes = new Set(RESOURCE_CATALOG.map((r) => r.code));

  for (const [label, rows] of [
    ["אזור 1", AREA_1_QUOTAS],
    ["אזור 2", AREA_2_QUOTAS],
  ] as const) {
    for (const row of rows) {
      if (!codes.has(row.resourceCode)) {
        problems.push(`${label} שורה ${row.lineNumber}: קוד משאב לא מוכר ${row.resourceCode}`);
      }
      // Several area-1 rows print the unit price rounded to whole shekels while
      // the daily total keeps the agorot, so the product can be off by up to
      // half a shekel per unit. Anything beyond that is a misread, not rounding.
      const expected = row.quantity * row.unitPrice;
      const tolerance = row.quantity * 0.5 + 0.01;
      if (Math.abs(expected - row.dailyTotal) > tolerance) {
        problems.push(
          `${label} שורה ${row.lineNumber}: ${row.quantity} × ${row.unitPrice} = ${expected}, אך הסה"כ המודפס הוא ${row.dailyTotal}`
        );
      }
      if (row.maxUnitPrice !== null && row.unitPrice > row.maxUnitPrice) {
        problems.push(
          `${label} שורה ${row.lineNumber}: מחיר הקבלן ${row.unitPrice} גבוה מהמחיר המרבי ${row.maxUnitPrice}`
        );
      }
    }
  }

  const area1Sum = AREA_1_QUOTAS.reduce((s, r) => s + r.dailyTotal, 0);
  if (Math.abs(area1Sum - CONTRACT_AREAS[0].dailyTotal) > 0.01) {
    problems.push(`סכום השורות של אזור 1 (${area1Sum}) אינו תואם לסה"כ היומי הרשום`);
  }
  const area2Sum = AREA_2_QUOTAS.reduce((s, r) => s + r.dailyTotal, 0);
  if (Math.abs(area2Sum - CONTRACT_AREAS[1].dailyTotal) > 0.01) {
    problems.push(`סכום השורות של אזור 2 (${area2Sum}) אינו תואם לסה"כ היומי הרשום`);
  }
  if (OPERATIONAL_ZONES.length !== 10) {
    problems.push(`צפויים 10 אזורים תפעוליים, נמצאו ${OPERATIONAL_ZONES.length}`);
  }

  return problems;
}
