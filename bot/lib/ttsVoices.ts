export interface KokoroVoice {
  id: string;
  apiVoice: string;
  displayName: string;
  speed?: number;
}

export const KOKORO_VOICES: Record<string, KokoroVoice> = {
  KOKORO_AF_HEART: {
    id: "kokoro-af_heart",
    apiVoice: "af_heart",
    displayName: "Kokoro · Heart (American F)",
  },
  KOKORO_AF_BELLA: {
    id: "kokoro-af_bella",
    apiVoice: "af_bella",
    displayName: "Kokoro · Bella (American F)",
  },
  KOKORO_AF_NICOLE: {
    id: "kokoro-af_nicole",
    apiVoice: "af_nicole",
    displayName: "Kokoro · Nicole (American F)",
    speed: 1.25,
  },
  KOKORO_AF_AOEDE: {
    id: "kokoro-af_aoede",
    apiVoice: "af_aoede",
    displayName: "Kokoro · Aoede (American F)",
  },
  KOKORO_AF_KORE: {
    id: "kokoro-af_kore",
    apiVoice: "af_kore",
    displayName: "Kokoro · Kore (American F)",
  },
  KOKORO_AF_SARAH: {
    id: "kokoro-af_sarah",
    apiVoice: "af_sarah",
    displayName: "Kokoro · Sarah (American F)",
  },
  KOKORO_AF_ALLOY: {
    id: "kokoro-af_alloy",
    apiVoice: "af_alloy",
    displayName: "Kokoro · Alloy (American F)",
  },
  KOKORO_AF_NOVA: {
    id: "kokoro-af_nova",
    apiVoice: "af_nova",
    displayName: "Kokoro · Nova (American F)",
  },
  KOKORO_AM_FENRIR: {
    id: "kokoro-am_fenrir",
    apiVoice: "am_fenrir",
    displayName: "Kokoro · Fenrir (American M)",
  },
  KOKORO_AM_MICHAEL: {
    id: "kokoro-am_michael",
    apiVoice: "am_michael",
    displayName: "Kokoro · Michael (American M)",
  },
  KOKORO_AM_PUCK: {
    id: "kokoro-am_puck",
    apiVoice: "am_puck",
    displayName: "Kokoro · Puck (American M)",
  },
  KOKORO_BF_EMMA: {
    id: "kokoro-bf_emma",
    apiVoice: "bf_emma",
    displayName: "Kokoro · Emma (British F)",
  },
  KOKORO_BF_ISABELLA: {
    id: "kokoro-bf_isabella",
    apiVoice: "bf_isabella",
    displayName: "Kokoro · Isabella (British F)",
  },
  KOKORO_BM_FABLE: {
    id: "kokoro-bm_fable",
    apiVoice: "bm_fable",
    displayName: "Kokoro · Fable (British M)",
  },
  KOKORO_BM_GEORGE: {
    id: "kokoro-bm_george",
    apiVoice: "bm_george",
    displayName: "Kokoro · George (British M)",
  },
  KOKORO_FF_SIWIS: {
    id: "kokoro-ff_siwis",
    apiVoice: "ff_siwis",
    displayName: "Kokoro · Siwis (French F)",
  },
};

export const KOKORO_VOICE_LIST: KokoroVoice[] = Object.values(KOKORO_VOICES);

const BY_ID = new Map(KOKORO_VOICE_LIST.map((v) => [v.id, v]));

export function resolveVoice(id: string | undefined): KokoroVoice | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}
