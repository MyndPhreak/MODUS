// Shared form shape for the embed editor/preview pair.
//
// Both pages (embed builder + tags editor) operate on the same reactive
// object so we can swap in `<EmbedEditor v-model>` without each caller
// reinventing the field set. `toEmbedPayload` serializes this to the
// Discord-embed JSON shape we send to /api/discord/send-embed; `fromEmbedData`
// does the reverse for edit mode.

export interface EmbedFieldForm {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedForm {
  title: string;
  url: string;
  description: string;
  color: string; // hex like "#5865f2"
  authorName: string;
  authorUrl: string;
  authorIconUrl: string;
  fields: EmbedFieldForm[];
  imageUrl: string;
  thumbnailUrl: string;
  footerText: string;
  footerIconUrl: string;
  showTimestamp: boolean;
}

export const DEFAULT_EMBED_COLOR = "#5865f2";

export function emptyEmbedForm(): EmbedForm {
  return {
    title: "",
    url: "",
    description: "",
    color: DEFAULT_EMBED_COLOR,
    authorName: "",
    authorUrl: "",
    authorIconUrl: "",
    fields: [],
    imageUrl: "",
    thumbnailUrl: "",
    footerText: "",
    footerIconUrl: "",
    showTimestamp: false,
  };
}

export function hasEmbedContent(form: EmbedForm): boolean {
  return Boolean(
    form.title ||
      form.description ||
      form.fields.length > 0 ||
      form.authorName ||
      form.imageUrl ||
      form.thumbnailUrl ||
      form.footerText,
  );
}

// Color <-> int helpers. Discord stores color as an integer; the form uses hex.
export function colorHexToInt(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return isNaN(n) ? 0x5865f2 : n;
}

export function colorIntToHex(n: number | undefined | null): string {
  if (n === undefined || n === null) return DEFAULT_EMBED_COLOR;
  return `#${n.toString(16).padStart(6, "0")}`;
}

// Serialize a form into the Discord embed JSON payload. Fields with empty
// names/values are normalized to a zero-width space so Discord still renders
// the field — otherwise it'd reject the embed.
export function toEmbedPayload(form: EmbedForm): Record<string, any> {
  const embed: Record<string, any> = { color: colorHexToInt(form.color) };
  if (form.title) embed.title = form.title;
  if (form.description) embed.description = form.description;
  if (form.url) embed.url = form.url;

  if (form.authorName) {
    embed.author = { name: form.authorName };
    if (form.authorUrl) embed.author.url = form.authorUrl;
    if (form.authorIconUrl) embed.author.icon_url = form.authorIconUrl;
  }

  if (form.fields.length > 0) {
    embed.fields = form.fields.map((f) => ({
      name: f.name || "​",
      value: f.value || "​",
      inline: f.inline,
    }));
  }

  if (form.imageUrl) embed.image = { url: form.imageUrl };
  if (form.thumbnailUrl) embed.thumbnail = { url: form.thumbnailUrl };

  if (form.footerText) {
    embed.footer = { text: form.footerText };
    if (form.footerIconUrl) embed.footer.icon_url = form.footerIconUrl;
  }

  if (form.showTimestamp) embed.timestamp = true;

  return embed;
}

// Hydrate a form from an embed JSON object (what the tags table stores).
// `embedData` may be a JSON string (the tags API shape) or an already-parsed
// object — we accept both.
export function fromEmbedData(embedData: unknown): EmbedForm {
  const form = emptyEmbedForm();
  if (!embedData) return form;

  let data: any = embedData;
  if (typeof embedData === "string") {
    try {
      data = JSON.parse(embedData);
    } catch {
      return form;
    }
  }

  if (!data || typeof data !== "object") return form;

  if (typeof data.title === "string") form.title = data.title;
  if (typeof data.url === "string") form.url = data.url;
  if (typeof data.description === "string") form.description = data.description;
  if (typeof data.color === "number") form.color = colorIntToHex(data.color);

  if (data.author && typeof data.author === "object") {
    form.authorName = data.author.name ?? "";
    form.authorUrl = data.author.url ?? "";
    form.authorIconUrl = data.author.icon_url ?? "";
  }

  if (Array.isArray(data.fields)) {
    form.fields = data.fields.map((f: any) => ({
      name: typeof f?.name === "string" ? f.name : "",
      value: typeof f?.value === "string" ? f.value : "",
      inline: Boolean(f?.inline),
    }));
  }

  if (data.image?.url) form.imageUrl = data.image.url;
  if (data.thumbnail?.url) form.thumbnailUrl = data.thumbnail.url;

  if (data.footer && typeof data.footer === "object") {
    form.footerText = data.footer.text ?? "";
    form.footerIconUrl = data.footer.icon_url ?? "";
  }

  form.showTimestamp = Boolean(data.timestamp);

  return form;
}
