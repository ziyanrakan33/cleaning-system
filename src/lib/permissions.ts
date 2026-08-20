/**
 * Single source of truth for who may do what.
 *
 * Both route handlers and UI use these helpers, so a button is never shown for
 * an action the API would reject — and, more importantly, never the reverse.
 */

export type Role =
  | "ADMIN"
  | "MANAGER"
  | "CITY_MANAGER"
  | "DEPT_MANAGER"
  | "INSPECTOR"
  | "CONTRACTOR_MANAGER"
  | "SITE_SUPERVISOR"
  | "EMPLOYEE"
  | "VIEWER"
  | "FINANCE";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "מנהל מערכת",
  MANAGER: "מנהל (תפקיד ישן)",
  CITY_MANAGER: "מנהל עירוני",
  DEPT_MANAGER: "מנהל אגף",
  INSPECTOR: "מפקח אזורי",
  CONTRACTOR_MANAGER: "מנהל קבלן",
  SITE_SUPERVISOR: "מנהל עבודה",
  EMPLOYEE: "עובד / נהג",
  VIEWER: "צפייה בלבד",
  FINANCE: "כספים",
};

export type Permission =
  /** See prices, unit rates and contract totals. */
  | "finance.view"
  /** Approve deductions against a contractor. */
  | "finance.approveDeduction"
  /** Export reports containing money. */
  | "finance.export"
  /** See the source/verification screen. */
  | "sources.view"
  /** Approve, correct or reject an extracted value; resolve a conflict. */
  | "sources.verify"
  /** Set which contract area an operational zone belongs to. */
  | "zones.assignContractArea"
  /** Draw or import zone boundaries. */
  | "zones.editBoundary"
  /** Correct a street segment's zone by hand. */
  | "segments.override"
  /** Create/edit streets, paths and public areas. */
  | "streets.edit"
  /** Create/edit resources and the resource-type catalog. */
  | "resources.edit"
  /** Move a resource between operational zones. */
  | "resources.transfer"
  /** Approve an allocation that exceeds the contractual quota. */
  | "quota.approveExcess"
  /** Create and edit work plans. */
  | "plans.edit"
  /** Publish a work plan. */
  | "plans.publish"
  /** See personal details of workers. */
  | "workers.viewPersonal"
  /** Manage user accounts. */
  | "users.manage"
  /** Hard-delete data. */
  | "data.delete"
  /** See the defects/complaints/inspection screens. */
  | "defects.view"
  /** Open a new defect and set its deadline. */
  | "defects.create"
  /** Assign a defect to a site supervisor. */
  | "defects.assign"
  /** Move a defect along as the party doing the work (contractor side). */
  | "defects.work"
  /** Accept or reject the contractor's proof of fix, and close the defect. */
  | "defects.verify"
  /** Lodge an appeal against a deduction (§826). */
  | "defects.appeal"
  /** Rule on an appeal — final per §826. */
  | "defects.decideAppeal"
  /** Record and handle resident complaints. */
  | "complaints.manage"
  /** Plan and run the daily inspection rounds. */
  | "inspections.manage"
  /** See and export operational reports (money figures inside them still gate on finance.view). */
  | "reports.view"
  /** Fill in the field survey and edit a street's cleaning profile (§1, §3). */
  | "profiles.edit"
  /** Create and maintain water refill and waste disposal points (§4, §5). */
  | "servicePoints.manage"
  /** Change scoring weights, route cost weights and learning thresholds (§2, §11). */
  | "routing.configure"
  /** Open a shift and report execution from the field (§7, §8). */
  | "field.report"
  /** Review what the learning layer changed, and void a bad sample (§17). */
  | "learning.review"
  /** Seed and delete the demo dataset (§19). */
  | "demo.manage";

/**
 * MANAGER predates the tender roles and no account uses it, but older route
 * handlers still check for it, so it is kept as an alias of DEPT_MANAGER.
 */
const DEPT_MANAGER_PERMISSIONS: Permission[] = [
  "sources.view",
  "sources.verify",
  "zones.editBoundary",
  "segments.override",
  "streets.edit",
  "resources.edit",
  "resources.transfer",
  "quota.approveExcess",
  "plans.edit",
  "plans.publish",
  "workers.viewPersonal",
  "defects.view",
  "defects.create",
  "defects.assign",
  "defects.verify",
  // §826 puts the appeal ruling with the department head.
  "defects.decideAppeal",
  "complaints.manage",
  "inspections.manage",
  "reports.view",
  // The מנהל עבודה is the person the survey and the profile are built around —
  // §18 puts rating streets, managing water points and fixing access problems
  // squarely with him.
  "profiles.edit",
  "servicePoints.manage",
  "field.report",
  "learning.review",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    "finance.view",
    "finance.approveDeduction",
    "finance.export",
    "sources.view",
    "sources.verify",
    "zones.assignContractArea",
    "zones.editBoundary",
    "segments.override",
    "streets.edit",
    "resources.edit",
    "resources.transfer",
    "quota.approveExcess",
    "plans.edit",
    "plans.publish",
    "workers.viewPersonal",
    "users.manage",
    "data.delete",
    "defects.view",
    "defects.create",
    "defects.assign",
    "defects.work",
    "defects.verify",
    "defects.appeal",
    "defects.decideAppeal",
    "complaints.manage",
    "inspections.manage",
    "reports.view",
    "profiles.edit",
    "servicePoints.manage",
    "routing.configure",
    "field.report",
    "learning.review",
    "demo.manage",
  ],

  CITY_MANAGER: [
    "finance.view",
    "finance.approveDeduction",
    "finance.export",
    "sources.view",
    "sources.verify",
    // Deciding which zone belongs to which contractor is a contractual call,
    // so it sits with the city manager and the admin only.
    "zones.assignContractArea",
    "zones.editBoundary",
    "segments.override",
    "streets.edit",
    "resources.edit",
    "resources.transfer",
    "quota.approveExcess",
    "plans.edit",
    "plans.publish",
    "workers.viewPersonal",
    "defects.view",
    "defects.create",
    "defects.assign",
    "defects.verify",
    "defects.decideAppeal",
    "complaints.manage",
    "inspections.manage",
    "reports.view",
    "profiles.edit",
    "servicePoints.manage",
    // Changing the weights changes every recommendation the city sees, so it
    // sits with the city manager and the admin only — same reasoning as
    // zones.assignContractArea above.
    "routing.configure",
    "learning.review",
  ],

  DEPT_MANAGER: DEPT_MANAGER_PERMISSIONS,
  MANAGER: DEPT_MANAGER_PERMISSIONS,

  // The מר"ת of §495: opens defects in the field and accepts the fix, but does
  // not rule on appeals against his own findings.
  INSPECTOR: [
    "sources.view",
    "plans.edit",
    "workers.viewPersonal",
    "defects.view",
    "defects.create",
    "defects.assign",
    "defects.verify",
    "complaints.manage",
    "inspections.manage",
    "reports.view",
    // The inspector walks the ground twice a day (§561) and is best placed to
    // rate a street and flag a broken water point — but not to change the
    // weights that turn those ratings into a plan.
    "profiles.edit",
    "servicePoints.manage",
  ],

  // A contractor sees their own operation but no prices and no other
  // contractor's data (scoping to their own areas is enforced per query).
  // They do the fixing and may appeal a deduction, but never accept their own
  // proof or rule on their own appeal.
  CONTRACTOR_MANAGER: [
    "plans.edit",
    "workers.viewPersonal",
    "defects.view",
    "defects.create",
    "defects.work",
    "defects.appeal",
    "reports.view",
    "field.report",
  ],

  SITE_SUPERVISOR: [
    "workers.viewPersonal",
    "defects.view",
    "defects.work",
    "reports.view",
    "profiles.edit",
    "servicePoints.manage",
    "field.report",
  ],

  // A driver still has no dashboard and no edit rights anywhere — the one thing
  // he may do is report what he did, from /my-day. Without this the shift and
  // execution forms of §7/§8 would be unreachable by the only people who fill
  // them in.
  EMPLOYEE: ["field.report"],

  // A read-only role still needs to be able to open reports — that is the
  // point of "צפייה בלבד". It gets no edit permissions anywhere else.
  VIEWER: ["reports.view"],

  FINANCE: ["finance.view", "finance.export", "sources.view", "defects.view", "reports.view"],
};

export function can(role: string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as Role];
  return perms ? perms.includes(permission) : false;
}

/** True when the role may reach the manager dashboard at all. */
export function canAccessDashboard(role: string | undefined | null): boolean {
  return !!role && role !== "EMPLOYEE";
}

/** Roles that see only their own daily assignment, not the dashboard. */
export function isFieldOnlyRole(role: string | undefined | null): boolean {
  return role === "EMPLOYEE";
}

/** Nav entries a role may see, used to build the sidebar. */
export function canSeeNav(role: string | undefined | null, href: string): boolean {
  if (!canAccessDashboard(role)) return false;
  if (href === "/sources") return can(role, "sources.view");
  if (href === "/users") return can(role, "users.manage");
  if (href === "/defects" || href === "/inspections") return can(role, "defects.view");
  if (href === "/complaints") return can(role, "complaints.manage");
  if (href === "/survey") return can(role, "profiles.edit");
  if (href === "/service-points") return can(role, "servicePoints.manage");
  if (href === "/learning") return can(role, "learning.review");
  if (href === "/settings") return can(role, "routing.configure");
  // FINANCE is a reporting role: it gets money and provenance, not operations.
  if (role === "FINANCE") return ["/", "/reports", "/sources", "/defects"].includes(href);
  // The contractor side gets the defect queue and its own plans, not the
  // municipality's zone administration or source verification.
  if (role === "CONTRACTOR_MANAGER" || role === "SITE_SUPERVISOR") {
    return ["/", "/defects", "/plans", "/plans/weekly", "/reports", "/survey", "/service-points"].includes(href);
  }
  return true;
}
