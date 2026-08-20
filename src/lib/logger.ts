import pino from "pino";

/**
 * §IMP-08 — structured logging, replacing ad-hoc `console.log`/`console.error`.
 * JSON output in every environment (no pino-pretty dependency) so platform
 * log aggregators (Vercel, etc.) can parse it directly; readability in local
 * dev is a smaller cost than adding a formatting dependency for a young app.
 *
 * This introduces the logger and converts the highest-traffic server error
 * paths — it does not replace every console.* call in the codebase in one
 * pass; do that incrementally as those call sites are touched anyway.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined, // omit pid/hostname — noise in a serverless/edge context
});
