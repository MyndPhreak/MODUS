/**
 * Safe settings validation utility.
 *
 * `parseSettings(schema, rawData, moduleName)` runs `safeParse`:
 *   - ✅ Success → returns the validated, fully-typed object.
 *   - ❌ Failure → logs a structured warning and returns `undefined`,
 *     letting the caller fall back to defaults or reject the data.
 *
 * This replaces the unsafe `{ ...DEFAULT, ...saved }` pattern that could
 * silently accept wrong types (e.g. string where number is expected).
 */

import type * as z from "zod";

/**
 * Safely parse raw settings data against a Zod schema.
 *
 * @param schema  - The Zod schema to validate against
 * @param raw     - The raw data from Appwrite (may be `null` / `undefined`)
 * @param module  - Human-readable module name for log messages
 * @param guildId - Optional guild ID for contextual logging
 * @returns The parsed settings if valid, or `undefined` on failure.
 */
export function parseSettings<T extends z.ZodType>(
  schema: T,
  raw: unknown,
  module: string,
  guildId?: string,
): z.output<T> | undefined {
  // Treat null/undefined as empty object so defaults kick in
  const data = raw ?? {};

  const result = schema.safeParse(data);

  if (result.success) {
    return result.data as z.output<T>;
  }

  // Structured warning — never crash the bot
  const ctx = guildId ? ` [guild=${guildId}]` : "";
  console.warn(
    `[Validation]${ctx} Invalid "${module}" settings — falling back to defaults. Issues:`,
    result.error.issues.map((i: any) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  );

  return undefined;
}
