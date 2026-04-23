<script setup lang="ts">
interface MentionLookup {
  users?: Record<string, string>;
  roles?: Record<string, string>;
  channels?: Record<string, string>;
}

type Segment =
  | { kind: "text"; value: string }
  | { kind: "user" | "role" | "channel"; id: string; name: string }
  | { kind: "time"; value: string };

const props = defineProps<{
  content: string;
  mentions?: MentionLookup | null;
}>();

// `<@id>` / `<@!id>` users, `<@&id>` roles, `<#id>` channels,
// `<t:unix[:style]>` Discord timestamps.
const TOKEN_RE =
  /<(@!?|@&|#)(\d{15,25})>|<t:(-?\d{1,13})(?::([tTdDfFR]))?>/g;

const segments = computed<Segment[]>(() => {
  const out: Segment[] = [];
  const text = props.content ?? "";
  const lookup = props.mentions ?? {};
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", value: text.slice(last, m.index) });
    }
    if (m[1] && m[2]) {
      const kind = m[1];
      const id = m[2];
      if (kind === "@&") {
        out.push({
          kind: "role",
          id,
          name: lookup.roles?.[id] ?? `role ${id}`,
        });
      } else if (kind === "#") {
        out.push({
          kind: "channel",
          id,
          name: lookup.channels?.[id] ?? `channel ${id}`,
        });
      } else {
        out.push({
          kind: "user",
          id,
          name: lookup.users?.[id] ?? `user ${id}`,
        });
      }
    } else if (m[3]) {
      out.push({ kind: "time", value: formatDiscordTime(m[3], m[4]) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ kind: "text", value: text.slice(last) });
  }
  return out;
});

function formatDiscordTime(unix: string, style?: string): string {
  const ms = Number(unix) * 1000;
  if (!Number.isFinite(ms)) return `<t:${unix}>`;
  const d = new Date(ms);
  switch (style) {
    case "t":
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    case "T":
      return d.toLocaleTimeString();
    case "d":
      return d.toLocaleDateString();
    case "D":
      return d.toLocaleDateString([], { dateStyle: "long" } as any);
    case "F":
      return d.toLocaleString([], {
        dateStyle: "full",
        timeStyle: "short",
      } as any);
    case "R":
      return formatRelative(ms);
    case "f":
    default:
      return d.toLocaleString();
  }
}

function formatRelative(ms: number): string {
  const diff = ms - Date.now();
  const absSec = Math.round(Math.abs(diff) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const table: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
    [Infinity, "year"],
  ];
  const divisors: Record<Intl.RelativeTimeFormatUnit, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2629800,
    quarter: 7889400,
    year: 31557600,
  };
  for (const [limit, unit] of table) {
    if (absSec < limit) {
      const v = Math.round(diff / 1000 / divisors[unit]);
      return rtf.format(v, unit);
    }
  }
  return new Date(ms).toLocaleString();
}
</script>

<template>
  <div class="whitespace-pre-wrap">
    <template v-for="(s, i) in segments" :key="i">
      <span v-if="s.kind === 'text'">{{ s.value }}</span>
      <span
        v-else-if="s.kind === 'user'"
        class="rounded bg-indigo-500/20 px-1 text-indigo-200"
        :title="s.id"
      >@{{ s.name }}</span>
      <span
        v-else-if="s.kind === 'role'"
        class="rounded bg-pink-500/20 px-1 text-pink-200"
        :title="s.id"
      >@{{ s.name }}</span>
      <span
        v-else-if="s.kind === 'channel'"
        class="rounded bg-sky-500/20 px-1 text-sky-200"
        :title="s.id"
      >#{{ s.name }}</span>
      <span
        v-else-if="s.kind === 'time'"
        class="rounded bg-white/10 px-1 text-gray-200"
      >{{ s.value }}</span>
    </template>
  </div>
</template>
