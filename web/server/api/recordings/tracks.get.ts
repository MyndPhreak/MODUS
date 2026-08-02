/** List tracks for a recording. */
import { getRecordingRepo } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

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

  // Resolve the owning guild from the recording so we can gate on it — the
  // caller must manage the guild that owns this recording.
  const recording = await repo.getById(recordingId);
  if (!recording) {
    throw createError({ statusCode: 404, statusMessage: "Recording not found." });
  }
  await requireGuildManager(event, recording.guild_id);

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
