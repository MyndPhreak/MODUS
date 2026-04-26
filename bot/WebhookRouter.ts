/**
 * WebhookRouter — HTTP endpoint for receiving external webhook events.
 *
 * Registers `POST /webhooks/trigger/:secret` on the bot's existing HTTP
 * server (same pattern as MusicAPI.ts — intercepts before fallback).
 *
 * Provider handlers parse incoming payloads into Discord embeds and post
 * them to the configured channel.
 */

import http from "http";
import https from "https";
import crypto from "crypto";
import { URL } from "url";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { DatabaseService } from "./DatabaseService";

// ── Helpers ────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function resolveNestedPath(data: Record<string, any>, path: string): any {
  if (path in data) return data[path];
  const keys = path.split(".");
  let value: any = data;
  for (const key of keys) {
    if (value == null || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}

/**
 * Resolve `{dot.path}` placeholders against a nested object.
 * E.g. `{pull_request.title}` in body `{ pull_request: { title: "Fix" } }` → "Fix"
 */
function resolvePlaceholders(
  template: string,
  data: Record<string, any>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, path) => {
    const val = resolveNestedPath(data, path);
    return val != null ? String(val) : match;
  });
}

/**
 * Evaluate JSON filters against flattened payload data.
 * Supports exact matches and wildcard string matches (e.g. `*error*`).
 */
function evaluateFilters(filtersJson: string | null | undefined, data: any): boolean {
  if (!filtersJson) return true;
  try {
    const filters = JSON.parse(filtersJson);
    for (const [key, expected] of Object.entries(filters)) {
      const actual = resolveNestedPath(data, key);
      
      let match = false;
      if (actual === expected) {
        match = true;
      } else if (typeof actual === "string" && typeof expected === "string") {
        const expectedLower = expected.toLowerCase();
        const actualLower = actual.toLowerCase();
        if (expectedLower.startsWith("*") && expectedLower.endsWith("*")) {
          match = actualLower.includes(expectedLower.slice(1, -1));
        } else if (expectedLower.startsWith("*")) {
          match = actualLower.endsWith(expectedLower.slice(1));
        } else if (expectedLower.endsWith("*")) {
          match = actualLower.startsWith(expectedLower.slice(0, -1));
        }
      }
      
      if (!match) return false;
    }
    return true;
  } catch {
    // If filter JSON is invalid, default to passing (or fail, but passing avoids lockouts)
    return true;
  }
}

// ── Provider Handlers ──────────────────────────────────────────────

interface ProviderResult {
  skip: boolean;
  embed: EmbedBuilder | null;
}

/** Maps raw body + headers into placeholder-friendly flat structures */
function flattenGitHub(body: any): Record<string, any> {
  return {
    ...body,
    // Pull request / issue aliases
    "pr.title": body.pull_request?.title ?? body.issue?.title ?? "",
    "pr.url": body.pull_request?.html_url ?? body.issue?.html_url ?? "",
    "pr.author": body.pull_request?.user?.login ?? body.sender?.login ?? "",
    "pr.number": body.pull_request?.number ?? body.issue?.number ?? "",
    "pr.state": body.pull_request?.state ?? body.action ?? "",
    "pr.merged": body.pull_request?.merged ?? false,
    // Release aliases
    "release.title": body.release?.name ?? body.release?.tag_name ?? "",
    "release.url": body.release?.html_url ?? "",
    "release.tag": body.release?.tag_name ?? "",
    "release.body": body.release?.body ?? "",
    "release.author": body.release?.author?.login ?? body.sender?.login ?? "",
    "release.prerelease": body.release?.prerelease ? "pre-release" : "release",
    // Push aliases
    "push.branch": (body.ref ?? "").replace("refs/heads/", ""),
    "push.commits": String(body.commits?.length ?? 0),
    "push.compare": body.compare ?? "",
    // Repository + sender
    "repo.name": body.repository?.full_name ?? "",
    "repo.url": body.repository?.html_url ?? "",
    "sender.login": body.sender?.login ?? "",
    "sender.avatar": body.sender?.avatar_url ?? "",
  };
}

function flattenTwitch(body: any): Record<string, any> {
  const sub = body.subscription ?? {};
  const event = body.event ?? {};
  return {
    ...body,
    "stream.user":
      event.broadcaster_user_name ?? event.broadcaster_user_login ?? "",
    "stream.title": event.title ?? "",
    "stream.game": event.category_name ?? "",
    "stream.type": sub.type ?? "",
    "stream.started_at": event.started_at ?? "",
  };
}

/** Returns the default embed title/description for each GitHub event type. */
function githubEventDefaults(
  ghEvent: string | undefined,
  action: string | undefined,
  merged?: boolean,
): { title: string; description: string; color: number } {
  switch (ghEvent) {
    case "release":
      return {
        title: "🚀 {repo.name} — {release.title}",
        description:
          "**[{release.tag}]({release.url})** by **{release.author}** · _{release.prerelease}_\n\n{release.body}",
        color: 0x238636,
      };
    case "pull_request":
      return {
        title: "🐙 GitHub — {pr.title}",
        description:
          "[#{pr.number}]({pr.url}) in **{repo.name}** by **{pr.author}** · state: `{pr.state}`",
        color: action === "closed" && merged ? 0x8957e5 : 0x238636,
      };
    case "issues":
      return {
        title: "🐙 GitHub Issue — {pr.title}",
        description:
          "[#{pr.number}]({pr.url}) in **{repo.name}** by **{sender.login}**",
        color: 0xe3b341,
      };
    case "push":
      return {
        title: "📦 {repo.name} — push to `{push.branch}`",
        description:
          "**{push.commits}** commit(s) · [compare]({push.compare}) by **{sender.login}**",
        color: 0x1f6feb,
      };
    default:
      return {
        title: "🐙 GitHub — {repo.name}",
        description: "Event: `{action}` by **{sender.login}**",
        color: 0x238636,
      };
  }
}

function handleGitHub(
  trigger: any,
  body: any,
  headers: http.IncomingHttpHeaders,
): ProviderResult {
  const flat = flattenGitHub(body);
  const ghEvent = headers["x-github-event"] as string | undefined;

  // Apply filters
  if (!evaluateFilters(trigger.filters, flat)) {
    return { skip: true, embed: null };
  }

  // Resolve embed template: use stored template if present, otherwise pick
  // event-appropriate defaults so the embed is always populated correctly.
  const defaults = githubEventDefaults(
    ghEvent,
    body.action,
    body.pull_request?.merged ?? false,
  );
  let title = defaults.title;
  let description = defaults.description;
  let color = defaults.color;

  if (trigger.embed_template) {
    try {
      const tmpl = JSON.parse(trigger.embed_template);
      if (tmpl.title) title = tmpl.title;
      if (tmpl.description) description = tmpl.description;
      if (tmpl.color) color = tmpl.color;
    } catch {}
  }

  // Truncate release body so the changelog doesn't overflow Discord's 4096 limit.
  // We keep room for the header line (~120 chars) before the {release.body} expands.
  const resolvedDescription = resolvePlaceholders(description, flat);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(resolvePlaceholders(title, flat).slice(0, 256))
    .setDescription(resolvedDescription.slice(0, 4096))
    .setTimestamp();

  // Add sender avatar as thumbnail if available
  if (flat["sender.avatar"]) {
    embed.setThumbnail(flat["sender.avatar"]);
  }

  // Link the release / PR / commit directly in the embed URL (makes title clickable)
  const embedUrl =
    flat["release.url"] ||
    flat["pr.url"] ||
    flat["push.compare"] ||
    flat["repo.url"];
  if (embedUrl) {
    embed.setURL(embedUrl);
  }

  if (ghEvent) {
    embed.setFooter({ text: `Event: ${ghEvent} / ${body.action ?? "n/a"}` });
  }

  return { skip: false, embed };
}

function handleTwitch(
  trigger: any,
  body: any,
  _headers: http.IncomingHttpHeaders,
): ProviderResult {
  const flat = flattenTwitch(body);

  // Apply filters
  if (!evaluateFilters(trigger.filters, flat)) {
    return { skip: true, embed: null };
  }

  let title = "📺 Twitch — {stream.user}";
  let description =
    "**{stream.user}** went live: *{stream.title}*\nPlaying **{stream.game}**";
  let color = 0x9146ff;

  if (trigger.embed_template) {
    try {
      const tmpl = JSON.parse(trigger.embed_template);
      if (tmpl.title) title = tmpl.title;
      if (tmpl.description) description = tmpl.description;
      if (tmpl.color) color = tmpl.color;
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(resolvePlaceholders(title, flat).slice(0, 256))
    .setDescription(resolvePlaceholders(description, flat).slice(0, 4096))
    .setFooter({ text: `Type: ${flat["stream.type"]}` })
    .setTimestamp();

  return { skip: false, embed };
}

function handleGenericWebhook(
  trigger: any,
  body: any,
  _headers: http.IncomingHttpHeaders,
): ProviderResult {
  // Apply filters
  if (!evaluateFilters(trigger.filters, body)) {
    return { skip: true, embed: null };
  }

  let title = "🔔 Webhook Triggered";
  let description =
    "```json\n" + JSON.stringify(body, null, 2).slice(0, 3900) + "\n```";
  let color = 0x5865f2;

  if (trigger.embed_template) {
    try {
      const tmpl = JSON.parse(trigger.embed_template);
      if (tmpl.title) title = resolvePlaceholders(tmpl.title, body);
      if (tmpl.description)
        description = resolvePlaceholders(tmpl.description, body);
      if (tmpl.color) color = tmpl.color;
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title.slice(0, 256))
    .setDescription(description.slice(0, 4096))
    .setTimestamp();

  return { skip: false, embed };
}

// ── Router Registration ────────────────────────────────────────────

export function registerWebhookRoutes(
  server: http.Server,
  client: Client,
  databaseService: DatabaseService,
) {
  const originalHandler = server.listeners("request")[0] as Function;
  server.removeAllListeners("request");

  server.on(
    "request",
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`,
      );
      const pathname = url.pathname;

      // ── POST /webhooks/alerts/twitch ─────────────────────────────
      // Receives Twitch EventSub deliveries for the Social Alerts module.
      // Verifies HMAC, answers verification challenges, dispatches embeds.
      if (pathname === "/webhooks/alerts/twitch" && req.method === "POST") {
        // Buffer raw body first (HMAC must cover raw bytes)
        const rawBody = await new Promise<string>((resolve, reject) => {
          let buf = "";
          req.on("data", (c) => (buf += c));
          req.on("end", () => resolve(buf));
          req.on("error", reject);
        });

        // Verify Twitch HMAC signature
        const twitchSecret = process.env.TWITCH_EVENTSUB_SECRET;
        if (twitchSecret) {
          const msgId = (req.headers["twitch-eventsub-message-id"] as string) ?? "";
          const msgTs = (req.headers["twitch-eventsub-message-timestamp"] as string) ?? "";
          const sigHeader = (req.headers["twitch-eventsub-message-signature"] as string) ?? "";
          const expected =
            "sha256=" +
            crypto
              .createHmac("sha256", twitchSecret)
              .update(msgId + msgTs + rawBody)
              .digest("hex");
          if (sigHeader !== expected) {
            console.warn("[Alerts/Twitch] Invalid HMAC signature — rejecting");
            res.writeHead(403);
            res.end("Forbidden");
            return;
          }
        }

        let body: any;
        try {
          body = JSON.parse(rawBody);
        } catch {
          res.writeHead(400);
          res.end("Bad Request");
          return;
        }

        const msgType = req.headers["twitch-eventsub-message-type"] as string;

        // Verification challenge
        if (msgType === "webhook_callback_verification") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(body.challenge ?? "");
          console.log("[Alerts/Twitch] Answered EventSub verification challenge");
          return;
        }

        // Revocation
        if (msgType === "revocation") {
          console.warn(
            `[Alerts/Twitch] Subscription revoked: ${body.subscription?.type} (${body.subscription?.status})`,
          );
          res.writeHead(204);
          res.end();
          return;
        }

        // Event notification
        if (msgType === "notification") {
          res.writeHead(204);
          res.end();

          const event = body.event ?? {};
          const subType: string = body.subscription?.type ?? "";
          const broadcasterLogin: string = (event.broadcaster_user_login ?? "").toLowerCase();
          const broadcasterName: string = event.broadcaster_user_name ?? broadcasterLogin;

          try {
            const configs = await databaseService.getAllAlertsConfigs();
            for (const { guildId, alerts } of configs) {
              for (const alert of alerts) {
                if (
                  alert.platform === "twitch" &&
                  alert.handle.toLowerCase() === broadcasterLogin
                ) {
                  const isOnline = subType === "stream.online";
                  const embed = isOnline
                    ? {
                        title: `📺 ${broadcasterName} is live!`,
                        description:
                          `**${broadcasterName}** just went live on Twitch!` +
                          (event.title ? `\n\n🎮 *${event.title}*` : ""),
                        url: `https://twitch.tv/${broadcasterLogin}`,
                        color: 0x9146ff,
                        thumbnail: {
                          url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${broadcasterLogin}-320x180.jpg`,
                        },
                        timestamp: new Date().toISOString(),
                        footer: { text: "Twitch" },
                      }
                    : {
                        title: `📴 ${broadcasterName} ended their stream`,
                        description: `**${broadcasterName}** is no longer live on Twitch.`,
                        color: 0x6b7280,
                        timestamp: new Date().toISOString(),
                        footer: { text: "Twitch" },
                      };

                  const discordToken = process.env.DISCORD_TOKEN;
                  if (discordToken) {
                    const msgBody: any = { embeds: [embed] };
                    if (alert.message) msgBody.content = alert.message;
                    const payload = JSON.stringify(msgBody);

                    const req2 = https.request(
                      {
                        hostname: "discord.com",
                        path: `/api/v10/channels/${alert.channelId}/messages`,
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Content-Length": Buffer.byteLength(payload),
                          Authorization: `Bot ${discordToken}`,
                        },
                      },
                      (r: any) => {
                        let d = "";
                        r.on("data", (c: any) => (d += c));
                        r.on("end", () => {
                          if (r.statusCode >= 400) {
                            console.warn(
                              `[Alerts/Twitch] Discord error (${r.statusCode}) guild ${guildId}:`,
                              d,
                            );
                          } else {
                            console.log(
                              `[Alerts/Twitch] ${subType} → channel ${alert.channelId} (guild ${guildId})`,
                            );
                          }
                        });
                      },
                    );
                    req2.on("error", (e: Error) =>
                      console.error("[Alerts/Twitch] Discord request error:", e.message),
                    );
                    req2.write(payload);
                    req2.end();
                  }
                }
              }
            }
          } catch (err: any) {
            console.error("[Alerts/Twitch] Error dispatching event:", err.message);
          }
          return;
        }

        res.writeHead(204);
        res.end();
        return;
      }

      // ── POST /webhooks/trigger/:secret ───────────────────────────
      const triggerMatch = pathname.match(
        /^\/webhooks\/trigger\/([a-f0-9-]{36})$/i,
      );
      if (triggerMatch && req.method === "POST") {
        const secret = triggerMatch[1];

        try {
          const trigger = await databaseService.getTriggerBySecret(secret);

          if (!trigger) {
            console.warn(
              `[Webhooks] No trigger found for secret: ${secret.slice(0, 8)}...`,
            );
            return sendJson(res, 404, { error: "Trigger not found" });
          }

          if (!trigger.enabled) {
            console.warn(
              `[Webhooks] Trigger "${trigger.name}" is disabled, ignoring request`,
            );
            return sendJson(res, 404, { error: "Trigger not found" });
          }

          const body = await parseBody(req);

          // Handle Twitch verification challenge
          if (
            trigger.provider === "twitch" &&
            body.subscription?.type &&
            body.challenge
          ) {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(body.challenge);
            console.log(
              `[Webhooks] Twitch verification challenge answered for trigger "${trigger.name}"`,
            );
            return;
          }

          // Dispatch to provider handler
          let result: ProviderResult;
          switch (trigger.provider) {
            case "github":
              result = handleGitHub(trigger, body, req.headers);
              break;
            case "twitch":
              result = handleTwitch(trigger, body, req.headers);
              break;
            default:
              result = handleGenericWebhook(trigger, body, req.headers);
              break;
          }

          if (result.skip || !result.embed) {
            return sendJson(res, 200, {
              ok: true,
              action: "skipped",
              reason: "Filtered out",
            });
          }

          // Send to Discord channel
          const guild = client.guilds.cache.find(
            (g) => g.id === trigger.guild_id,
          );
          if (!guild) {
            return sendJson(res, 500, { error: "Guild not found" });
          }

          const channel = guild.channels.cache.get(trigger.channel_id);
          if (!channel || !(channel instanceof TextChannel)) {
            return sendJson(res, 500, { error: "Channel not found" });
          }

          await channel.send({ embeds: [result.embed] });

          console.log(
            `[Webhooks] Trigger "${trigger.name}" fired → #${channel.name} (${guild.name})`,
          );

          return sendJson(res, 200, { ok: true, action: "sent" });
        } catch (err: any) {
          console.error("[Webhooks] Error processing trigger:", err);
          return sendJson(res, 500, {
            error: err.message || "Internal error",
          });
        }
      }

      // Fallback: pass to previous handler chain (MusicAPI → health check)
      if (originalHandler) {
        (originalHandler as any)(req, res);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      }
    },
  );

  console.log("[Webhooks] Webhook trigger routes registered on HTTP server");
}
