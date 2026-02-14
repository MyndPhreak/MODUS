import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import {
  useMainPlayer,
  QueueRepeatMode,
  GuildQueue,
  QueryType,
} from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { ModuleManager } from "../ModuleManager";
import type { BotModule } from "../ModuleManager";

// Default settings for the music module per guild
const DEFAULT_SETTINGS = {
  defaultVolume: 50,
  djRoleId: "",
  updateChannelTopic: false,
  maxQueueSize: 200,
};

type MusicSettings = typeof DEFAULT_SETTINGS;

async function getSettings(
  moduleManager: ModuleManager,
  guildId: string,
): Promise<MusicSettings> {
  const saved = await moduleManager.appwriteService.getModuleSettings(
    guildId,
    "music",
  );
  return { ...DEFAULT_SETTINGS, ...saved };
}

// ─── Nickname Sync ───────────────────────────────────────────────────────

async function updateBotNickname(queue: GuildQueue, trackTitle?: string) {
  try {
    const me = queue.guild.members.me;
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
    // Missing permissions — silently ignore
    console.warn(
      `[Music] Could not update nickname in ${queue.guild.name}:`,
      (err as Error).message,
    );
  }
}

// ─── Player Events (registered once globally) ────────────────────────────

let eventsRegistered = false;

function registerPlayerEvents() {
  if (eventsRegistered) return;
  eventsRegistered = true;

  const player = useMainPlayer();

  player.events.on("playerStart", (queue: GuildQueue, track) => {
    const channel = (queue.metadata as any)?.channel;
    console.log(`[Music] playerStart: "${track.title}" in ${queue.guild.name}`);

    // Update bot nickname to current track
    updateBotNickname(queue, track.title);

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎵 Now Playing")
      .setDescription(`**[${track.title}](${track.url})**`)
      .addFields(
        { name: "Duration", value: track.duration || "Live", inline: true },
        {
          name: "Requested by",
          value: track.requestedBy?.toString() || "Unknown",
          inline: true,
        },
      )
      .setThumbnail(track.thumbnail || null)
      .setFooter({ text: `Volume: ${queue.node.volume}%` });

    channel.send({ embeds: [embed] }).catch(() => {});
  });

  player.events.on("emptyQueue", (queue: GuildQueue) => {
    const channel = (queue.metadata as any)?.channel;
    console.log(`[Music] emptyQueue in ${queue.guild.name}`);

    // Reset nickname when queue finishes
    updateBotNickname(queue);

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x99aab5)
      .setDescription("✅ Queue finished — no more tracks to play.");

    channel.send({ embeds: [embed] }).catch(() => {});
  });

  player.events.on("disconnect", (queue: GuildQueue) => {
    console.log(`[Music] disconnect in ${queue.guild.name}`);
    // Reset nickname when bot disconnects from voice
    updateBotNickname(queue);
  });

  player.events.on("playerError", (queue: GuildQueue, error) => {
    console.error(
      `[Music] Player error in ${queue.guild.name}:`,
      error.message,
    );
    console.error("[Music] Full error:", error);
    const channel = (queue.metadata as any)?.channel;
    if (channel) {
      channel
        .send({ content: `⚠️ Player error: ${error.message}` })
        .catch(() => {});
    }
  });

  player.events.on("error", (queue: GuildQueue, error) => {
    console.error(
      `[Music] General error in ${queue.guild.name}:`,
      error.message,
    );
    console.error("[Music] Full error:", error);
  });

  player.events.on("playerSkip" as any, (queue: GuildQueue, track: any) => {
    console.warn(
      `[Music] playerSkip: "${track?.title}" in ${queue.guild.name} — stream likely failed`,
    );
    const channel = (queue.metadata as any)?.channel;
    if (channel) {
      channel
        .send({
          content: `⚠️ Skipped **${track?.title}** — could not extract stream.`,
        })
        .catch(() => {});
    }
  });

  // Global debug logging
  player.on("debug" as any, (message: string) => {
    console.log(`[Music Debug] ${message}`);
  });
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

// ─── Helpers ─────────────────────────────────────────────────────────────

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

function requireQueue(
  interaction: ChatInputCommandInteraction,
  checkCurrentTrack: boolean = true,
): GuildQueue | null {
  const player = useMainPlayer();

  // Debug: log what queues exist vs what we're looking for
  const allQueueKeys = player.queues.cache.map((_, key) => key);
  console.log(
    `[Music Debug] requireQueue lookup — guildId: "${interaction.guildId}", existing queues: [${allQueueKeys.join(", ")}]`,
  );

  const queue = player.queues.get(interaction.guildId!);

  if (!queue) {
    console.log(
      `[Music Debug] No queue found for guild ${interaction.guildId}`,
    );
    interaction.editReply({ content: "❌ Nothing is currently playing." });
    return null;
  }

  // Debug log to help diagnose state issues
  console.log(
    `[Music Debug] Queue state: isPlaying=${queue.isPlaying()}, currentTrack=${!!queue.currentTrack}, tracks=${queue.tracks.size}, node.isPlaying=${queue.node.isPlaying()}`,
  );

  if (checkCurrentTrack && !queue.currentTrack) {
    // If specific track action is requested but no track is current
    interaction.editReply({ content: "❌ Nothing is currently playing." });
    return null;
  }

  return queue;
}

// ─── Command Handlers ────────────────────────────────────────────────────

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const member = requireVoiceChannel(interaction);
  if (!member) return;

  const query = interaction.options.getString("query", true);
  const settings = await getSettings(moduleManager, interaction.guildId!);
  const player = useMainPlayer();

  try {
    // Use YouTubei extractor for text queries; URLs are auto-detected regardless
    const isUrl = /^https?:\/\//i.test(query);
    const result = await player.play(member.voice.channel!, query, {
      searchEngine: isUrl
        ? QueryType.AUTO
        : `ext:${YoutubeiExtractor.identifier}`,
      nodeOptions: {
        metadata: { channel: interaction.channel },
        volume: settings.defaultVolume,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 60000,
      },
      requestedBy: interaction.user,
    });

    // Check max queue size
    const queue = player.queues.get(interaction.guildId!);
    if (queue && queue.tracks.size > settings.maxQueueSize) {
      await interaction.editReply({
        content: `⚠️ Queue limit reached (${settings.maxQueueSize} tracks). Remove some tracks first.`,
      });
      return;
    }

    const track = result.track;

    // Only show "Added to Queue" if the track was actually queued behind
    // other tracks. When it's the first track, the playerStart event will
    // fire and send the "Now Playing" embed — showing both is redundant.
    const wasQueued = queue && queue.tracks.size > 0;

    if (wasQueued) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Added to Queue")
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
          { name: "Duration", value: track.duration || "Live", inline: true },
          {
            name: "Position",
            value: `#${queue.tracks.size}`,
            inline: true,
          },
        )
        .setThumbnail(track.thumbnail || null);

      await interaction.editReply({ embeds: [embed] });
    } else {
      // First track — just confirm it's starting; "Now Playing" embed
      // will be sent by the playerStart event listener.
      await interaction.editReply({ content: "🎵 Loading track..." });
    }
  } catch (error: any) {
    console.error("[Music] Play error:", error);
    await interaction.editReply({
      content: `❌ Could not play: ${error.message}`,
    });
  }
}

async function handleSkip(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction);
  if (!queue) return;

  const current = queue.currentTrack;
  queue.node.skip();
  await interaction.editReply({
    content: `⏭️ Skipped **${current?.title || "current track"}**.`,
  });
}

async function handleStop(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction, false);
  if (!queue) return;

  // Reset nickname before deleting queue
  updateBotNickname(queue);

  queue.delete();
  // Force cleanup in case queue.delete() didn't catch everything due to metadata errors
  try {
    const player = useMainPlayer();
    if (queue.guild.id) player.queues.delete(queue.guild.id);
  } catch {}

  await interaction.editReply({
    content: "⏹️ Stopped playback and cleared the queue.",
  });
}

async function handlePause(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction, false);
  if (!queue) return;

  if (queue.node.isPaused()) {
    await interaction.editReply({ content: "⚠️ Already paused." });
    return;
  }

  queue.node.pause();
  await interaction.editReply({ content: "⏸️ Paused." });
}

async function handleResume(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction, false);
  if (!queue) return;

  if (!queue.node.isPaused()) {
    await interaction.editReply({ content: "⚠️ Not paused." });
    return;
  }

  queue.node.resume();
  await interaction.editReply({ content: "▶️ Resumed." });
}

async function handleQueue(interaction: ChatInputCommandInteraction) {
  const player = useMainPlayer();
  const queue = player.queues.get(interaction.guildId!);

  if (!queue || (!queue.isPlaying() && queue.tracks.size === 0)) {
    await interaction.editReply({ content: "📭 The queue is empty." });
    return;
  }

  const pageSize = 10;
  const page = (interaction.options.getInteger("page") || 1) - 1;
  const tracks = queue.tracks.toArray();
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
  const start = page * pageSize;
  const pageTracks = tracks.slice(start, start + pageSize);

  const current = queue.currentTrack;
  const lines: string[] = [];

  if (current) {
    lines.push(
      `**Now Playing:** [${current.title}](${current.url}) — \`${current.duration}\`\n`,
    );
  }

  if (pageTracks.length > 0) {
    pageTracks.forEach((track, i) => {
      lines.push(
        `**${start + i + 1}.** [${track.title}](${track.url}) — \`${track.duration}\``,
      );
    });
  } else if (page > 0) {
    lines.push("No tracks on this page.");
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Queue")
    .setDescription(lines.join("\n") || "Empty")
    .setFooter({
      text: `Page ${page + 1}/${totalPages} • ${tracks.length} tracks in queue`,
    });

  await interaction.editReply({ embeds: [embed] });
}

async function handleNowPlaying(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction);
  if (!queue) return;

  const track = queue.currentTrack;
  if (!track) {
    await interaction.editReply({ content: "❌ No track currently playing." });
    return;
  }

  const progress = queue.node.createProgressBar({
    timecodes: true,
    length: 15,
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎵 Now Playing")
    .setDescription(`**[${track.title}](${track.url})**\n\n${progress || ""}`)
    .addFields(
      { name: "Duration", value: track.duration || "Live", inline: true },
      { name: "Volume", value: `${queue.node.volume}%`, inline: true },
      { name: "Loop", value: loopModeToString(queue.repeatMode), inline: true },
    )
    .setThumbnail(track.thumbnail || null);

  await interaction.editReply({ embeds: [embed] });
}

async function handleVolume(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const queue = requireQueue(interaction, false);
  if (!queue) return;

  const level = interaction.options.getInteger("level", true);
  const oldVolume = queue.node.volume;

  // Clear any existing fade timer to prevent conflicts
  const metadata = queue.metadata as any;
  if (metadata?.volumeTimer) {
    clearInterval(metadata.volumeTimer);
    metadata.volumeTimer = null;
  }

  // If same volume, return early
  if (oldVolume === level) {
    await interaction.editReply({
      content: `🔊 Volume is already **${level}%**.`,
    });
    return;
  }

  // Persist the new volume setting for future sessions
  try {
    const settings = await getSettings(moduleManager, interaction.guildId!);
    settings.defaultVolume = level;
    await moduleManager.appwriteService.setModuleSettings(
      interaction.guildId!,
      "music",
      settings,
    );
  } catch (err) {
    console.error("[Music] Failed to save volume settings:", err);
  }

  await interaction.editReply({
    content: `🔊 Fading volume from **${oldVolume}%** to **${level}%**...`,
  });

  const steps = 20; // 20 steps
  const duration = 2000; // 2 seconds
  const interval = duration / steps;
  const stepSize = (level - oldVolume) / steps;

  let currentStep = 0;
  const timer = setInterval(() => {
    currentStep++;
    const newVol = Math.round(oldVolume + stepSize * currentStep);

    // Safety clamp
    const clampedVol = Math.max(0, Math.min(100, newVol));
    queue.node.setVolume(clampedVol);

    if (currentStep >= steps) {
      clearInterval(timer);
      if (metadata) metadata.volumeTimer = null;
      queue.node.setVolume(level); // Ensure final value is exact
    }
  }, interval);

  // Store timer in metadata
  if (metadata) {
    metadata.volumeTimer = timer;
  }
}

async function handleShuffle(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction, false);
  if (!queue) return;

  if (queue.tracks.size < 2) {
    await interaction.editReply({
      content: "⚠️ Not enough tracks to shuffle.",
    });
    return;
  }

  queue.tracks.shuffle();
  await interaction.editReply({ content: "🔀 Queue shuffled!" });
}

async function handleLoop(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction, false);
  if (!queue) return;

  const mode = interaction.options.getString("mode", true);
  const modeMap: Record<string, QueueRepeatMode> = {
    off: QueueRepeatMode.OFF,
    track: QueueRepeatMode.TRACK,
    queue: QueueRepeatMode.QUEUE,
  };

  queue.setRepeatMode(modeMap[mode]);
  await interaction.editReply({ content: `🔁 Loop mode set to **${mode}**.` });
}

async function handleSettings(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const settings = await getSettings(moduleManager, interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚙️ Music Settings")
    .setDescription(
      "Per-server music configuration. Change these from the web dashboard.",
    )
    .addFields(
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
        name: "Update Channel Topic",
        value: settings.updateChannelTopic ? "Yes" : "No",
        inline: true,
      },
    );

  await interaction.editReply({ embeds: [embed] });
}

function formatViews(views: number | undefined): string {
  if (!views || views <= 0) return "";
  if (views >= 1_000_000_000)
    return `${(views / 1_000_000_000).toFixed(1)}B views`;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
  return `${views} views`;
}

function loopModeToString(mode: QueueRepeatMode): string {
  switch (mode) {
    case QueueRepeatMode.TRACK:
      return "Track";
    case QueueRepeatMode.QUEUE:
      return "Queue";
    default:
      return "Off";
  }
}

// ─── Module Export ────────────────────────────────────────────────────────

const musicModule: BotModule = {
  name: "music",
  description:
    "Play music from YouTube, Spotify, and more with queue management.",
  deferReply: false, // We handle our own defer for public replies

  // Register all music commands as individual top-level commands
  commands: [
    playCommand.toJSON(),
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
  ],

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
    if (!query || query.length < 2) {
      try {
        await interaction.respond([]);
      } catch {
        /* expired */
      }
      return;
    }

    try {
      const player = useMainPlayer();
      // console.log(`[Music] Autocomplete search for: "${query}"`);

      // Race against a 2.0s timeout to prevent "Loading options failed" (Discord 3s limit)
      const searchPromise = player.search(query, {
        requestedBy: interaction.user,
        searchEngine: `ext:${YoutubeiExtractor.identifier}`,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Search timeout")), 2000),
      );

      const result = (await Promise.race([
        searchPromise,
        timeoutPromise,
      ])) as Awaited<ReturnType<typeof player.search>>;

      // console.log(`[Music] Search returned ${result?.tracks?.length} tracks`);

      if (!result || !result.tracks || result.tracks.length === 0) {
        try {
          await interaction.respond([]);
        } catch {
          /* ignore */
        }
        return;
      }

      // Robust view count parser
      const getViews = (t: any) => {
        const v = t.views;
        if (typeof v === "number") return v;
        if (typeof v === "string")
          return parseInt(v.replace(/[^0-9]/g, ""), 10) || 0;
        return 0;
      };

      // Sort by view count (most popular first)
      const sorted = [...result.tracks].sort(
        (a, b) => getViews(b) - getViews(a),
      );

      const choices = sorted.slice(0, 10).map((track) => {
        const views = formatViews(getViews(track));
        const label = views
          ? `${track.title} — ${track.duration} • ${views}`
          : `${track.title} — ${track.duration}`;

        let safeLabel = label;
        if (safeLabel.length > 100) {
          safeLabel = safeLabel.substring(0, 97) + "...";
        }

        return {
          name: safeLabel,
          value: track.url,
        };
      });

      await interaction.respond(choices);
    } catch (error: any) {
      // 10062 = Unknown interaction — expected when Discord expires the token during rapid typing
      if (error?.code === 10062) return;

      if (error.message === "Search timeout") {
        console.warn(`[Music] Autocomplete timed out for "${query}"`);
      } else {
        console.error(
          "[Music] Autocomplete search error:",
          error?.message || error,
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
    // Register player events on first use
    registerPlayerEvents();

    // Dispatch based on the top-level command name
    const commandName = interaction.commandName;

    switch (commandName) {
      case "play":
        return handlePlay(interaction, moduleManager);
      case "skip":
        return handleSkip(interaction);
      case "stop":
        return handleStop(interaction);
      case "pause":
        return handlePause(interaction);
      case "resume":
        return handleResume(interaction);
      case "queue":
        return handleQueue(interaction);
      case "nowplaying":
        return handleNowPlaying(interaction);
      case "volume":
        return handleVolume(interaction, moduleManager);
      case "shuffle":
        return handleShuffle(interaction);
      case "loop":
        return handleLoop(interaction);
      case "music-settings":
        return handleSettings(interaction, moduleManager);
      default:
        await interaction.editReply({ content: "❓ Unknown command." });
    }
  },
};

export default musicModule;
