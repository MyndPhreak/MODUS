/**
 * Generate a short MP3 preview from Kokoro for the voice picker.
 * Body: { voiceId?: string, text?: string }
 */
import { requireAuthedUserId } from "../../utils/session";
import { KOKORO_VOICES } from "../../../app/utils/ttsVoices";

const MAX_TEXT_LEN = 300;
const DEFAULT_SAMPLE =
  "Recording has started. All audio is being captured.";

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const baseUrl = process.env.KOKORO_BASE_URL;
  if (!baseUrl) {
    throw createError({
      statusCode: 503,
      statusMessage: "Voice preview unavailable (KOKORO_BASE_URL not set).",
    });
  }

  const body = await readBody<{ voiceId?: string; text?: string }>(event);
  const voiceId = body?.voiceId?.trim() || "";
  const rawText = (body?.text ?? "").trim().slice(0, MAX_TEXT_LEN);
  const text = (rawText || DEFAULT_SAMPLE).replace(
    /\{channel\}/g,
    "your voice channel",
  );

  const selected = Object.values(KOKORO_VOICES).find((v) => v.id === voiceId);
  const apiVoice =
    selected?.apiVoice || process.env.KOKORO_VOICE || "af_bella";
  const speed = selected?.speed ?? Number(process.env.KOKORO_SPEED ?? "1.0");
  const model = process.env.KOKORO_MODEL ?? "kokoro";
  const apiKey = process.env.KOKORO_API_KEY;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        voice: apiVoice,
        input: text,
        speed,
        response_format: "mp3",
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw createError({
        statusCode: 502,
        statusMessage: `Kokoro returned ${response.status}: ${detail.slice(0, 200)}`,
      });
    }

    const buf = Buffer.from(await response.arrayBuffer());
    setResponseHeader(event, "Content-Type", "audio/mpeg");
    setResponseHeader(event, "Cache-Control", "no-store");
    return buf;
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error("[preview-voice] failed:", err?.message || err);
    throw createError({
      statusCode: 502,
      statusMessage:
        err?.name === "AbortError"
          ? "Voice preview timed out."
          : "Voice preview failed.",
    });
  } finally {
    clearTimeout(timeout);
  }
});
