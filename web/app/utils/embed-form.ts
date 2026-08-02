// Shared form shape for the embed editor/preview pair.

export interface EmbedFieldForm {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedButtonForm {
  label: string;
  url?: string;
  customId?: string;
  style?: "primary" | "secondary" | "success" | "danger" | "link";
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
  useContainer: boolean; // Card Container wrapper toggle (default true)
  buttons: EmbedButtonForm[]; // Array of interactive buttons
  mediaGallery: string[]; // Array of image URLs for MediaGalleryBuilder (max 4)
  buttonLabel?: string; // Legacy single button support
  buttonUrl?: string;
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
    useContainer: true,
    buttons: [],
    mediaGallery: [],
    buttonLabel: "",
    buttonUrl: "",
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
      form.footerText ||
      form.buttons.length > 0 ||
      form.mediaGallery.length > 0 ||
      form.buttonLabel,
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

// Serialize a form into the Discord embed JSON payload.
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

  // Components V2 properties
  embed.use_container = form.useContainer ?? true;

  if (form.mediaGallery && form.mediaGallery.length > 0) {
    embed.media_gallery = form.mediaGallery.filter((url) => Boolean(url.trim())).slice(0, 4);
  }

  if (form.buttons && form.buttons.length > 0) {
    embed.buttons = form.buttons.map((b) => ({
      label: b.label || "Button",
      url: b.url,
      custom_id: b.customId,
      style: b.style ?? "primary",
    }));
  } else if (form.buttonLabel) {
    embed.buttons = [
      {
        label: form.buttonLabel,
        url: form.buttonUrl,
        style: "primary",
      },
    ];
  }

  return embed;
}

// Hydrate a form from an embed JSON object (what the tags table stores).
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
  form.useContainer = data.use_container ?? true;

  if (Array.isArray(data.media_gallery)) {
    form.mediaGallery = data.media_gallery.filter((url: any) => typeof url === "string");
  }

  if (Array.isArray(data.buttons)) {
    form.buttons = data.buttons.map((b: any) => ({
      label: typeof b?.label === "string" ? b.label : "",
      url: typeof b?.url === "string" ? b.url : "",
      customId: typeof b?.custom_id === "string" ? b.custom_id : "",
      style: b?.style ?? "primary",
    }));
  } else if (typeof data.button_label === "string") {
    form.buttonLabel = data.button_label;
    form.buttonUrl = data.button_url ?? "";
    form.buttons = [{ label: data.button_label, url: data.button_url ?? "", style: "primary" }];
  }

  return form;
}



