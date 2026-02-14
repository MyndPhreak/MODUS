import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  TextChannel,
  AttachmentBuilder,
  ChannelType,
} from "discord.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { BotModule, ModuleManager } from "../ModuleManager";

// ── Types ──────────────────────────────────────────────────────────

export interface TemplateElement {
  id: string;
  type: "text" | "image" | "rect" | "circle" | "avatar";
  x: number;
  y: number;
  width?: number;
  height?: number;
  // Text props
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fill?: string;
  align?: string;
  stroke?: string;
  strokeWidth?: number;
  // Rect/Circle props
  cornerRadius?: number;
  opacity?: number;
  // Image props
  src?: string;
  // Avatar
  radius?: number;
  borderColor?: string;
  borderWidth?: number;
  // Rotation
  rotation?: number;
  // Shadow
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface WelcomeTemplate {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundImage?: string;
  elements: TemplateElement[];
  channelId?: string;
}

// ── Default Template ───────────────────────────────────────────────

export const DEFAULT_TEMPLATE: WelcomeTemplate = {
  canvasWidth: 1024,
  canvasHeight: 500,
  backgroundColor: "#1a1a2e",
  elements: [
    {
      id: "bg-overlay",
      type: "rect",
      x: 0,
      y: 0,
      width: 1024,
      height: 500,
      fill: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
      opacity: 1,
    },
    {
      id: "decoration-top",
      type: "rect",
      x: 0,
      y: 0,
      width: 1024,
      height: 4,
      fill: "linear-gradient(90deg, #6366f1, #a78bfa, #c084fc)",
      opacity: 1,
    },
    {
      id: "avatar",
      type: "avatar",
      x: 512,
      y: 155,
      radius: 80,
      borderColor: "#a78bfa",
      borderWidth: 4,
    },
    {
      id: "welcome-label",
      type: "text",
      x: 512,
      y: 280,
      text: "WELCOME",
      fontSize: 44,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#ffffff",
      align: "center",
    },
    {
      id: "username-text",
      type: "text",
      x: 512,
      y: 340,
      text: "{username}",
      fontSize: 30,
      fontFamily: "sans-serif",
      fill: "#a78bfa",
      align: "center",
    },
    {
      id: "server-text",
      type: "text",
      x: 512,
      y: 395,
      text: "to {server_name}",
      fontSize: 20,
      fontFamily: "sans-serif",
      fill: "#9ca3af",
      align: "center",
    },
    {
      id: "member-count",
      type: "text",
      x: 512,
      y: 450,
      text: "Member #{member_count}",
      fontSize: 16,
      fontFamily: "sans-serif",
      fill: "#6b7280",
      align: "center",
    },
  ],
};

// ── Placeholder Resolution ─────────────────────────────────────────

function resolvePlaceholders(text: string, member: GuildMember): string {
  return text
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{displayname\}/g, member.displayName)
    .replace(/\{tag\}/g, member.user.tag)
    .replace(/\{server_name\}/g, member.guild.name)
    .replace(/\{member_count\}/g, String(member.guild.memberCount));
}

// ── Gradient Parsing ───────────────────────────────────────────────

function parseGradient(
  ctx: any,
  gradientStr: string,
  x: number,
  y: number,
  width: number,
  height: number,
): any {
  const match = gradientStr.match(/linear-gradient\(([^)]+)\)/);
  if (!match) return gradientStr;

  const parts = match[1].split(",").map((s: string) => s.trim());
  const angleDeg = parseFloat(parts[0]) || 0;
  const angleRad = (angleDeg * Math.PI) / 180;

  const cx = x + width / 2;
  const cy = y + height / 2;
  const x0 = cx - (Math.cos(angleRad) * width) / 2;
  const y0 = cy - (Math.sin(angleRad) * height) / 2;
  const x1 = cx + (Math.cos(angleRad) * width) / 2;
  const y1 = cy + (Math.sin(angleRad) * height) / 2;

  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  const colors = parts.slice(1);
  colors.forEach((color: string, i: number) => {
    gradient.addColorStop(i / Math.max(colors.length - 1, 1), color);
  });

  return gradient;
}

// ── Image Renderer ─────────────────────────────────────────────────

export async function renderWelcomeImage(
  template: WelcomeTemplate,
  member: GuildMember,
): Promise<Buffer> {
  const { canvasWidth, canvasHeight } = template;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = template.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Background image
  if (template.backgroundImage) {
    try {
      const bgImage = await loadImage(template.backgroundImage);
      ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    } catch (err) {
      console.warn("[Welcome] Failed to load background image:", err);
    }
  }

  // Load avatar once
  let avatarImage: any = null;
  const avatarUrl = member.user.displayAvatarURL({
    extension: "png",
    size: 256,
  });
  try {
    avatarImage = await loadImage(avatarUrl);
  } catch (err) {
    console.warn("[Welcome] Failed to load avatar:", err);
  }

  // Render elements
  for (const el of template.elements) {
    ctx.save();

    if (el.rotation) {
      ctx.translate(el.x, el.y);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-el.x, -el.y);
    }

    if (el.opacity !== undefined && el.opacity < 1) {
      ctx.globalAlpha = el.opacity;
    }

    if (el.shadowColor) {
      ctx.shadowColor = el.shadowColor;
      ctx.shadowBlur = el.shadowBlur || 0;
      ctx.shadowOffsetX = el.shadowOffsetX || 0;
      ctx.shadowOffsetY = el.shadowOffsetY || 0;
    }

    switch (el.type) {
      case "rect": {
        const w = el.width || 100;
        const h = el.height || 100;
        const fillValue = el.fill || "#ffffff";

        if (fillValue.startsWith("linear-gradient")) {
          ctx.fillStyle = parseGradient(ctx, fillValue, el.x, el.y, w, h);
        } else {
          ctx.fillStyle = fillValue;
        }

        if (el.cornerRadius) {
          const r = el.cornerRadius;
          ctx.beginPath();
          ctx.moveTo(el.x + r, el.y);
          ctx.lineTo(el.x + w - r, el.y);
          ctx.quadraticCurveTo(el.x + w, el.y, el.x + w, el.y + r);
          ctx.lineTo(el.x + w, el.y + h - r);
          ctx.quadraticCurveTo(el.x + w, el.y + h, el.x + w - r, el.y + h);
          ctx.lineTo(el.x + r, el.y + h);
          ctx.quadraticCurveTo(el.x, el.y + h, el.x, el.y + h - r);
          ctx.lineTo(el.x, el.y + r);
          ctx.quadraticCurveTo(el.x, el.y, el.x + r, el.y);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(el.x, el.y, w, h);
        }

        if (el.stroke) {
          ctx.strokeStyle = el.stroke;
          ctx.lineWidth = el.strokeWidth || 1;
          if (el.cornerRadius) {
            ctx.stroke();
          } else {
            ctx.strokeRect(el.x, el.y, w, h);
          }
        }
        break;
      }

      case "circle": {
        const radius = el.radius || 50;
        ctx.fillStyle = el.fill || "#ffffff";
        ctx.beginPath();
        ctx.arc(el.x, el.y, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();

        if (el.stroke) {
          ctx.strokeStyle = el.stroke;
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.stroke();
        }
        break;
      }

      case "text": {
        const resolvedText = resolvePlaceholders(el.text || "", member);
        const style = el.fontStyle || "";
        const size = el.fontSize || 24;
        const family = el.fontFamily || "sans-serif";
        ctx.font = `${style} ${size}px ${family}`.trim();
        ctx.fillStyle = el.fill || "#ffffff";
        ctx.textAlign = (el.align as CanvasTextAlign) || "center";
        ctx.textBaseline = "middle";
        ctx.fillText(resolvedText, el.x, el.y);

        if (el.stroke) {
          ctx.strokeStyle = el.stroke;
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.strokeText(resolvedText, el.x, el.y);
        }
        break;
      }

      case "avatar": {
        if (!avatarImage) break;
        const r = el.radius || 64;

        // Border
        if (el.borderWidth && el.borderColor) {
          ctx.fillStyle = el.borderColor;
          ctx.beginPath();
          ctx.arc(el.x, el.y, r + el.borderWidth, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fill();
        }

        // Clip + draw avatar
        ctx.beginPath();
        ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImage, el.x - r, el.y - r, r * 2, r * 2);
        break;
      }

      case "image": {
        if (el.src) {
          try {
            const img = await loadImage(el.src);
            ctx.drawImage(
              img,
              el.x,
              el.y,
              el.width || img.width,
              el.height || img.height,
            );
          } catch (err) {
            console.warn("[Welcome] Failed to load element image:", err);
          }
        }
        break;
      }
    }

    ctx.restore();
  }

  const pngData = await canvas.encode("png");
  return Buffer.from(pngData);
}

// ── Module Definition ──────────────────────────────────────────────

const welcomeModule: BotModule = {
  name: "welcome",
  description: "Send beautiful welcome images when new members join",
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure the welcome image module")
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Set the channel for welcome messages")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The channel to send welcome images to")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Send a test welcome image for yourself"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable welcome messages for this server"),
    )
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const appwrite = moduleManager.appwriteService;

    switch (subcommand) {
      case "channel": {
        const channel = interaction.options.getChannel("channel", true);

        // Load current settings and update channelId
        const currentSettings = await appwrite.getModuleSettings(
          guildId,
          "welcome",
        );
        const template = {
          ...DEFAULT_TEMPLATE,
          ...currentSettings,
          channelId: channel.id,
        };

        await appwrite.setModuleSettings(guildId, "welcome", template);

        await interaction.editReply(
          `✅ Welcome messages will be sent to <#${channel.id}>!`,
        );
        break;
      }

      case "test": {
        try {
          const member = interaction.member as GuildMember;

          // Load template
          const currentSettings = await appwrite.getModuleSettings(
            guildId,
            "welcome",
          );
          const template: WelcomeTemplate = {
            ...DEFAULT_TEMPLATE,
            ...currentSettings,
          };

          const imageBuffer = await renderWelcomeImage(template, member);
          const attachment = new AttachmentBuilder(imageBuffer, {
            name: "welcome-test.png",
          });

          await interaction.editReply({
            content: "Here's a preview of your welcome image:",
            files: [attachment],
          });
        } catch (err) {
          console.error("[Welcome] Error generating test image:", err);
          await interaction.editReply(
            "❌ Failed to generate test image. Please try again.",
          );
        }
        break;
      }

      case "disable": {
        await appwrite.setModuleStatus(guildId, "welcome", false);
        await interaction.editReply("✅ Welcome messages have been disabled.");
        break;
      }
    }
  },
};

// ── Event Registration ─────────────────────────────────────────────

export function registerWelcomeEvents(moduleManager: ModuleManager) {
  const client = moduleManager["client"];

  client.on("guildMemberAdd", async (member: GuildMember) => {
    try {
      const guildId = member.guild.id;
      const appwrite = moduleManager.appwriteService;

      // Check if module is enabled
      const isEnabled = await appwrite.isModuleEnabled(guildId, "welcome");
      if (!isEnabled) return;

      // Load template
      const settings = await appwrite.getModuleSettings(guildId, "welcome");
      if (!settings || !settings.channelId) return;

      const template: WelcomeTemplate = {
        ...DEFAULT_TEMPLATE,
        ...settings,
      };

      // Get channel
      const channel = member.guild.channels.cache.get(template.channelId!);
      if (!channel || !(channel instanceof TextChannel)) return;

      // Render and send
      const imageBuffer = await renderWelcomeImage(template, member);
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: "welcome.png",
      });

      await channel.send({
        content: `Welcome to **${member.guild.name}**, ${member}! 🎉`,
        files: [attachment],
      });

      moduleManager.logger.info(
        `Sent welcome image for ${member.user.tag}`,
        guildId,
        "welcome",
      );
    } catch (err) {
      console.error("[Welcome] Error handling guildMemberAdd:", err);
      moduleManager.logger.error(
        `Failed to send welcome image: ${err}`,
        member.guild.id,
        "welcome",
      );
    }
  });

  console.log("[Welcome] guildMemberAdd event listener registered.");
}

export default welcomeModule;
