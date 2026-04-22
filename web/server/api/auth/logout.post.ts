/**
 * Clear the user session.
 */
import { clearNativeSession } from "../../utils/session";

export default defineEventHandler(async (event) => {
  await clearNativeSession(event);
  return { success: true };
});
