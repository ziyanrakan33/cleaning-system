/**
 * §SEC-01/SEC-02 — contract-area scoping for contractor-side accounts.
 *
 * There are exactly two ContractAreas (one per winning contractor) and they
 * must never see each other's defects, complaints, inspections, reports or
 * plans — this is contractual confidentiality between two competing
 * companies, not a general permissions question (that's `can()` in
 * permissions.ts). A CONTRACTOR_MANAGER/SITE_SUPERVISOR account with no
 * contractAreaId assigned yet must see NOTHING, never everything: an
 * unassigned account defaulting to full visibility would be worse than the
 * gap this closes.
 */

const SCOPED_ROLES = new Set(["CONTRACTOR_MANAGER", "SITE_SUPERVISOR"]);

export type ScopedSessionUser = { role: string; contractAreaId?: string | null };

export type ContractAreaScope =
  | { restricted: false }
  | { restricted: true; contractAreaId: string | null };

/** Whether this role is restricted to a single contract area at all. */
export function resolveContractAreaScope(user: ScopedSessionUser): ContractAreaScope {
  if (!SCOPED_ROLES.has(user.role)) return { restricted: false };
  return { restricted: true, contractAreaId: user.contractAreaId ?? null };
}

/**
 * Merges a caller-supplied `contractAreaId` query filter with the caller's
 * own scope. A scoped user can never widen their own scope or redirect a
 * query at another contract area by simply passing a different id.
 *
 * Returns:
 *  - `undefined` — unrestricted role; use the caller's filter as-is (or none).
 *  - a string — the contract area id every query must be filtered to.
 *  - `"NONE"` — this caller must see zero rows (unassigned, or asked for
 *    another contractor's area). Callers should short-circuit to an empty
 *    result rather than querying with an impossible id.
 */
export function scopedContractAreaId(
  user: ScopedSessionUser,
  requested?: string | null
): string | "NONE" | undefined {
  const scope = resolveContractAreaScope(user);
  if (!scope.restricted) return requested ?? undefined;
  if (!scope.contractAreaId) return "NONE";
  if (requested && requested !== scope.contractAreaId) return "NONE";
  return scope.contractAreaId;
}

/**
 * Single-record IDOR guard: may this caller read/act on a record that
 * belongs to `recordContractAreaId` (null when the record has no contract
 * area yet — visible to everyone, since it isn't attributed to a contractor)?
 */
export function canAccessContractArea(
  user: ScopedSessionUser,
  recordContractAreaId: string | null | undefined
): boolean {
  const scope = resolveContractAreaScope(user);
  if (!scope.restricted) return true;
  if (!recordContractAreaId) return true;
  return scope.contractAreaId === recordContractAreaId;
}
