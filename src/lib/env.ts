/**
 * Demo data (§19) must never be seedable by naming convention alone — this is
 * the one explicit gate every demo-seeding entry point checks before writing
 * anything. Set DEMO_MODE=true only in an environment where demo data is
 * actually wanted; leave it unset/false everywhere else, production included.
 */
export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}
