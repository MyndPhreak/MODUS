/**
 * bot/lib/components-v2.ts
 *
 * Core Discord Components V2 layout engine for MODUS.
 * Provides helper functions for constructing modern, state-of-the-art
 * V2 message layouts using ContainerBuilder, TextDisplayBuilder,
 * SectionBuilder, SeparatorBuilder, ThumbnailBuilder, and interactive components.
 */

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  EmbedBuilder,
  type AnyComponentBuilder,
  type APIEmbed,
} from "discord.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface V2SectionOptions {
  title?: string;
  body?: string;
  thumbnailUrl?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  buttonCustomId?: string;
  buttonStyle?: ButtonStyle;
}

export interface V2FieldOptions {
  name: string;
  value: string;
  inline?: boolean;
}

export interface V2ButtonOptions {
  label: string;
  url?: string;
  customId?: string;
  style?: ButtonStyle;
}

export interface V2SelectMenuOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
}

export interface V2SelectMenuOptions {
  customId?: string;
  placeholder?: string;
  options: V2SelectMenuOption[];
}

export interface V2CardOptions {
  title?: string;
  description?: string;
  color?: number;
  thumbnailUrl?: string;
  fields?: V2FieldOptions[];
  footer?: string;
  mediaGallery?: string[]; // Array of media URLs for MediaGalleryBuilder (max 4)
  buttons?: V2ButtonOptions[]; // Interactive buttons
  selectMenus?: V2SelectMenuOptions[]; // Interactive select menu dropdowns
  buttonLabel?: string; // Legacy single button support
  buttonUrl?: string;
  buttonCustomId?: string;
  buttonStyle?: ButtonStyle;
  useContainer?: boolean; // Default true (wraps in ContainerBuilder)
  components?: any[]; // Additional interactive components (select menus, action rows, buttons)
}

// ── V2 Builders ──────────────────────────────────────────────────────────────

/**
 * Creates a TextDisplayBuilder with formatted markdown text.
 */
export function createV2Text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

/**
 * Creates a SeparatorBuilder (horizontal divider or spacing).
 */
export function createV2Separator(
  divider = true,
  spacing: SeparatorSpacingSize = SeparatorSpacingSize.Small,
): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(divider).setSpacing(spacing);
}

/**
 * Creates a SectionBuilder containing text display components and a required accessory
 * (ThumbnailBuilder or ButtonBuilder).
 */
export function createV2Section(options: V2SectionOptions): SectionBuilder {
  const section = new SectionBuilder();

  const textComponents: TextDisplayBuilder[] = [];
  if (options.title) {
    textComponents.push(new TextDisplayBuilder().setContent(`**${options.title}**`));
  }
  if (options.body && options.body.trim()) {
    textComponents.push(new TextDisplayBuilder().setContent(options.body));
  }
  if (textComponents.length === 0) {
    // A Section requires at least one text component.
    textComponents.push(new TextDisplayBuilder().setContent("​"));
  }

  section.addTextDisplayComponents(...textComponents);

  if (options.thumbnailUrl && /^https?:\/\//.test(options.thumbnailUrl.trim())) {
    const thumb = new ThumbnailBuilder({
      media: { url: options.thumbnailUrl.trim() },
    });
    section.setThumbnailAccessory(thumb);
  } else if (options.buttonLabel) {
    const btn = new ButtonBuilder().setLabel(options.buttonLabel);
    if (options.buttonUrl) {
      btn.setURL(options.buttonUrl).setStyle(ButtonStyle.Link);
    } else if (options.buttonCustomId) {
      btn.setCustomId(options.buttonCustomId).setStyle(options.buttonStyle ?? ButtonStyle.Primary);
    }
    section.setButtonAccessory(btn);
  } else if (options.thumbnailUrl) {
    const thumb = new ThumbnailBuilder({ media: { url: options.thumbnailUrl } });
    section.setThumbnailAccessory(thumb);
  } else {
    // Fallback thumbnail placeholder if no accessory specified to satisfy SectionBuilder requirement
    const defaultThumb = new ThumbnailBuilder({
      media: { url: "https://cdn.discordapp.com/embed/avatars/0.png" },
    });
    section.setThumbnailAccessory(defaultThumb);
  }

  return section;
}

/**
 * Parses markdown text for `---` line dividers and splits it into alternating
 * TextDisplayBuilder and native SeparatorBuilder components ({ type: 14, divider: true, spacing: 1 }).
 */
export function parseTextWithSeparators(content: string): (TextDisplayBuilder | SeparatorBuilder)[] {
  if (!content || !content.trim()) return [];
  const parts = content.split(/(?:\r?\n|^)\s*(?:---|[*]{3,})\s*(?:\r?\n|$)/);
  const result: (TextDisplayBuilder | SeparatorBuilder)[] = [];

  for (let i = 0; i < parts.length; i++) {
    const textPart = parts[i].trim();
    if (textPart.length > 0) {
      result.push(createV2Text(textPart));
    }
    if (i < parts.length - 1) {
      result.push(createV2Separator(true, SeparatorSpacingSize.Small));
    }
  }

  return result;
}

/**
 * Builds a complete V2 message layout payload.
 *
 * If `useContainer` is true (default), returns `[ContainerBuilder]` (Type 17).
 * If `useContainer` is false, returns `[...components]` at root level.
 */
export function buildV2Layout(options: V2CardOptions): any[] {
  const useContainer = options.useContainer ?? true;
  const elements: any[] = [];

  // Title & Description Header
  // When a thumbnail is present, the title/description become the text of
  // the same Section the thumbnail is attached to (as Discord's Section
  // component intends — rich text beside an accessory). Splitting them into
  // a header block plus a separate placeholder-labeled Section ("Overview")
  // left the thumbnail sitting next to near-empty filler text.
  if (options.thumbnailUrl && (options.title || options.description)) {
    const section = createV2Section({
      title: options.title,
      body: options.description,
      thumbnailUrl: options.thumbnailUrl,
    });
    elements.push(section);
  } else if (options.thumbnailUrl) {
    const section = createV2Section({
      body: "Details",
      thumbnailUrl: options.thumbnailUrl,
    });
    elements.push(section);
  } else if (options.title || options.description) {
    let headerText = "";
    if (options.title) headerText += `# ${options.title}\n`;
    if (options.description) headerText += options.description;

    const parsedBlocks = parseTextWithSeparators(headerText.trim());
    elements.push(...parsedBlocks);
  }

  // Fields
  if (options.fields && options.fields.length > 0) {
    elements.push(createV2Separator(true, SeparatorSpacingSize.Small));
    for (const field of options.fields) {
      elements.push(createV2Text(`**${field.name}**\n${field.value}`));
    }
  }

  // Media Gallery (Type 12)
  if (options.mediaGallery && options.mediaGallery.length > 0) {
    elements.push(createV2Separator(true, SeparatorSpacingSize.Small));
    const galleryItems = options.mediaGallery
      .filter((url) => /^https?:\/\//.test(url.trim()))
      .slice(0, 4)
      .map((url) => new MediaGalleryItemBuilder({ media: { url: url.trim() } }));

    if (galleryItems.length > 0) {
      const gallery = new MediaGalleryBuilder().addItems(...galleryItems);
      elements.push(gallery);
    }
  }

  // Interactive Buttons
  if (options.buttons && options.buttons.length > 0) {
    elements.push(createV2Separator(true, SeparatorSpacingSize.Small));
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const b of options.buttons.slice(0, 5)) {
      if (!b.label) continue;
      const btn = new ButtonBuilder().setLabel(b.label);
      if (b.url) {
        btn.setURL(b.url).setStyle(ButtonStyle.Link);
      } else {
        btn.setCustomId(b.customId || `btn_${Math.random().toString(36).substring(2, 7)}`).setStyle(b.style ?? ButtonStyle.Primary);
      }
      row.addComponents(btn);
    }
    if (row.components.length > 0) {
      elements.push(row);
    }
  } else if (options.buttonLabel) {
    elements.push(createV2Separator(true, SeparatorSpacingSize.Small));
    const btnSection = createV2Section({
      body: options.title ?? "Action",
      buttonLabel: options.buttonLabel,
      buttonUrl: options.buttonUrl,
      buttonCustomId: options.buttonCustomId,
      buttonStyle: options.buttonStyle,
    });
    elements.push(btnSection);
  }

  // Select Menu Dropdowns
  if (options.selectMenus && options.selectMenus.length > 0) {
    for (const sm of options.selectMenus) {
      if (!sm.options || sm.options.length === 0) continue;
      elements.push(createV2Separator(true, SeparatorSpacingSize.Small));
      const menu = new StringSelectMenuBuilder()
        .setCustomId(sm.customId || `select_${Math.random().toString(36).substring(2, 7)}`)
        .setPlaceholder(sm.placeholder || "Select an option...");

      for (const opt of sm.options.slice(0, 25)) {
        const optionBuilder = new StringSelectMenuOptionBuilder()
          .setLabel(opt.label || "Option")
          .setValue(opt.value || opt.label || "val");
        if (opt.description) optionBuilder.setDescription(opt.description);
        if (opt.emoji) optionBuilder.setEmoji(opt.emoji);
        menu.addOptions(optionBuilder);
      }

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
      elements.push(row);
    }
  }

  // Footer
  if (options.footer) {
    elements.push(createV2Separator(true, SeparatorSpacingSize.Small));
    elements.push(createV2Text(`*${options.footer}*`));
  }

  // Additional custom components (select menus, custom rows)
  if (options.components && options.components.length > 0) {
    elements.push(...options.components);
  }

  // Ensure elements is not empty
  if (elements.length === 0) {
    elements.push(createV2Text("*(Empty message)*"));
  }

  if (useContainer) {
    const container = new ContainerBuilder();
    for (const el of elements) {
      if (el instanceof TextDisplayBuilder) {
        container.addTextDisplayComponents(el);
      } else if (el instanceof SeparatorBuilder) {
        container.addSeparatorComponents(el);
      } else if (el instanceof SectionBuilder) {
        container.addSectionComponents(el);
      } else if (el instanceof MediaGalleryBuilder) {
        container.addMediaGalleryComponents(el);
      } else if (el instanceof ActionRowBuilder) {
        container.addActionRowComponents(el as any);
      }
    }
    return [container];
  }

  return elements;
}

/**
 * Converts a classic EmbedBuilder or APIEmbed into a V2 Container or root component array.
 */
export function embedToV2Layout(
  embed: EmbedBuilder | APIEmbed,
  useContainer = true,
): any[] {
  const data = embed instanceof EmbedBuilder ? embed.data : embed;

  const fields: V2FieldOptions[] = (data.fields ?? []).map((f) => ({
    name: f.name,
    value: f.value,
    inline: f.inline,
  }));

  return buildV2Layout({
    title: data.title ?? undefined,
    description: data.description ?? undefined,
    color: data.color ?? undefined,
    thumbnailUrl: data.thumbnail?.url ?? undefined,
    fields,
    footer: data.footer?.text ?? undefined,
    useContainer,
  });
}

