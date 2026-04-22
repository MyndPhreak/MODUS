/**
 * AlertsWorker — Social Alerts polling engine.
 *
 * Runs in the ShardingManager process (sharding.ts), NOT inside any shard.
 * This means it executes exactly once regardless of shard count, eliminating
 * duplicate-notification races.
 *
 * Supported platforms:
 *   - youtube  → public Atom feed (no API key needed)
 *   - rss      → any RSS 2.0 / Atom feed URL
 *   - github   → GitHub Releases Atom feed (no auth for public repos)
 *   - twitch   → EventSub webhooks (stream.online / stream.offline)
 *
 * State persistence:
 *   Last-seen item IDs are written to Appwrite via DatabaseService.setAlertsState,
 *   keyed as `${platform}:${handle}` per guild.
 */

import https from "https";
import http from "http";
import crypto from "crypto";
import { DatabaseService } from "./DatabaseService";

// ── Types ──────────────────────────────────────────────────────────────────

interface SocialAlert {
  platform: "youtube" | "rss" | "github" | "twitch" | string;
  handle: string;    // channelId for youtube, URL for rss, owner/repo for github, login for twitch
  channelId: string; // Discord channel ID
  message?: string;  // Optional custom ping message
}

interface PollResult {
  newItemId: string;
  embed: DiscordEmbed;
  content?: string;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  color: number;
  thumbnail?: { url: string };
  timestamp?: string;
  footer?: { text: string };
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function fetchText(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "MODUS-AlertsWorker/1.0",
        ...extraHeaders,
      },
    };

    const req = lib.request(options, (res) => {
      // Follow one redirect
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location, extraHeaders).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error("Request timed out"));
    });
    req.end();
  });
}

function postJson(url: string, body: any, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const payload = JSON.stringify(body);
    const lib = parsedUrl.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "MODUS-AlertsWorker/1.0",
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Minimal XML parser ─────────────────────────────────────────────────────

/** Extract the text content of the first matching XML tag (non-nested). */
function xmlFirst(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1").trim() : "";
}

/** Extract all occurrences of an XML block. */
function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[0]);
  }
  return results;
}

// ── Platform pollers ───────────────────────────────────────────────────────

/**
 * YouTube Atom feed — no API key needed.
 * Feed URL: https://www.youtube.com/feeds/videos.xml?channel_id=UC...
 * The `handle` field must be a channel_id (starting with UC).
 */
async function pollYouTube(alert: SocialAlert, lastSeenId: string): Promise<PollResult | null> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(alert.handle)}`;
  let xml: string;
  try {
    xml = await fetchText(feedUrl);
  } catch (err) {
    console.warn(`[Alerts/YouTube] Failed to fetch feed for ${alert.handle}:`, (err as Error).message);
    return null;
  }

  const entries = xmlAll(xml, "entry");
  if (entries.length === 0) return null;

  const latest = entries[0];
  const videoId = xmlFirst(latest, "yt:videoId");
  if (!videoId || videoId === lastSeenId) return null;

  const title = xmlFirst(latest, "title");
  const author = xmlFirst(latest, "name") || alert.handle;
  const published = xmlFirst(latest, "published");
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return {
    newItemId: videoId,
    embed: {
      title: `▶️ ${author} uploaded a new video`,
      description: `**[${title}](${videoUrl})**`,
      url: videoUrl,
      color: 0xff0000,
      thumbnail: { url: thumb },
      timestamp: published || new Date().toISOString(),
      footer: { text: "YouTube" },
    },
  };
}

/**
 * Generic RSS 2.0 / Atom feed poller.
 * The `handle` is the full feed URL.
 */
async function pollRSS(alert: SocialAlert, lastSeenId: string): Promise<PollResult | null> {
  let xml: string;
  try {
    xml = await fetchText(alert.handle);
  } catch (err) {
    console.warn(`[Alerts/RSS] Failed to fetch feed ${alert.handle}:`, (err as Error).message);
    return null;
  }

  // Support both RSS <item> and Atom <entry>
  const items = xmlAll(xml, "item").length > 0 ? xmlAll(xml, "item") : xmlAll(xml, "entry");
  if (items.length === 0) return null;

  const latest = items[0];
  // id: use <guid> (RSS) or <id> (Atom)
  const itemId =
    xmlFirst(latest, "guid") ||
    xmlFirst(latest, "id") ||
    xmlFirst(latest, "link") ||
    "";
  if (!itemId || itemId === lastSeenId) return null;

  const title = xmlFirst(latest, "title") || "New post";
  const link = xmlFirst(latest, "link") || alert.handle;
  const pubDate = xmlFirst(latest, "pubDate") || xmlFirst(latest, "published") || "";
  const feedTitle = xmlFirst(xml, "title") || "RSS Feed";

  return {
    newItemId: itemId,
    embed: {
      title: `📡 ${feedTitle}`,
      description: `**[${title}](${link})**`,
      url: link,
      color: 0xf97316,
      timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      footer: { text: "RSS Feed" },
    },
  };
}

/**
 * GitHub Releases Atom feed — no auth needed for public repos.
 * The `handle` is `owner/repo` (e.g. `discord/discord-api-docs`).
 */
async function pollGitHub(alert: SocialAlert, lastSeenId: string): Promise<PollResult | null> {
  const feedUrl = `https://github.com/${alert.handle}/releases.atom`;
  let xml: string;
  try {
    xml = await fetchText(feedUrl);
  } catch (err) {
    console.warn(`[Alerts/GitHub] Failed to fetch releases for ${alert.handle}:`, (err as Error).message);
    return null;
  }

  const entries = xmlAll(xml, "entry");
  if (entries.length === 0) return null;

  const latest = entries[0];
  const entryId = xmlFirst(latest, "id");
  if (!entryId || entryId === lastSeenId) return null;

  const title = xmlFirst(latest, "title") || "New release";
  const linkMatch = latest.match(/href="([^"]+)"/);
  const releaseUrl = linkMatch ? linkMatch[1] : `https://github.com/${alert.handle}/releases`;
  const updated = xmlFirst(latest, "updated");

  return {
    newItemId: entryId,
    embed: {
      title: `🐙 ${alert.handle} — ${title}`,
      description: `A new release is available: **[${title}](${releaseUrl})**`,
      url: releaseUrl,
      color: 0x238636,
      timestamp: updated || new Date().toISOString(),
      footer: { text: "GitHub Releases" },
    },
  };
}

// ── Discord REST message sender ────────────────────────────────────────────

async function sendDiscordMessage(
  channelId: string,
  embed: DiscordEmbed,
  content?: string,
): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("[Alerts] DISCORD_TOKEN not set — cannot send message");
    return;
  }

  const body: Record<string, any> = { embeds: [embed] };
  if (content) body.content = content;

  try {
    const result = await postJson(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      body,
      { Authorization: `Bot ${token}` },
    );
    if (result.status >= 400) {
      console.warn(`[Alerts] Discord API error ${result.status} for channel ${channelId}:`, result.body);
    }
  } catch (err) {
    console.error(`[Alerts] Failed to post to channel ${channelId}:`, (err as Error).message);
  }
}

// ── Twitch EventSub ────────────────────────────────────────────────────────

interface TwitchTokenCache {
  token: string;
  expiresAt: number;
}

let twitchTokenCache: TwitchTokenCache | null = null;

async function getTwitchAppToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (twitchTokenCache && Date.now() < twitchTokenCache.expiresAt) {
    return twitchTokenCache.token;
  }

  try {
    const result = await postJson(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      {},
    );
    const data = JSON.parse(result.body);
    if (!data.access_token) {
      console.warn("[Alerts/Twitch] Failed to get app token:", result.body);
      return null;
    }
    twitchTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000, // 5m buffer
    };
    return data.access_token;
  } catch (err) {
    console.error("[Alerts/Twitch] Token fetch error:", (err as Error).message);
    return null;
  }
}

async function twitchApiGet(path: string, token: string): Promise<any> {
  const clientId = process.env.TWITCH_CLIENT_ID!;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.twitch.tv",
        path,
        method: "GET",
        headers: {
          "Client-Id": clientId,
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ data: [] });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** Resolve a Twitch login name to a broadcaster_id. */
async function resolveTwitchUserId(login: string, token: string): Promise<string | null> {
  try {
    const data = await twitchApiGet(
      `/helix/users?login=${encodeURIComponent(login)}`,
      token,
    );
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** List all active EventSub subscriptions for this app. */
async function listEventSubSubscriptions(token: string): Promise<any[]> {
  try {
    const data = await twitchApiGet("/helix/eventsub/subscriptions", token);
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Subscribe to `stream.online` and `stream.offline` for a Twitch broadcaster.
 * The callback URL is `https://modus-bot.ppo.gg/webhooks/alerts/twitch`.
 * The shared secret is used by WebhookRouter to verify Twitch HMAC signatures.
 */
async function subscribeTwitchEventSub(
  broadcasterId: string,
  eventType: "stream.online" | "stream.offline",
  token: string,
): Promise<void> {
  const publicUrl = process.env.BOT_PUBLIC_URL || "https://modus-bot.ppo.gg";
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) {
    console.warn("[Alerts/Twitch] TWITCH_EVENTSUB_SECRET not set — skipping subscription");
    return;
  }

  try {
    const result = await postJson(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        type: eventType,
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
        transport: {
          method: "webhook",
          callback: `${publicUrl}/webhooks/alerts/twitch`,
          secret,
        },
      },
      {
        "Client-Id": process.env.TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
      },
    );

    if (result.status === 202) {
      console.log(`[Alerts/Twitch] Subscribed to ${eventType} for broadcaster ${broadcasterId}`);
    } else {
      const body = JSON.parse(result.body);
      // 409 = subscription already exists — that's fine
      if (result.status !== 409) {
        console.warn(`[Alerts/Twitch] EventSub subscribe failed (${result.status}):`, body?.message);
      }
    }
  } catch (err) {
    console.error("[Alerts/Twitch] Subscribe error:", (err as Error).message);
  }
}

// ── Main worker class ──────────────────────────────────────────────────────

export class AlertsWorker {
  private appwrite: DatabaseService;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  /** Track which Twitch broadcasterIds we've already subscribed for this session. */
  private twitchSubscribed = new Set<string>();

  constructor(appwrite: DatabaseService, pollIntervalMinutes = 10) {
    this.appwrite = appwrite;
    this.intervalMs = pollIntervalMinutes * 60 * 1000;
  }

  start(): void {
    console.log("[Alerts] Worker starting — polling every", this.intervalMs / 60000, "minutes");
    // Run immediately, then on interval
    this.runCycle().catch((err) =>
      console.error("[Alerts] Error in initial poll cycle:", err),
    );
    this.timer = setInterval(() => {
      this.runCycle().catch((err) =>
        console.error("[Alerts] Error in poll cycle:", err),
      );
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCycle(): Promise<void> {
    const allConfigs = await this.appwrite.getAllAlertsConfigs();
    if (allConfigs.length === 0) return;

    console.log(`[Alerts] Poll cycle — ${allConfigs.length} guild(s) with active alerts`);

    for (const { guildId, alerts } of allConfigs) {
      await this.processGuild(guildId, alerts);
    }
  }

  private async processGuild(guildId: string, alerts: SocialAlert[]): Promise<void> {
    const state = await this.appwrite.getAlertsState(guildId);
    let stateChanged = false;

    for (const alert of alerts) {
      const stateKey = `${alert.platform}:${alert.handle}`;
      const lastSeenId = state[stateKey] || "";

      try {
        let result: PollResult | null = null;

        switch (alert.platform) {
          case "youtube":
            result = await pollYouTube(alert, lastSeenId);
            break;
          case "rss":
            result = await pollRSS(alert, lastSeenId);
            break;
          case "github":
            result = await pollGitHub(alert, lastSeenId);
            break;
          case "twitch":
            await this.ensureTwitchSubscription(alert);
            // Twitch is push-based — no polling here
            continue;
          default:
            // Unknown platform — skip silently
            continue;
        }

        if (result) {
          await sendDiscordMessage(alert.channelId, result.embed, alert.message);
          state[stateKey] = result.newItemId;
          stateChanged = true;
          console.log(
            `[Alerts] Sent ${alert.platform} alert for ${alert.handle} → channel ${alert.channelId} (guild ${guildId})`,
          );
        }
      } catch (err) {
        console.error(
          `[Alerts] Error processing ${alert.platform}:${alert.handle} for guild ${guildId}:`,
          (err as Error).message,
        );
      }
    }

    if (stateChanged) {
      await this.appwrite.setAlertsState(guildId, state);
    }
  }

  /**
   * Ensures Twitch EventSub subscriptions exist for a Twitch alert.
   * Subscriptions persist on Twitch's side across restarts; we only need to
   * call this once per broadcaster per worker session.
   */
  private async ensureTwitchSubscription(alert: SocialAlert): Promise<void> {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    const secret = process.env.TWITCH_EVENTSUB_SECRET;

    if (!clientId || !clientSecret || !secret) {
      // Twitch not configured — silently skip
      return;
    }

    const login = alert.handle.toLowerCase();
    if (this.twitchSubscribed.has(login)) return;

    const token = await getTwitchAppToken();
    if (!token) return;

    const broadcasterId = await resolveTwitchUserId(login, token);
    if (!broadcasterId) {
      console.warn(`[Alerts/Twitch] Could not resolve broadcaster ID for: ${login}`);
      return;
    }

    // Only subscribe if not already active on Twitch's side
    const existing = await listEventSubSubscriptions(token);
    const hasOnline = existing.some(
      (s) =>
        s.type === "stream.online" &&
        s.condition?.broadcaster_user_id === broadcasterId &&
        s.status === "enabled",
    );
    const hasOffline = existing.some(
      (s) =>
        s.type === "stream.offline" &&
        s.condition?.broadcaster_user_id === broadcasterId &&
        s.status === "enabled",
    );

    if (!hasOnline) await subscribeTwitchEventSub(broadcasterId, "stream.online", token);
    if (!hasOffline) await subscribeTwitchEventSub(broadcasterId, "stream.offline", token);

    this.twitchSubscribed.add(login);
  }
}
