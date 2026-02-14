interface BotHealthResponse {
  online: boolean;
  latency: number;
  error?: string;
}

export default defineEventHandler(async (): Promise<BotHealthResponse> => {
  const config = useRuntimeConfig();
  const botUrl = config.public.botUrl as string;

  if (!botUrl) {
    return { online: false, latency: 0, error: "BOT_URL not configured" };
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(botUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    return {
      online: response.ok,
      latency,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bot unreachable";
    return {
      online: false,
      latency: 0,
      error: message,
    };
  }
});
