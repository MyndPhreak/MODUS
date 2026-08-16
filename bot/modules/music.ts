import { randomUUID } from "node:crypto";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  VoiceBasedChannel,
  User,
  TextBasedChannel,
  MessageFlags,
} from "discord.js";
import type { ModuleManager } from "../ModuleManager";
import type { BotModule } from "../ModuleManager";
import type { AiTool } from "../lib/aiTools";
import { buildV2Layout } from "../lib/components-v2";
import { activeSessions as recordingActiveSessions } from "./recording";
import { MusicSettingsSchema, type MusicSettings } from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";
import type { MusicRuntime } from "../music";
import type { MusicPlaybackEvent } from "../music/LavalinkEvents";
import type { MusicError } from "../music/errors";
import type {
  CanonicalTrack,
  MusicCommand,
  MusicFilters,
  MusicQueueEntry,
  MusicQueueSnapshot,
  MusicRepeatMode,
  MusicResult,
} from "../music/types";

// ─── Available Audio Filters ──────────────────────────────────────────────
//
// Lavalink applies filters server-side, so each effect is expressed as a
// Lavalink filter payload instead of an FFmpeg filter chain. Effects that
// FFmpeg rendered with time-varying chains (fade, normalization) have no
// Lavalink equivalent and map to the closest static approximation.

interface FilterDefinition {
  label: string;
  emoji: string;
  description: string;
  filters: MusicFilters;
}

const AVAILABLE_FILTERS: Record<string, FilterDefinition> = {
  bassboost: {
    label: "Bass Boost",
    emoji: "🔊",
    description: "Enhances low frequencies",
    filters: {
      equalizer: [
        { band: 0, gain: 0.25 },
        { band: 1, gain: 0.2 },
        { band: 2, gain: 0.15 },
        { band: 3, gain: 0.1 },
      ],
    },
  },
  bassboost_high: {
    label: "Bass Boost (Heavy)",
    emoji: "💥",
    description: "Extreme bass enhancement",
    filters: {
      equalizer: [
        { band: 0, gain: 0.6 },
        { band: 1, gain: 0.5 },
        { band: 2, gain: 0.4 },
        { band: 3, gain: 0.25 },
      ],
    },
  },
  nightcore: {
    label: "Nightcore",
    emoji: "🌙",
    description: "Higher pitch + faster tempo",
    filters: { timescale: { speed: 1.2, pitch: 1.2, rate: 1 } },
  },
  vaporwave: {
    label: "Vaporwave",
    emoji: "🌊",
    description: "Slowed down + lower pitch",
    filters: { timescale: { speed: 0.85, pitch: 0.85, rate: 1 } },
  },
  "8D": {
    label: "8D Audio",
    emoji: "🎧",
    description: "Rotating spatial audio effect",
    filters: { rotation: { rotationHz: 0.2 } },
  },
  karaoke: {
    label: "Karaoke",
    emoji: "🎤",
    description: "Reduces vocal frequencies",
    filters: { karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 } },
  },
  tremolo: {
    label: "Tremolo",
    emoji: "〰️",
    description: "Wavering volume effect",
    filters: { tremolo: { frequency: 4, depth: 0.75 } },
  },
  vibrato: {
    label: "Vibrato",
    emoji: "🎻",
    description: "Wavering pitch effect",
    filters: { vibrato: { frequency: 4, depth: 0.75 } },
  },
  lofi: {
    label: "Lo-Fi",
    emoji: "📻",
    description: "Warm, low-fidelity sound",
    filters: { lowPass: { smoothing: 20 } },
  },
  phaser: {
    label: "Phaser",
    emoji: "🔮",
    description: "Sweeping phase effect",
    filters: { rotation: { rotationHz: 0.1 } },
  },
  chorus: {
    label: "Chorus",
    emoji: "👥",
    description: "Rich, layered vocal effect",
    filters: { vibrato: { frequency: 2, depth: 0.3 } },
  },
  flanger: {
    label: "Flanger",
    emoji: "✨",
    description: "Jet-like sweeping effect",
    filters: { vibrato: { frequency: 0.5, depth: 0.5 } },
  },
  treble: {
    label: "Treble Boost",
    emoji: "🔔",
    description: "Enhances high frequencies",
    filters: {
      equalizer: [
        { band: 10, gain: 0.2 },
        { band: 11, gain: 0.25 },
        { band: 12, gain: 0.3 },
        { band: 13, gain: 0.3 },
      ],
    },
  },
  normalizer: {
    label: "Normalizer",
    emoji: "📊",
    description: "Levels out volume differences",
    filters: { volume: 0.95 },
  },
  fadein: {
    label: "Fade In",
    emoji: "🌅",
    description: "Gradually increases volume",
    // Lavalink has no time-varying fade; a gentle level trim is the closest
    // static approximation of the old FFmpeg afade chain.
    filters: { volume: 0.85 },
  },
  surrounding: {
    label: "Surround",
    emoji: "🔈",
    description: "Spatial surround sound",
    filters: {
      channelMix: { leftToLeft: 0.7, leftToRight: 0.3, rightToLeft: 0.3, rightToRight: 0.7 },
    },
  },
};

const MUSIC_UNAVAILABLE =
  "❌ Music playback is unavailable — no Lavalink node is configured or reachable.";
const NOTHING_PLAYING = "❌ Nothing is currently playing.";

// Defaults + type are defined in lib/schemas.ts (MusicSettingsSchema)

/**
 * Per-guild presentation state. The durable queue lives in Postgres; only the
 * channel to announce into and the reply awaiting the first track are local.
 */
interface AnnounceContext {
  channel: TextBasedChannel | null;
  pendingInteraction: ChatInputCommandInteraction | null;
  isPlaylist: boolean;
  nowPlayingMessage: any | null;
}

const announceContexts = new Map<string, AnnounceContext>();

/**
 * Effect names currently applied per guild. Lavalink stores the merged filter
 * payload, not the names that produced it, so the toggle view is kept here —
 * the same lifetime the FFmpeg filter set used to have on the local queue.
 */
const activeFilterNames = new Map<string, string[]>();

async function getSettings(
  moduleManager: ModuleManager,
  guildId: string,
): Promise<MusicSettings> {
  const saved = await moduleManager.databaseService.getModuleSettings(
    guildId,
    "music",
  );
  const parsed = parseSettings(MusicSettingsSchema, saved, "music", guildId);
  return parsed ?? MusicSettingsSchema.parse({});
}

function announceContext(guildId: string): AnnounceContext {
  let context = announceContexts.get(guildId);
  if (!context) {
    context = {
      channel: null,
      pendingInteraction: null,
      isPlaylist: false,
      nowPlayingMessage: null,
    };
    announceContexts.set(guildId, context);
  }
  return context;
}

// ─── Nickname Sync ───────────────────────────────────────────────────────

async function updateBotNickname(
  moduleManager: ModuleManager,
  guildId: string,
  trackTitle?: string,
) {
  try {
    const guild = moduleManager.client.guilds.cache.get(guildId);
    const me = guild?.members?.me;
    if (!me) return;

    if (trackTitle) {
      // Discord nickname limit is 32 characters
      const prefix = "🎵 ";
      const maxTitleLen = 32 - prefix.length;
      const truncated =
        trackTitle.length > maxTitleLen
          ? trackTitle.substring(0, maxTitleLen - 1) + "…"
          : trackTitle;
      await me.setNickname(`${prefix}${truncated}`);
    } else {
      // Reset to default (null removes the nickname override)
      await me.setNickname(null);
    }
  } catch (err) {
    moduleManager.logger.warn(
      `Could not update nickname in ${guildId}: ${(err as Error).message}`,
      guildId,
      "music",
    );
  }
}

async function resetNicknameIfEnabled(
  moduleManager: ModuleManager,
  guildId: string,
  trackTitle?: string,
) {
  try {
    const settings = await getSettings(moduleManager, guildId);
    if (settings.updateNickname) {
      await updateBotNickname(moduleManager, guildId, trackTitle);
    }
  } catch {}
}

// ─── Music Service Plumbing ──────────────────────────────────────────────

function operationId(): string {
  return randomUUID();
}

function playableEntries(snapshot: MusicQueueSnapshot): MusicQueueEntry[] {
  return snapshot.entries
    .filter((entry) => entry.status !== "failed")
    .sort((left, right) => left.position - right.position);
}

function currentEntry(snapshot: MusicQueueSnapshot): MusicQueueEntry | null {
  return snapshot.entries.find((entry) => entry.id === snapshot.currentEntryId) ?? null;
}

function upcomingEntries(snapshot: MusicQueueSnapshot): MusicQueueEntry[] {
  return playableEntries(snapshot).filter((entry) => entry.id !== snapshot.currentEntryId);
}

/**
 * Runs one durable mutation against the current queue revision. A conflict
 * means another writer moved first, so the command is retried once against the
 * revision it produced — with the same operation ID, which stays idempotent.
 */
async function runMutation(
  runtime: MusicRuntime,
  guildId: string,
  build: (revision: number, operation: string) => MusicCommand,
): Promise<MusicResult<MusicQueueSnapshot>> {
  const operation = operationId();
  let result: MusicResult<MusicQueueSnapshot> | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await runtime.musicService.getQueue(guildId);
    result = await runtime.musicService.execute(build(snapshot.revision, operation));
    if (result.ok || result.error.code !== "MUSIC_CONFLICT") return result;
  }

  return result!;
}

function musicErrorMessage(error: MusicError): string {
  switch (error.code) {
    case "MUSIC_NO_MATCH":
      return "❌ No matching track was found.";
    case "MUSIC_SOURCE_UNAVAILABLE":
      return "❌ That music source is unavailable right now — try again shortly.";
    case "MUSIC_NODE_CAPACITY":
      return "❌ Every music server is at capacity — try again shortly.";
    case "MUSIC_VOICE_FAILED":
      return "❌ Could not update the voice connection.";
    case "MUSIC_RELAY_OFFLINE":
      return MUSIC_UNAVAILABLE;
    case "MUSIC_RETRY_EXHAUSTED":
      return "❌ Playback kept failing — try again shortly.";
    case "MUSIC_CONFLICT":
      return "⚠️ The queue changed while that command ran — try again.";
    default:
      return "❌ Could not complete that music command.";
  }
}

function requireRuntime(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): MusicRuntime | null {
  const runtime = moduleManager.music;
  if (!runtime) {
    interaction.editReply({ content: MUSIC_UNAVAILABLE });
    return null;
  }
  return runtime;
}

function requireVoiceChannel(
  interaction: ChatInputCommandInteraction,
): GuildMember | null {
  const member = interaction.member as GuildMember;
  if (!member?.voice?.channel) {
    interaction.editReply({ content: "❌ You need to be in a voice channel!" });
    return null;
  }
  return member;
}

/** Durable replacement for the old `requireQueue` guard. */
async function requireQueue(
  interaction: ChatInputCommandInteraction,
  runtime: MusicRuntime,
  checkCurrentTrack: boolean = true,
): Promise<MusicQueueSnapshot | null> {
  const snapshot = await runtime.musicService.getQueue(interaction.guildId!);

  if (playableEntries(snapshot).length === 0) {
    await interaction.editReply({ content: NOTHING_PLAYING });
    return null;
  }

  if (checkCurrentTrack && !snapshot.currentEntryId) {
    await interaction.editReply({ content: NOTHING_PLAYING });
    return null;
  }

  return snapshot;
}

// ─── Command Definitions ─────────────────────────────────────────────────

const playCommand = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Play a song or add it to the queue")
  .addStringOption((opt) =>
    opt
      .setName("query")
      .setDescription("Song name, YouTube/Spotify URL")
      .setRequired(true)
      .setAutocomplete(true),
  );

const playqueueCommand = new SlashCommandBuilder()
  .setName("playqueue")
  .setDescription("Play all songs queued from the web dashboard");

const skipCommand = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("Skip the current track");

const stopCommand = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stop playback and clear the queue");

const pauseCommand = new SlashCommandBuilder()
  .setName("pause")
  .setDescription("Pause playback");

const resumeCommand = new SlashCommandBuilder()
  .setName("resume")
  .setDescription("Resume playback");

const queueCommand = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("Show the current queue")
  .addIntegerOption((opt) =>
    opt.setName("page").setDescription("Page number").setMinValue(1),
  );

const nowplayingCommand = new SlashCommandBuilder()
  .setName("nowplaying")
  .setDescription("Show the currently playing track");

const volumeCommand = new SlashCommandBuilder()
  .setName("volume")
  .setDescription("Set the playback volume")
  .addIntegerOption((opt) =>
    opt
      .setName("level")
      .setDescription("Volume level (1-100)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100),
  );

const shuffleCommand = new SlashCommandBuilder()
  .setName("shuffle")
  .setDescription("Shuffle the queue");

const loopCommand = new SlashCommandBuilder()
  .setName("loop")
  .setDescription("Set loop mode")
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("Loop mode")
      .setRequired(true)
      .addChoices(
        { name: "Off", value: "off" },
        { name: "Track", value: "track" },
        { name: "Queue", value: "queue" },
      ),
  );

const settingsCommand = new SlashCommandBuilder()
  .setName("music-settings")
  .setDescription("Show music settings for this server");

const filterCommand = new SlashCommandBuilder()
  .setName("filter")
  .setDescription("Toggle an audio effect on the current playback")
  .addStringOption((opt) =>
    opt
      .setName("effect")
      .setDescription("Audio effect to toggle")
      .setRequired(true)
      .addChoices(
        { name: "🚫 Remove All", value: "clear" },
        ...Object.entries(AVAILABLE_FILTERS).map(([key, val]) => ({
          name: `${val.emoji} ${val.label}`,
          value: key,
        })),
      ),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("save")
      .setDescription(
        "Save as default for this server (auto-applied to new queues)",
      ),
  );

const lyricsCommand = new SlashCommandBuilder()
  .setName("lyrics")
  .setDescription("Get lyrics for the current song or search for a song")
  .addStringOption((opt) =>
    opt
      .setName("song")
      .setDescription("Song name or artist (leave blank for current playing song)")
      .setRequired(false),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("dm")
      .setDescription("Send lyrics privately to your DM instead of the channel")
      .setRequired(false),
  );

const autoplayCommand = new SlashCommandBuilder()
  .setName("autoplay")
  .setDescription("Toggle smart autoplay (plays recommended tracks when queue ends)")
  .addBooleanOption((opt) =>
    opt
      .setName("enabled")
      .setDescription("Enable or disable autoplay")
      .setRequired(true),
  );

const speedCommand = new SlashCommandBuilder()
  .setName("speed")
  .setDescription("Set playback speed (0.5x - 2.0x)")
  .addNumberOption((opt) =>
    opt
      .setName("rate")
      .setDescription("Playback speed multiplier (e.g. 1.25, 0.8)")
      .setRequired(true)
      .setMinValue(0.5)
      .setMaxValue(2.0),
  );

const pitchCommand = new SlashCommandBuilder()
  .setName("pitch")
  .setDescription("Set playback pitch (0.5x - 2.0x)")
  .addNumberOption((opt) =>
    opt
      .setName("level")
      .setDescription("Pitch multiplier (e.g. 1.2, 0.9)")
      .setRequired(true)
      .setMinValue(0.5)
      .setMaxValue(2.0),
  );

// ─── Presentation Helpers ────────────────────────────────────────────────

interface DisplayTrack {
  title: string;
  artist?: string;
  url?: string;
  artworkUrl?: string;
  durationMs?: number;
  requestedBy?: string;
}

function toDisplayTrack(track: CanonicalTrack): DisplayTrack {
  return {
    title: track.title,
    artist: track.artists[0],
    url: track.requestedSource.uri ?? track.playbackSource?.uri,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    requestedBy: track.requestedBy,
  };
}

function formatDuration(milliseconds: number | undefined): string {
  if (!milliseconds || milliseconds <= 0) return "Live";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = `${minutes.toString().padStart(hours > 0 ? 2 : 1, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
}

function trackLine(track: DisplayTrack): string {
  const title = track.url ? `[${track.title}](${track.url})` : track.title;
  return track.artist ? `**${track.artist} — ${title}**` : `**${title}**`;
}

function buildProgressBar(positionMs: number, durationMs?: number): string | undefined {
  if (!durationMs || durationMs <= 0) return undefined;
  const length = 15;
  const ratio = Math.min(1, Math.max(0, positionMs / durationMs));
  const marker = Math.min(length - 1, Math.floor(ratio * length));
  const bar = `${"▬".repeat(marker)}🔘${"▬".repeat(length - marker - 1)}`;
  return `${formatDuration(positionMs)} ┃ ${bar} ┃ ${formatDuration(durationMs)}`;
}

function buildNowPlayingButtons(
  isPaused: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music:pause")
      .setEmoji(isPaused ? "▶️" : "⏸️")
      .setLabel(isPaused ? "Resume" : "Pause")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music:stop")
      .setEmoji("⏹️")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music:lyrics")
      .setEmoji("📜")
      .setLabel("Lyrics")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildNowPlayingCard(
  track: DisplayTrack,
  snapshot: MusicQueueSnapshot,
  isPaused: boolean,
  progressBar?: string,
): any[] {
  const description = progressBar
    ? `${trackLine(track)}\n\n${progressBar}`
    : trackLine(track);

  // Discord's Components V2 Thumbnail accessory never scales its source
  // image down to fit its box — confirmed by testing both a hotlinked
  // full-size image and a pre-cropped 256x256 square attachment, both of
  // which still rendered with a scrollbar. MediaGallery (type 12) is the
  // component actually meant for displaying an image at a real size, so
  // the art goes there instead of as a Section accessory.
  return buildV2Layout({
    title: "🎵 Now Playing",
    description,
    color: 0x5865f2,
    mediaGallery: track.artworkUrl ? [track.artworkUrl] : undefined,
    fields: [
      { name: "Duration", value: formatDuration(track.durationMs), inline: true },
      {
        name: "Requested by",
        value: track.requestedBy ? `<@${track.requestedBy}>` : "Unknown",
        inline: true,
      },
      { name: "Loop", value: loopModeToString(snapshot.repeatMode), inline: true },
      { name: "Autoplay", value: snapshot.autoplay ? "✅ On" : "❌ Off", inline: true },
    ],
    footer: `Volume: ${snapshot.volume}%`,
    components: [buildNowPlayingButtons(isPaused)],
    useContainer: true,
  });
}

function buildFilterStatusCard(
  title: string,
  description: string,
  color: number,
  activeEffectsDisplay: string,
  saved: boolean,
): any[] {
  return buildV2Layout({
    title,
    description,
    color,
    fields: [{ name: "🎛️ Active Effects", value: activeEffectsDisplay }],
    footer: saved ? "💾 Saved as server default" : undefined,
    useContainer: true,
  });
}

function buildQueueCard(snapshot: MusicQueueSnapshot, page: number): any[] {
  const pageSize = 10;
  const tracks = upcomingEntries(snapshot);
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
  const start = page * pageSize;
  const pageTracks = tracks.slice(start, start + pageSize);

  const current = currentEntry(snapshot);
  const lines: string[] = [];

  if (current) {
    const display = toDisplayTrack(current.track);
    lines.push(
      `**Now Playing:** ${display.url ? `[${display.title}](${display.url})` : display.title} — \`${formatDuration(display.durationMs)}\`\n`,
    );
  }

  if (pageTracks.length > 0) {
    pageTracks.forEach((entry, i) => {
      const display = toDisplayTrack(entry.track);
      lines.push(
        `**${start + i + 1}.** ${display.url ? `[${display.title}](${display.url})` : display.title} — \`${formatDuration(display.durationMs)}\``,
      );
    });
  } else if (page > 0) {
    lines.push("No tracks on this page.");
  }

  return buildV2Layout({
    title: "📋 Queue",
    description: lines.join("\n") || "Empty",
    color: 0x5865f2,
    footer: `Page ${page + 1}/${totalPages} • ${tracks.length} tracks in queue`,
    useContainer: true,
  });
}

function buildQueuePagerRow(
  page: number,
  totalPages: number,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music_queue_prev")
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId("music_queue_page_indicator")
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("music_queue_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === totalPages - 1),
  );
}

// ─── Filter Helpers ──────────────────────────────────────────────────────

function enabledFilters(guildId: string): string[] {
  return activeFilterNames.get(guildId) ?? [];
}

function composeFilters(names: readonly string[]): MusicFilters {
  const composed: MusicFilters = {};
  for (const name of names) {
    const definition = AVAILABLE_FILTERS[name];
    if (definition) Object.assign(composed, definition.filters);
  }
  return composed;
}

function describeFilters(names: readonly string[]): string {
  if (names.length === 0) return "None";
  return names
    .map((name) => {
      const info = AVAILABLE_FILTERS[name];
      return info ? `${info.emoji} ${info.label}` : name;
    })
    .join(" • ");
}

async function applyFilters(
  runtime: MusicRuntime,
  guildId: string,
  names: readonly string[],
): Promise<MusicResult<MusicQueueSnapshot>> {
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "filters",
    guildId,
    operationId: operation,
    expectedRevision: revision,
    filters: composeFilters(names),
  }));
  if (result.ok) activeFilterNames.set(guildId, [...names]);
  return result;
}

// ─── Command Handlers ────────────────────────────────────────────────────

interface EnqueueOutcome {
  queued: number;
  failed: number;
  firstTrack: CanonicalTrack | null;
  error: MusicError | null;
  startedNewQueue: boolean;
}

/**
 * Resolves one query through Lavalink and commits the resulting canonical
 * tracks to the durable queue. Encoded Lavalink data stays inside the adapter.
 */
async function enqueueQuery(
  runtime: MusicRuntime,
  guildId: string,
  voiceChannelId: string,
  query: string,
  requestedBy: string,
  maxQueueSize: number,
): Promise<EnqueueOutcome> {
  const outcome: EnqueueOutcome = {
    queued: 0,
    failed: 0,
    firstTrack: null,
    error: null,
    startedNewQueue: false,
  };

  const before = await runtime.musicService.getQueue(guildId);
  outcome.startedNewQueue = playableEntries(before).length === 0;

  const resolved = await runtime.engine.loadTracks({
    guildId,
    input: query,
    requestedBy,
  });
  if (!resolved.ok) {
    outcome.error = resolved.error;
    return outcome;
  }

  const candidates =
    resolved.value.kind === "playlist"
      ? resolved.value.candidates
      : resolved.value.candidates.slice(0, 1);
  const room = Math.max(0, maxQueueSize - playableEntries(before).length);

  for (const candidate of candidates.slice(0, room)) {
    const result = await runMutation(runtime, guildId, (revision, operation) => ({
      type: "play",
      guildId,
      operationId: operation,
      expectedRevision: revision,
      track: candidate.track,
      voiceChannelId,
    }));

    if (!result.ok) {
      outcome.error = result.error;
      outcome.failed += 1;
      break;
    }
    if (!outcome.firstTrack) outcome.firstTrack = candidate.track;
    outcome.queued += 1;
  }

  return outcome;
}

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const member = requireVoiceChannel(interaction);
  if (!member) return;

  const guildId = interaction.guildId!;

  // Block if recording is active in this guild
  if (recordingActiveSessions.has(guildId)) {
    await interaction.editReply({
      content:
        "❌ A recording is currently active in this server. Please stop the recording with `/record stop` before playing music.",
    });
    return;
  }

  const query = interaction.options.getString("query", true);
  const settings = await getSettings(moduleManager, guildId);

  try {
    const before = await runtime.musicService.getQueue(guildId);
    if (playableEntries(before).length >= settings.maxQueueSize) {
      await interaction.editReply({
        content: `⚠️ Queue limit reached (${settings.maxQueueSize} tracks). Remove some tracks first.`,
      });
      return;
    }

    const startingNewQueue = playableEntries(before).length === 0;
    const context = announceContext(guildId);
    context.channel = interaction.channel;
    context.nowPlayingMessage = null;
    if (startingNewQueue) {
      context.pendingInteraction = interaction;
      context.isPlaylist = false;

      // Saved effects are committed before dispatch so the first frame already
      // carries them, replacing the old post-start FFmpeg toggle.
      if (settings.activeFilters && settings.activeFilters.length > 0) {
        await applyFilters(runtime, guildId, settings.activeFilters);
      } else {
        activeFilterNames.set(guildId, []);
      }
    }

    const outcome = await enqueueQuery(
      runtime,
      guildId,
      member.voice.channel!.id,
      query,
      interaction.user.id,
      settings.maxQueueSize,
    );

    if (outcome.queued === 0) {
      context.pendingInteraction = null;
      await interaction.editReply({
        content: outcome.error
          ? musicErrorMessage(outcome.error)
          : `⚠️ Queue limit reached (${settings.maxQueueSize} tracks). Remove some tracks first.`,
      });
      return;
    }

    if (outcome.queued > 1) context.isPlaylist = true;

    if (!startingNewQueue) {
      const after = await runtime.musicService.getQueue(guildId);
      const track = toDisplayTrack(outcome.firstTrack!);
      const components = buildV2Layout({
        title: "✅ Added to Queue",
        description: trackLine(track),
        color: 0x57f287,
        mediaGallery: track.artworkUrl ? [track.artworkUrl] : undefined,
        fields: [
          { name: "Duration", value: formatDuration(track.durationMs), inline: true },
          { name: "Position", value: `#${upcomingEntries(after).length}`, inline: true },
        ],
        useContainer: true,
      });

      await interaction.editReply({
        components,
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    // First track — show a loading indicator; the track.start event replaces
    // this same reply with the "Now Playing" card. The event may already have
    // consumed the pending interaction, in which case the card is live.
    if (context.pendingInteraction === interaction) {
      await interaction.editReply({ content: "🎵 Loading track..." });
    }
  } catch (error: any) {
    moduleManager.logger.error("Play error", guildId, error, "music");
    await interaction.editReply({
      content: `❌ Could not play: ${error.message}`,
    });
  }
}

async function handleSkip(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime);
  if (!snapshot) return;

  const guildId = interaction.guildId!;
  const current = currentEntry(snapshot);
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "skip",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));

  if (!result.ok) {
    await interaction.editReply({ content: musicErrorMessage(result.error) });
    return;
  }

  await interaction.editReply({
    content: `⏭️ Skipped **${current?.track.title || "current track"}**.`,
  });
}

async function handleStop(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const guildId = interaction.guildId!;
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "stop",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));

  if (!result.ok) {
    await interaction.editReply({ content: musicErrorMessage(result.error) });
    return;
  }

  await resetNicknameIfEnabled(moduleManager, guildId);
  activeFilterNames.delete(guildId);
  announceContexts.delete(guildId);

  await interaction.editReply({
    content: "⏹️ Stopped playback and cleared the queue.",
  });
}

async function handlePause(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const guildId = interaction.guildId!;
  const state = await runtime.musicService.getState(guildId);
  if (state.status === "paused") {
    await interaction.editReply({ content: "⚠️ Already paused." });
    return;
  }

  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "pause",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));

  await interaction.editReply({
    content: result.ok ? "⏸️ Paused." : musicErrorMessage(result.error),
  });
}

async function handleResume(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const guildId = interaction.guildId!;
  const state = await runtime.musicService.getState(guildId);
  if (state.status !== "paused") {
    await interaction.editReply({ content: "⚠️ Not paused." });
    return;
  }

  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "resume",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));

  await interaction.editReply({
    content: result.ok ? "▶️ Resumed." : musicErrorMessage(result.error),
  });
}

async function handleQueue(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const pageSize = 10;
  const guildId = interaction.guildId!;
  const initial = await runtime.musicService.getQueue(guildId);
  if (playableEntries(initial).length === 0) {
    await interaction.editReply({ content: "📭 The queue is empty." });
    return;
  }

  let page = Math.max((interaction.options.getInteger("page") || 1) - 1, 0);

  // Re-reads the durable queue on every render, since tracks can be
  // added/skipped/finished while the pager is open — a stale snapshot
  // (the pattern /help uses for its static module list) would show a
  // wrong queue within seconds.
  const render = async (disabled = false): Promise<any[]> => {
    const live = await runtime.musicService.getQueue(guildId);
    if (playableEntries(live).length === 0) {
      return buildV2Layout({
        description: "📭 The queue is empty.",
        useContainer: true,
      });
    }
    const totalPages = Math.max(1, Math.ceil(upcomingEntries(live).length / pageSize));
    page = Math.min(page, totalPages - 1);
    return [
      ...buildQueueCard(live, page),
      buildQueuePagerRow(page, totalPages, disabled),
    ];
  };

  const reply = await interaction.editReply({
    components: await render(),
    flags: MessageFlags.IsComponentsV2,
  });

  const collector = reply.createMessageComponentCollector({
    filter: (i: any) => i.user.id === interaction.user.id,
    time: 3 * 60 * 1000,
  });

  collector?.on("collect", async (componentInteraction: any) => {
    const live = await runtime.musicService.getQueue(guildId);
    const totalPages = Math.max(1, Math.ceil(upcomingEntries(live).length / pageSize));

    if (componentInteraction.customId === "music_queue_prev") {
      page = Math.max(0, page - 1);
    } else if (componentInteraction.customId === "music_queue_next") {
      page = Math.min(totalPages - 1, page + 1);
    }

    await componentInteraction.update({
      components: await render(),
      flags: MessageFlags.IsComponentsV2,
    });
  });

  collector?.on("end", async () => {
    try {
      await interaction.editReply({
        components: await render(true),
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {}
  });
}

async function handleNowPlaying(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime);
  if (!snapshot) return;

  const entry = currentEntry(snapshot);
  if (!entry) {
    await interaction.editReply({ content: "❌ No track currently playing." });
    return;
  }

  const state = await runtime.musicService.getState(interaction.guildId!);
  const track = toDisplayTrack(entry.track);

  await interaction.editReply({
    components: buildNowPlayingCard(
      track,
      snapshot,
      state.status === "paused",
      buildProgressBar(state.positionMs, track.durationMs),
    ),
    flags: MessageFlags.IsComponentsV2,
  });
}

async function handleVolume(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const guildId = interaction.guildId!;
  const level = interaction.options.getInteger("level", true);

  if (snapshot.volume === level) {
    await interaction.editReply({
      content: `🔊 Volume is already **${level}%**.`,
    });
    return;
  }

  // Lavalink volume is a durable checkpoint, so the old client-side 2s fade
  // (20 setVolume calls) would mean 20 durable mutations — the level is set
  // once instead.
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "volume",
    guildId,
    operationId: operation,
    expectedRevision: revision,
    volume: level,
  }));

  if (!result.ok) {
    await interaction.editReply({ content: musicErrorMessage(result.error) });
    return;
  }

  // Persist the new volume setting for future sessions
  try {
    const settings = await getSettings(moduleManager, guildId);
    settings.defaultVolume = level;
    await moduleManager.databaseService.setModuleSettings(
      guildId,
      "music",
      settings,
    );
  } catch (err) {
    moduleManager.logger.error("Failed to save volume settings", guildId, err, "music");
  }

  await interaction.editReply({
    content: `🔊 Volume set to **${level}%**.`,
  });
}

async function handleShuffle(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  if (playableEntries(snapshot).length < 2) {
    await interaction.editReply({
      content: "⚠️ Not enough tracks to shuffle.",
    });
    return;
  }

  const guildId = interaction.guildId!;
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "queue.shuffle",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));

  await interaction.editReply({
    content: result.ok ? "🔀 Queue shuffled!" : musicErrorMessage(result.error),
  });
}

async function handleLoop(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const guildId = interaction.guildId!;
  const mode = interaction.options.getString("mode", true) as MusicRepeatMode;
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "repeat",
    guildId,
    operationId: operation,
    expectedRevision: revision,
    repeatMode: mode,
  }));

  await interaction.editReply({
    content: result.ok
      ? `🔁 Loop mode set to **${mode}**.`
      : musicErrorMessage(result.error),
  });
}

async function handleSettings(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const settings = await getSettings(moduleManager, interaction.guildId!);

  // Show active filters
  const activeFiltersList =
    settings.activeFilters && settings.activeFilters.length > 0
      ? settings.activeFilters
          .map((f: string) => {
            const info = AVAILABLE_FILTERS[f];
            return info ? `${info.emoji} ${info.label}` : f;
          })
          .join(", ")
      : "None";

  const components = buildV2Layout({
    title: "⚙️ Music Settings",
    description:
      "Per-server music configuration. Change these from the web dashboard.",
    color: 0x5865f2,
    fields: [
      {
        name: "Default Volume",
        value: `${settings.defaultVolume}%`,
        inline: true,
      },
      {
        name: "DJ Role",
        value: settings.djRoleId
          ? `<@&${settings.djRoleId}>`
          : "None (anyone can use)",
        inline: true,
      },
      {
        name: "Max Queue Size",
        value: `${settings.maxQueueSize}`,
        inline: true,
      },
      {
        name: "Update Bot Nickname",
        value: settings.updateNickname ? "Yes" : "No",
        inline: true,
      },
      {
        name: "🎛️ Saved Filters",
        value: activeFiltersList,
        inline: false,
      },
    ],
    useContainer: true,
  });

  await interaction.editReply({
    components,
    flags: MessageFlags.IsComponentsV2,
  });
}

async function handleFilter(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const guildId = interaction.guildId!;
  const effect = interaction.options.getString("effect", true);
  const shouldSave = interaction.options.getBoolean("save") ?? false;
  const current = enabledFilters(guildId);

  const persist = async (names: string[]) => {
    if (!shouldSave) return;
    try {
      const settings = await getSettings(moduleManager, guildId);
      settings.activeFilters = names;
      await moduleManager.databaseService.setModuleSettings(
        guildId,
        "music",
        settings,
      );
    } catch (err) {
      moduleManager.logger.error("Failed to save filter settings", guildId, err, "music");
    }
  };

  // ── Remove All Effects ──────────────────────────────────────────────
  if (effect === "clear") {
    if (current.length === 0) {
      await interaction.editReply({
        content: "ℹ️ No effects are currently active.",
      });
      return;
    }

    const result = await applyFilters(runtime, guildId, []);
    if (!result.ok) {
      moduleManager.logger.error(
        `Clear filters failed: ${result.error.code}`,
        guildId,
        result.error,
        "music",
      );
      await interaction.editReply({
        content: musicErrorMessage(result.error),
      });
      return;
    }

    await persist([]);

    await interaction.editReply({
      components: buildFilterStatusCard(
        "🚫 All Effects Removed",
        `Cleared **${current.length}** effect${current.length === 1 ? "" : "s"}.`,
        0xed4245,
        "None",
        shouldSave,
      ),
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  const filterInfo = AVAILABLE_FILTERS[effect];
  if (!filterInfo) {
    await interaction.editReply({ content: "❌ Unknown effect." });
    return;
  }

  const isNowEnabled = !current.includes(effect);
  const next = isNowEnabled
    ? [...current, effect]
    : current.filter((name) => name !== effect);

  const result = await applyFilters(runtime, guildId, next);
  if (!result.ok) {
    moduleManager.logger.error(
      `Filter update failed: ${result.error.code}`,
      guildId,
      result.error,
      "music",
    );
    await interaction.editReply({ content: musicErrorMessage(result.error) });
    return;
  }

  await persist(next);

  await interaction.editReply({
    components: buildFilterStatusCard(
      `${filterInfo.emoji} ${filterInfo.label} — ${isNowEnabled ? "enabled" : "disabled"}`,
      filterInfo.description,
      isNowEnabled ? 0x57f287 : 0xed4245,
      describeFilters(next),
      shouldSave,
    ),
    flags: MessageFlags.IsComponentsV2,
  });
}

async function handleLyrics(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const guildId = interaction.guildId!;
  const songQuery = interaction.options.getString("song");
  const sendToDm = interaction.options.getBoolean("dm") ?? false;

  let query = songQuery?.trim();
  if (!query) {
    const snapshot = await runtime.musicService.getQueue(guildId);
    const current = currentEntry(snapshot);
    if (!current) {
      await interaction.editReply({
        content: "❌ Nothing is currently playing. Specify a song name to search: `/lyrics song:<name>`",
      });
      return;
    }
    query = `${current.track.artists[0] ?? ""} ${current.track.title}`.trim();
  }

  const lyricsRes = await runtime.musicService.getLyrics(guildId, query);
  if (!lyricsRes.ok) {
    await interaction.editReply({
      content: `❌ No lyrics found for **${query}**.`,
    });
    return;
  }

  const lyrics = lyricsRes.value;
  const lines = lyrics.lines.map((l) => l.text).join("\n");
  const truncated = lines.length > 3900 ? `${lines.slice(0, 3900)}\n\n*(lyrics truncated)*` : lines;

  const components = buildV2Layout({
    title: `📜 ${lyrics.trackTitle || query}`,
    description: `${lyrics.artist ? `**${lyrics.artist}**\n\n` : ""}${truncated || "No lyrics content available."}`,
    footer: `Source: ${lyrics.source || "LRCLIB"} • Synced: ${lyrics.synced ? "Yes" : "No"}`,
    color: 0x9333ea,
    useContainer: true,
  });

  if (sendToDm) {
    try {
      await interaction.user.send({
        components,
        flags: MessageFlags.IsComponentsV2,
      });
      await interaction.editReply({
        content: `📬 Sent lyrics for **${lyrics.trackTitle || query}** to your DMs!`,
      });
    } catch {
      await interaction.editReply({
        content: "❌ Could not send DM. Please check your Discord privacy settings.",
      });
    }
  } else {
    await interaction.editReply({
      components,
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

async function handleAutoplay(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const guildId = interaction.guildId!;
  const enabled = interaction.options.getBoolean("enabled", true);

  const snapshot = await runtime.musicService.getQueue(guildId);
  const result = await runtime.musicService.execute({
    guildId,
    operationId: randomUUID(),
    expectedRevision: snapshot.revision,
    type: "autoplay",
    enabled,
  });

  if (!result.ok) {
    await interaction.editReply({ content: musicErrorMessage(result.error) });
    return;
  }

  await interaction.editReply({
    components: buildV2Layout({
      title: `📻 Autoplay ${enabled ? "Enabled" : "Disabled"}`,
      description: enabled
        ? "When the queue ends, the bot will automatically find and play recommended tracks!"
        : "Autoplay is now turned off. Playback will stop when the queue finishes.",
      color: enabled ? 0x57f287 : 0xed4245,
      useContainer: true,
    }),
    flags: MessageFlags.IsComponentsV2,
  });
}

async function handleSpeed(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const guildId = interaction.guildId!;
  const rate = interaction.options.getNumber("rate", true);

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const currentFilters = { ...(snapshot.filters ?? {}) };
  const currentTimescale = (currentFilters.timescale as Record<string, number> | undefined) ?? {};

  const updatedFilters = {
    ...currentFilters,
    timescale: {
      ...currentTimescale,
      speed: rate,
      rate: 1,
    },
  };

  const result = await runtime.musicService.execute({
    guildId,
    operationId: randomUUID(),
    expectedRevision: snapshot.revision,
    type: "filters",
    filters: updatedFilters,
  });

  if (!result.ok) {
    await interaction.editReply({ content: musicErrorMessage(result.error) });
    return;
  }

  await interaction.editReply({
    components: buildV2Layout({
      title: "⚡ Playback Speed Updated",
      description: `Speed set to **${rate}x** (pitch preserved).`,
      color: 0x5865f2,
      useContainer: true,
    }),
    flags: MessageFlags.IsComponentsV2,
  });
}

async function handlePitch(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const guildId = interaction.guildId!;
  const level = interaction.options.getNumber("level", true);

  const snapshot = await requireQueue(interaction, runtime, false);
  if (!snapshot) return;

  const currentFilters = { ...(snapshot.filters ?? {}) };
  const currentTimescale = (currentFilters.timescale as Record<string, number> | undefined) ?? {};

  const updatedFilters = {
    ...currentFilters,
    timescale: {
      ...currentTimescale,
      pitch: level,
    },
  };

  const result = await runtime.musicService.execute({
    guildId,
    operationId: randomUUID(),
    expectedRevision: snapshot.revision,
    type: "filters",
    filters: updatedFilters,
  });

  if (!result.ok) {
    await interaction.editReply({ content: musicErrorMessage(result.error) });
    return;
  }

  await interaction.editReply({
    components: buildV2Layout({
      title: "🎵 Playback Pitch Updated",
      description: `Pitch set to **${level}x**.`,
      color: 0x5865f2,
      useContainer: true,
    }),
    flags: MessageFlags.IsComponentsV2,
  });
}

async function handlePlayQueue(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const runtime = requireRuntime(interaction, moduleManager);
  if (!runtime) return;

  const member = requireVoiceChannel(interaction);
  if (!member) return;

  const guildId = interaction.guildId!;

  // Block if recording is active in this guild
  if (recordingActiveSessions.has(guildId)) {
    await interaction.editReply({
      content:
        "❌ A recording is currently active in this server. Please stop the recording with `/record stop` before playing music.",
    });
    return;
  }

  const settings = await getSettings(moduleManager, guildId);

  try {
    // Pre-queue lives inside the music module's settings object.
    const musicSettings = await moduleManager.databaseService.getModuleSettings(
      guildId,
      "music",
    );
    const preQueue: any[] = Array.isArray(musicSettings?.preQueue)
      ? musicSettings.preQueue
      : [];

    if (preQueue.length === 0) {
      await interaction.editReply({
        content:
          "📭 No songs in the dashboard queue. Add songs from the web dashboard first.",
      });
      return;
    }

    await interaction.editReply({
      content: `🎵 Loading **${preQueue.length}** songs from dashboard queue...`,
    });

    const before = await runtime.musicService.getQueue(guildId);
    const startingNewQueue = playableEntries(before).length === 0;
    const context = announceContext(guildId);
    context.channel = interaction.channel;
    context.isPlaylist = true;
    context.nowPlayingMessage = null;
    if (startingNewQueue) {
      context.pendingInteraction = null;
      if (settings.activeFilters && settings.activeFilters.length > 0) {
        await applyFilters(runtime, guildId, settings.activeFilters);
      } else {
        activeFilterNames.set(guildId, []);
      }
    }

    let loaded = 0;
    let failed = 0;

    for (const item of preQueue) {
      const outcome = await enqueueQuery(
        runtime,
        guildId,
        member.voice.channel!.id,
        item.url || item.title,
        interaction.user.id,
        settings.maxQueueSize,
      );
      loaded += outcome.queued;
      if (outcome.queued === 0) {
        failed += 1;
        if (outcome.error) {
          moduleManager.logger.error(
            `Failed to load pre-queue track: ${item.title} (${outcome.error.code})`,
            guildId,
            outcome.error,
            "music",
          );
        }
      }
    }

    // Clear the pre-queue after loading so the dashboard reflects the
    // consumed state immediately.
    if (musicSettings && Array.isArray(musicSettings.preQueue)) {
      const next = { ...musicSettings, preQueue: [] };
      await moduleManager.databaseService.setModuleSettings(
        guildId,
        "music",
        next,
      );
    }

    const components = buildV2Layout({
      title: "📋 Dashboard Queue Loaded",
      description: `Loaded **${loaded}** track${loaded !== 1 ? "s" : ""}${
        failed > 0 ? ` (${failed} failed)` : ""
      } from the dashboard queue.`,
      color: 0x57f287,
      footer: "Queue has been cleared from the dashboard",
      useContainer: true,
    });

    await interaction.editReply({
      components,
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (error: any) {
    moduleManager.logger.error("Dashboard queue error", guildId, error, "music");
    await interaction.editReply({
      content: `❌ Failed to load dashboard queue: ${error.message}`,
    });
  }
}

function loopModeToString(mode: MusicRepeatMode): string {
  switch (mode) {
    case "track":
      return "Track";
    case "queue":
      return "Queue";
    default:
      return "Off";
  }
}

// ─── Playback Events ─────────────────────────────────────────────────────

async function handleTrackStart(
  moduleManager: ModuleManager,
  runtime: MusicRuntime,
  event: Extract<MusicPlaybackEvent, { type: "track.start" }>,
) {
  const guildId = event.guildId;
  const snapshot = await runtime.musicService.getQueue(guildId);
  const entry = currentEntry(snapshot);
  const track: DisplayTrack = entry
    ? toDisplayTrack(entry.track)
    : { title: event.track.title, artist: event.track.artist, durationMs: event.track.durationMs };

  moduleManager.logger.info(`track.start: "${track.title}" in ${guildId}`, guildId, "music");

  await resetNicknameIfEnabled(moduleManager, guildId, track.title);

  const context = announceContexts.get(guildId);
  if (!context) return;

  const components = buildNowPlayingCard(track, snapshot, false);
  const pendingInteraction = context.pendingInteraction;

  if (pendingInteraction) {
    context.pendingInteraction = null;
    const message = await pendingInteraction
      .editReply({
        // The initial reply set content to "🎵 Loading track...".
        // Discord rejects V2-flagged edits that still carry non-empty
        // content, so it must be explicitly cleared (content: null),
        // not just omitted — omitting it leaves the old value in place.
        content: null,
        components,
        flags: MessageFlags.IsComponentsV2,
      })
      .catch((err: unknown) => {
        moduleManager.logger.error(
          "Failed to replace loading message with now-playing card",
          guildId,
          err,
          "music",
        );
        return null;
      });
    if (message) context.nowPlayingMessage = message;
    return;
  }

  if (!context.channel) return;

  if (context.isPlaylist && context.nowPlayingMessage) {
    await context.nowPlayingMessage
      .edit({ components, flags: MessageFlags.IsComponentsV2 })
      .catch(async () => {
        const message = await (context.channel as any)
          ?.send({ components, flags: MessageFlags.IsComponentsV2 })
          .catch(() => null);
        if (message) context.nowPlayingMessage = message;
      });
    return;
  }

  const message = await (context.channel as any)
    ?.send({ components, flags: MessageFlags.IsComponentsV2 })
    .catch(() => null);
  if (message) context.nowPlayingMessage = message;
}

async function handleTrackEnd(
  moduleManager: ModuleManager,
  runtime: MusicRuntime,
  event: Extract<MusicPlaybackEvent, { type: "track.end" }>,
) {
  const guildId = event.guildId;
  // Only a track that ended by itself advances the queue. "stopped" and
  // "replaced" mean a command already decided what plays next, and "cleanup"
  // means the player is gone — advancing either one would resurrect playback.
  if (event.reason !== "finished" && event.reason !== "loadFailed") return;

  // A track that could not load is retired instead of replayed, so repeat
  // modes cannot loop a broken source forever.
  const advanced = await runtime.advance(guildId, {
    trackFailed: event.reason === "loadFailed",
  });

  if (!advanced.ok) {
    // A conflict means a concurrent command already moved the queue; anything
    // else means playback stalled and must be visible.
    const message = `Queue advance failed in ${guildId}: ${advanced.error.code}`;
    if (advanced.error.code === "MUSIC_CONFLICT") {
      moduleManager.logger.warn(message, guildId, "music");
    } else {
      moduleManager.logger.error(message, guildId, advanced.error, "music");
    }
  }

  const snapshot = advanced.ok
    ? advanced.value
    : await runtime.musicService.getQueue(guildId);
  if (playableEntries(snapshot).length > 0) return;

  moduleManager.logger.info(`queue finished in ${guildId}`, guildId, "music");
  await resetNicknameIfEnabled(moduleManager, guildId);

  const context = announceContexts.get(guildId);
  announceContexts.delete(guildId);
  activeFilterNames.delete(guildId);
  if (!context?.channel) return;

  await (context.channel as any)
    ?.send({
      components: buildV2Layout({
        description: "✅ Queue finished — no more tracks to play.",
        color: 0x99aab5,
        useContainer: true,
      }),
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => {});
}

async function handlePlaybackFailure(
  moduleManager: ModuleManager,
  event: Extract<MusicPlaybackEvent, { type: "track.stuck" | "track.exception" | "voice.closed" }>,
) {
  const guildId = event.guildId;
  if (event.type === "voice.closed") {
    // The bot left (or was removed from) voice — mirror the old disconnect
    // handler and drop the music nickname without logging a false error.
    moduleManager.logger.info(`Voice connection closed in ${guildId}`, guildId, "music");
    await resetNicknameIfEnabled(moduleManager, guildId);
    return;
  }

  moduleManager.logger.error(
    `Playback ${event.type} in ${guildId}: ${event.error.code}`,
    guildId,
    event.error,
    "music",
  );

  const context = announceContexts.get(guildId);
  await (context?.channel as any)
    ?.send({ content: `⚠️ Player error: ${event.error.message}` })
    .catch(() => {});
}

async function registerMusicEvents(moduleManager: ModuleManager) {
  const runtime = moduleManager.music;
  if (!runtime) {
    moduleManager.logger.warn(
      "Music service is not configured — playback events are not wired.",
      undefined,
      "music",
    );
    return;
  }

  runtime.engine.on("playback", (event: MusicPlaybackEvent) => {
    void (async () => {
      try {
        if (event.type === "track.start") {
          await handleTrackStart(moduleManager, runtime, event);
        } else if (event.type === "track.end") {
          await handleTrackEnd(moduleManager, runtime, event);
        } else if (
          event.type === "track.stuck"
          || event.type === "track.exception"
          || event.type === "voice.closed"
        ) {
          await handlePlaybackFailure(moduleManager, event);
        }
      } catch (err) {
        moduleManager.logger.error("Music playback event failed", undefined, err, "music");
      }
    })();
  });

  // ─── Realtime Filter Sync from Dashboard ─────────────────────────────
  // The EventBus payload carries only { kind, guildId, moduleName } — the
  // settings themselves come from a follow-up read so every subscriber
  // sees the same authoritative value. Falls back to no-op when Redis
  // isn't configured; the dashboard filter changes will only take effect
  // on the next /play or on bot restart in that case.
  await moduleManager.databaseService.subscribeToGuildConfigs(
    async (payload: any) => {
      try {
        if (payload?.moduleName !== "music") return;

        const guildId = payload.guildId;
        if (!guildId) return;

        const settings = await moduleManager.databaseService.getModuleSettings(
          guildId,
          "music",
        );
        const newFilters: string[] = settings.activeFilters ?? [];

        const snapshot = await runtime.musicService.getQueue(guildId);
        if (!snapshot.currentEntryId) return;

        const currentlyEnabled = enabledFilters(guildId);
        const toEnable = newFilters.filter((f) => !currentlyEnabled.includes(f));
        const toDisable = currentlyEnabled.filter((f) => !newFilters.includes(f));
        if (toEnable.length === 0 && toDisable.length === 0) return;

        moduleManager.logger.info(
          `Dashboard filter sync for guild ${guildId}: +[${toEnable.join(",")}] -[${toDisable.join(",")}]`,
          guildId,
          "music",
        );

        const applied = await applyFilters(runtime, guildId, newFilters);
        if (!applied.ok) return;

        const context = announceContexts.get(guildId);
        if (!context?.channel) return;

        await (context.channel as any)
          ?.send({
            components: buildV2Layout({
              title: "🎛️ Audio Effects Updated",
              description: "Effects were changed from the dashboard.",
              color: 0x9333ea,
              fields: [{ name: "Active Effects", value: describeFilters(newFilters) }],
              footer: "Updated via web dashboard",
              useContainer: true,
            }),
            flags: MessageFlags.IsComponentsV2,
          })
          .catch(() => {});
      } catch (err) {
        moduleManager.logger.error("Error processing realtime filter sync", undefined, err, "music");
      }
    },
  );
}

// ─── AI Tool Actions ─────────────────────────────────────────────────────

export const musicAiTools: AiTool[] = [
  {
    name: "play_music",
    description:
      "Play a song or add it to the music queue. Use this when the user wants to play, queue, or listen to music.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The song name, artist name, or a YouTube/Spotify URL to play.",
        },
      },
      required: ["query"],
    },
    execute: async ({ guildId, message, moduleManager, args }) => {
      const query = (args.query as string) || "";
      if (!query) return "❌ I need a song name or URL to play something.";
      const member = message.member as GuildMember | null;
      const voiceChannel = member?.voice?.channel;
      if (!voiceChannel) {
        return "❌ You need to be in a voice channel for me to play music!";
      }
      const result = await musicPlay(
        guildId,
        voiceChannel,
        query,
        message.author,
        moduleManager,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message.channel as any,
      );
      return result.message;
    },
  },
  {
    name: "skip_track",
    description: "Skip the currently playing track and move to the next one.",
    parameters: { type: "object", properties: {} },
    execute: async ({ guildId, moduleManager }) =>
      (await musicSkip(guildId, moduleManager)).message,
  },
  {
    name: "stop_music",
    description: "Stop all music playback and clear the entire queue.",
    parameters: { type: "object", properties: {} },
    execute: async ({ guildId, moduleManager }) =>
      (await musicStop(guildId, moduleManager)).message,
  },
  {
    name: "pause_music",
    description: "Pause the currently playing track.",
    parameters: { type: "object", properties: {} },
    execute: async ({ guildId, moduleManager }) =>
      (await musicPause(guildId, moduleManager)).message,
  },
  {
    name: "resume_music",
    description: "Resume a paused track.",
    parameters: { type: "object", properties: {} },
    execute: async ({ guildId, moduleManager }) =>
      (await musicResume(guildId, moduleManager)).message,
  },
  {
    name: "set_volume",
    description: "Set the playback volume to a specific percentage between 1 and 100.",
    parameters: {
      type: "object",
      properties: {
        level: { type: "number", description: "Volume level from 1 to 100." },
      },
      required: ["level"],
    },
    execute: async ({ guildId, moduleManager, args }) => {
      const level = typeof args.level === "number" ? args.level : Number(args.level);
      if (isNaN(level)) return "❌ Please specify a valid volume level (1–100).";
      return (await musicSetVolume(guildId, level, moduleManager)).message;
    },
  },
  {
    name: "get_queue",
    description:
      "Show what is currently in the music queue, including what is playing and what is up next.",
    parameters: { type: "object", properties: {} },
    execute: async ({ guildId, moduleManager }) =>
      (await musicGetQueue(guildId, moduleManager)).message,
  },
  {
    name: "get_nowplaying",
    description: "Show information about the track that is currently playing.",
    parameters: { type: "object", properties: {} },
    execute: async ({ guildId, moduleManager }) =>
      (await musicGetNowPlaying(guildId, moduleManager)).message,
  },
  {
    name: "shuffle_queue",
    description: "Shuffle the tracks in the music queue into a random order.",
    parameters: { type: "object", properties: {} },
    execute: async ({ guildId, moduleManager }) =>
      (await musicShuffle(guildId, moduleManager)).message,
  },
];

// ─── Module Export ────────────────────────────────────────────────────────

const musicModule: BotModule = {
  name: "music",
  description:
    "Play music from YouTube, Spotify, and more with queue management.",
  meta: {
    displayName: "Music",
    category: "voice",
    icon: "i-lucide-disc-3",
    color: "violet",
    tags: ["audio", "playback", "queue", "spotify", "dj", "filters"],
  },
  deferReply: false, // We handle our own defer for public replies
  aiTools: musicAiTools,

  // Register all music commands as individual top-level commands
  commands: [
    playCommand.toJSON(),
    playqueueCommand.toJSON(),
    skipCommand.toJSON(),
    stopCommand.toJSON(),
    pauseCommand.toJSON(),
    resumeCommand.toJSON(),
    queueCommand.toJSON(),
    nowplayingCommand.toJSON(),
    volumeCommand.toJSON(),
    shuffleCommand.toJSON(),
    loopCommand.toJSON(),
    settingsCommand.toJSON(),
    filterCommand.toJSON(),
    lyricsCommand.toJSON(),
    autoplayCommand.toJSON(),
    speedCommand.toJSON(),
    pitchCommand.toJSON(),
  ],

  registerEvents: registerMusicEvents,

  async autocomplete(
    interaction: AutocompleteInteraction,
    moduleManager: ModuleManager,
  ) {
    const focused = interaction.options.getFocused(true);

    // Only handle autocomplete for the "query" option on the "play" command
    if (focused.name !== "query") {
      try {
        await interaction.respond([]);
      } catch {
        /* expired */
      }
      return;
    }

    const query = focused.value;
    const runtime = moduleManager.music;
    if (!runtime || !query || query.length < 2) {
      try {
        await interaction.respond([]);
      } catch {
        /* expired */
      }
      return;
    }

    try {
      // Race against a 2.0s timeout to prevent "Loading options failed" (Discord 3s limit)
      const searchPromise = runtime.engine.loadTracks({
        guildId: interaction.guildId ?? "autocomplete",
        input: query,
        requestedBy: interaction.user.id,
        requestType: "search",
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Search timeout")), 2000),
      );

      const result = await Promise.race([searchPromise, timeoutPromise]);
      if (!result.ok || result.value.candidates.length === 0) {
        try {
          await interaction.respond([]);
        } catch {
          /* ignore */
        }
        return;
      }

      const choices = result.value.candidates.slice(0, 10).map(({ track }) => {
        const label = `${track.title} — ${formatDuration(track.durationMs)}`;
        // The autocomplete value is replayed through /play, so it must be a
        // query the resolver can find again. Lavalink encodings are ephemeral
        // and must never leave the adapter.
        const value = track.requestedSource.uri
          ?? [track.title, track.artists[0]].filter(Boolean).join(" — ");
        return {
          name: label.length > 100 ? `${label.substring(0, 97)}...` : label,
          value: value.length > 100 ? value.substring(0, 100) : value,
        };
      });

      await interaction.respond(choices);
    } catch (error: any) {
      // 10062 = Unknown interaction — expected when Discord expires the token during rapid typing
      if (error?.code === 10062) return;

      if (error?.message === "Search timeout") {
        moduleManager.logger.warn(`Autocomplete timed out for "${query}"`, undefined, "music");
      } else {
        moduleManager.logger.error(
          "Autocomplete search error",
          undefined,
          error,
          "music",
        );
      }

      try {
        await interaction.respond([]);
      } catch {
        /* expired */
      }
    }
  },

  async execute(
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) {
    // Defer publicly — music responses should be visible to everyone
    await interaction.deferReply();

    // Dispatch based on the top-level command name
    const commandName = interaction.commandName;

    switch (commandName) {
      case "play":
        return handlePlay(interaction, moduleManager);
      case "playqueue":
        return handlePlayQueue(interaction, moduleManager);
      case "skip":
        return handleSkip(interaction, moduleManager);
      case "stop":
        return handleStop(interaction, moduleManager);
      case "pause":
        return handlePause(interaction, moduleManager);
      case "resume":
        return handleResume(interaction, moduleManager);
      case "queue":
        return handleQueue(interaction, moduleManager);
      case "nowplaying":
        return handleNowPlaying(interaction, moduleManager);
      case "volume":
        return handleVolume(interaction, moduleManager);
      case "shuffle":
        return handleShuffle(interaction, moduleManager);
      case "loop":
        return handleLoop(interaction, moduleManager);
      case "music-settings":
        return handleSettings(interaction, moduleManager);
      case "filter":
        return handleFilter(interaction, moduleManager);
      case "lyrics":
        return handleLyrics(interaction, moduleManager);
      case "autoplay":
        return handleAutoplay(interaction, moduleManager);
      case "speed":
        return handleSpeed(interaction, moduleManager);
      case "pitch":
        return handlePitch(interaction, moduleManager);
      default:
        await interaction.editReply({ content: "❓ Unknown command." });
    }
  },

  async handleButton(
    interaction: ButtonInteraction,
    moduleManager: ModuleManager,
  ) {
    const action = interaction.customId.split(":")[1];
    const guildId = interaction.guildId!;
    const runtime = moduleManager.music;

    // Require user to be in the same voice channel
    const member = interaction.member as GuildMember;
    if (!member?.voice?.channel) {
      await interaction.reply({
        content: "❌ You need to be in a voice channel to use this!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (!runtime) {
      await interaction.reply({
        content: MUSIC_UNAVAILABLE,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const snapshot = await runtime.musicService.getQueue(guildId);
    const entry = currentEntry(snapshot);
    if (!entry) {
      await interaction.reply({
        content: NOTHING_PLAYING,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    switch (action) {
      case "pause": {
        const state = await runtime.musicService.getState(guildId);
        const shouldResume = state.status === "paused";
        const result = await runMutation(runtime, guildId, (revision, operation) => ({
          type: shouldResume ? "resume" : "pause",
          guildId,
          operationId: operation,
          expectedRevision: revision,
        }));
        if (!result.ok) {
          await interaction.reply({
            content: musicErrorMessage(result.error),
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        // The whole "Now Playing" card (title/fields/footer) lives inside
        // the V2 container alongside the buttons — replacing just the
        // button row would wipe the rest of the card, so rebuild it whole.
        await interaction.update({
          components: buildNowPlayingCard(
            toDisplayTrack(entry.track),
            result.value,
            !shouldResume,
          ),
          flags: MessageFlags.IsComponentsV2,
        });
        break;
      }
      case "skip": {
        const result = await runMutation(runtime, guildId, (revision, operation) => ({
          type: "skip",
          guildId,
          operationId: operation,
          expectedRevision: revision,
        }));
        if (!result.ok) {
          await interaction.reply({
            content: musicErrorMessage(result.error),
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        // Clear the card on the old message; track.start sends a new one
        // for the next track. A plain content-less `components: []` would
        // leave the message with no content/embeds at all — Discord
        // rejects that as an empty message — so leave a status line. Wrap
        // it in a container (not a bare TextDisplay) to match the shape
        // every other V2 reply in this codebase uses.
        await interaction.update({
          components: buildV2Layout({
            description: "⏭️ Skipped.",
            useContainer: true,
          }),
          flags: MessageFlags.IsComponentsV2,
        });
        break;
      }
      case "lyrics": {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const lyricsRes = await runtime.musicService.getLyrics(guildId);
        if (!lyricsRes.ok) {
          await interaction.editReply({
            content: "❌ No lyrics found for the current track.",
          });
          return;
        }
        const lyrics = lyricsRes.value;
        const lines = lyrics.lines.map((l) => l.text).join("\n");
        const truncated = lines.length > 3900 ? `${lines.slice(0, 3900)}\n\n*(lyrics truncated)*` : lines;

        await interaction.editReply({
          components: buildV2Layout({
            title: `📜 Lyrics: ${lyrics.trackTitle || entry.track.title}`,
            description: `${lyrics.artist ? `**${lyrics.artist}**\n\n` : ""}${truncated || "No lyrics content available."}`,
            footer: `Source: ${lyrics.source || "LRCLIB"}`,
            color: 0x9333ea,
            useContainer: true,
          }),
          flags: MessageFlags.IsComponentsV2,
        });
        break;
      }
      case "stop": {
        const result = await runMutation(runtime, guildId, (revision, operation) => ({
          type: "stop",
          guildId,
          operationId: operation,
          expectedRevision: revision,
        }));
        if (!result.ok) {
          await interaction.reply({
            content: musicErrorMessage(result.error),
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        await resetNicknameIfEnabled(moduleManager, guildId);
        activeFilterNames.delete(guildId);
        announceContexts.delete(guildId);

        await interaction.update({
          components: buildV2Layout({
            description: "⏹️ Stopped.",
            useContainer: true,
          }),
          flags: MessageFlags.IsComponentsV2,
        });
        break;
      }
      default:
        break;
    }
  },
};

// ─── AI Tool Action Exports ───────────────────────────────────────────────
// Interaction-free functions called by the AI module's tool router and by the
// dashboard HTTP API. They return a plain result so the AI can compose a
// natural-language reply from the outcome.

export interface MusicActionResult {
  ok: boolean;
  message: string;
}

function actionRuntime(moduleManager: ModuleManager): MusicRuntime | null {
  return moduleManager.music ?? null;
}

function unavailable(): MusicActionResult {
  return { ok: false, message: MUSIC_UNAVAILABLE };
}

/** Play a track by search query or URL. The caller must supply the author's voice channel. */
export async function musicPlay(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  query: string,
  requestedBy: User,
  moduleManager: ModuleManager,
  notifyChannel?: TextBasedChannel,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  try {
    const settings = await getSettings(moduleManager, guildId);
    const before = await runtime.musicService.getQueue(guildId);
    if (playableEntries(before).length >= settings.maxQueueSize) {
      return {
        ok: false,
        message: `Queue limit reached (${settings.maxQueueSize} tracks). Remove some tracks first.`,
      };
    }

    const context = announceContext(guildId);
    if (notifyChannel) context.channel = notifyChannel;

    const outcome = await enqueueQuery(
      runtime,
      guildId,
      voiceChannel.id,
      query,
      requestedBy.id,
      settings.maxQueueSize,
    );

    if (!outcome.firstTrack) {
      return {
        ok: false,
        message: outcome.error
          ? musicErrorMessage(outcome.error)
          : "Could not play that track.",
      };
    }

    const track = outcome.firstTrack;
    const verb = outcome.startedNewQueue ? "Now playing" : "Added to queue";
    return {
      ok: true,
      message: `🎵 ${verb}: **${track.title}** by ${track.artists[0] || "Unknown"} (${formatDuration(track.durationMs)})`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Could not play: ${err?.message ?? "Unknown error"}`,
    };
  }
}

/** Skip the current track. */
export async function musicSkip(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  const entry = currentEntry(snapshot);
  if (!entry) return { ok: false, message: "Nothing is currently playing." };

  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "skip",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));
  if (!result.ok) return { ok: false, message: musicErrorMessage(result.error) };

  return { ok: true, message: `⏭️ Skipped **${entry.track.title}**.` };
}

/** Stop playback and clear the queue. */
export async function musicStop(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  if (playableEntries(snapshot).length === 0) {
    return { ok: false, message: "Nothing is currently playing." };
  }

  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "stop",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));
  if (!result.ok) return { ok: false, message: musicErrorMessage(result.error) };

  await resetNicknameIfEnabled(moduleManager, guildId);
  activeFilterNames.delete(guildId);
  announceContexts.delete(guildId);
  return { ok: true, message: "⏹️ Stopped playback and cleared the queue." };
}

/** Pause the current track. */
export async function musicPause(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  if (playableEntries(snapshot).length === 0) {
    return { ok: false, message: "Nothing is currently playing." };
  }
  const state = await runtime.musicService.getState(guildId);
  if (state.status === "paused") return { ok: false, message: "Already paused." };

  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "pause",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));
  return result.ok
    ? { ok: true, message: "⏸️ Paused." }
    : { ok: false, message: musicErrorMessage(result.error) };
}

/** Resume a paused track. */
export async function musicResume(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  if (playableEntries(snapshot).length === 0) {
    return { ok: false, message: "Nothing is currently playing." };
  }
  const state = await runtime.musicService.getState(guildId);
  if (state.status !== "paused") return { ok: false, message: "Not currently paused." };

  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "resume",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));
  return result.ok
    ? { ok: true, message: "▶️ Resumed." }
    : { ok: false, message: musicErrorMessage(result.error) };
}

/** Seek within the current track. Used by the dashboard control API. */
export async function musicSeek(
  guildId: string,
  positionMs: number,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  if (!snapshot.currentEntryId) {
    return { ok: false, message: "Nothing is currently playing." };
  }

  const target = Math.max(0, Math.round(positionMs));
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "seek",
    guildId,
    operationId: operation,
    expectedRevision: revision,
    positionMs: target,
  }));
  return result.ok
    ? { ok: true, message: `⏩ Seeked to ${formatDuration(target)}.` }
    : { ok: false, message: musicErrorMessage(result.error) };
}

/** Set the playback volume (1–100). */
export async function musicSetVolume(
  guildId: string,
  level: number,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  if (playableEntries(snapshot).length === 0) {
    return { ok: false, message: "Nothing is currently playing." };
  }

  const clamped = Math.max(1, Math.min(100, Math.round(level)));
  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "volume",
    guildId,
    operationId: operation,
    expectedRevision: revision,
    volume: clamped,
  }));
  if (!result.ok) return { ok: false, message: musicErrorMessage(result.error) };

  try {
    const settings = await getSettings(moduleManager, guildId);
    settings.defaultVolume = clamped;
    await moduleManager.databaseService.setModuleSettings(
      guildId,
      "music",
      settings,
    );
  } catch {}

  return { ok: true, message: `🔊 Volume set to **${clamped}%**.` };
}

/** Return a text summary of the current queue. */
export async function musicGetQueue(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  if (playableEntries(snapshot).length === 0) {
    return { ok: true, message: "📭 The queue is empty." };
  }

  const current = currentEntry(snapshot);
  const upcoming = upcomingEntries(snapshot);
  const shown = upcoming.slice(0, 5); // cap at 5 for brevity
  const lines: string[] = [];

  if (current) {
    lines.push(
      `**Now Playing:** ${current.track.title} — \`${formatDuration(current.track.durationMs)}\``,
    );
  }
  shown.forEach((entry, i) =>
    lines.push(`**${i + 1}.** ${entry.track.title} — \`${formatDuration(entry.track.durationMs)}\``),
  );

  const remaining = upcoming.length - shown.length;
  if (remaining > 0) {
    lines.push(`…and ${remaining} more track${remaining !== 1 ? "s" : ""}.`);
  }

  return { ok: true, message: lines.join("\n") };
}

/** Return now-playing info as a short text summary. */
export async function musicGetNowPlaying(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  const entry = currentEntry(snapshot);
  if (!entry) return { ok: true, message: "Nothing is currently playing." };

  const track = entry.track;
  return {
    ok: true,
    message: `🎵 **${track.title}** by ${track.artists[0] || "Unknown"} — \`${formatDuration(track.durationMs)}\` | Volume: ${snapshot.volume}%`,
  };
}

/** Shuffle the queue. */
export async function musicShuffle(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<MusicActionResult> {
  const runtime = actionRuntime(moduleManager);
  if (!runtime) return unavailable();

  const snapshot = await runtime.musicService.getQueue(guildId);
  const playable = playableEntries(snapshot);
  if (playable.length < 2) {
    return { ok: false, message: "Not enough tracks in the queue to shuffle." };
  }

  const result = await runMutation(runtime, guildId, (revision, operation) => ({
    type: "queue.shuffle",
    guildId,
    operationId: operation,
    expectedRevision: revision,
  }));
  return result.ok
    ? { ok: true, message: `🔀 Queue shuffled! (${playable.length} tracks)` }
    : { ok: false, message: musicErrorMessage(result.error) };
}

export default musicModule;
