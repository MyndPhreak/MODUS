/** List tracks for a recording. */
import { getRecordingRepo } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const recordingId = query.recording_id as string;
  if (!recordingId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing recording_id query parameter.",
    });
  }

  const repo = getRecordingRepo();
  if (!repo) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    return await repo.listTracks(recordingId);
  } catch (error: any) {
    console.error(
      `[Recordings API] Postgres track list failed for ${recordingId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch recording tracks.",
    });
  }
});
