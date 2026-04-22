# Server Dashboard Sidebar — Category Organization

**Status:** Approved
**Date:** 2026-04-22
**Scope:** [web/app/pages/dashboard/server/[guild_id].vue](../../../web/app/pages/dashboard/server/%5Bguild_id%5D.vue) sidebar, plus the shared sidebar composable and layout renderer.

## Problem

The per-server dashboard sidebar is a flat list of 20 modules with a handful of hand-placed visual separators. Finding a specific module requires scanning the entire list. Separators exist but are inconsistent and carry no labels, so the grouping they imply is invisible to a first-time viewer.

## Goal

Group modules into labeled categories so the sidebar is scannable at a glance and the purpose of each module is implied by its category. No loss of functionality; no new navigation surfaces.

## Non-goals

- Collapsible category state. Not worth the complexity at 20 items.
- Per-user reordering or customization.
- Category icons. Uppercase labels are sufficient.
- Touching the admin sidebar ([web/app/pages/dashboard/admin.vue](../../../web/app/pages/dashboard/admin.vue)). Different scope, different user, different problem.

## Final sidebar order

Top two items are navigation, not modules — they sit above the first category header with no label.

```
Server Logs
Modules

── MODERATION & SAFETY ──
  Moderation
  AutoMod
  Audit Logging
  Anti-Raid
  Verification

── ENGAGEMENT ──
  Welcome Image
  Reaction Roles
  Milestones
  Triggers
  Social Alerts

── COMMUNITY TOOLS ──
  Tickets
  Events
  Polls
  Embeds
  Tags

── VOICE & MEDIA ──
  Music
  Recording
  Temp Voice

── AI ──
  AI Assistant
```

## Data model change

[web/app/composables/useServerSidebar.ts](../../../web/app/composables/useServerSidebar.ts) — `ServerSidebarTab` interface:

- **Add** `groupLabel?: string` — when set, the renderer draws a category header immediately above this tab.
- **Keep** `separator?: boolean` — still used by [web/app/pages/dashboard/admin.vue](../../../web/app/pages/dashboard/admin.vue), which is out of scope for this change. Server sidebar stops setting it; admin continues to.

Final shape:

```ts
export interface ServerSidebarTab {
  id: string;
  label: string;
  icon: string;
  to?: string;
  badge?: string;
  disabled?: boolean;
  action?: () => void;
  separator?: boolean;
  groupLabel?: string;
}
```

## Renderer change

[web/app/layouts/default.vue](../../../web/app/layouts/default.vue) — sidebar iteration block (currently at lines 278–283).

Keep the existing `v-if="tab.separator"` hairline block (admin sidebar still uses it) and **add** a category-header block above it, rendered when `tab.groupLabel` is set:

```vue
<template v-for="tab in serverSidebar.tabs" :key="tab.id">
  <!-- Category header (new) -->
  <div
    v-if="tab.groupLabel"
    class="mt-4 mb-1 mx-3 pt-3 border-t border-white/5"
  >
    <span class="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
      {{ tab.groupLabel }}
    </span>
  </div>
  <!-- Plain separator (kept for admin sidebar) -->
  <div
    v-else-if="tab.separator"
    class="my-2 mx-3 border-t border-white/5"
  />
  <!-- existing NuxtLink + button tab rendering, unchanged -->
</template>
```

`v-else-if` guarantees a tab won't render both a header and a separator.

- Top margin (`mt-4`) visually separates categories.
- `border-t` provides the hairline; the label sits just under it.
- First category (Moderation & Safety) renders a top border above it, cleanly separating the top-level nav (Server Logs, Modules) from the categorized modules below.
- No top margin suppression needed for the first header because the gap above it is intentional.

## Sidebar definition change

[web/app/pages/dashboard/server/[guild_id].vue](../../../web/app/pages/dashboard/server/%5Bguild_id%5D.vue) — reorder the `sidebarTabs` array to match the final order above. Remove all three existing `separator: true` entries (lines 81, 88, 137) and set `groupLabel` on the first tab of each category instead.

`activeTab` computed (lines 42–66): the if-chain of `includes()` checks is order-independent for correctness but should be resorted to match the new visual order, so future edits stay consistent.

## Accessibility

The category label is visual grouping only, not an interactive control. A plain `<span>` is appropriate — no ARIA role needed. Screen reader users reach modules through the existing nav links unchanged.

## Testing

No automated test runner is wired up in this project (per [CLAUDE.md](../../../CLAUDE.md)). Verification is manual:

1. `cd web && pnpm run dev`
2. Navigate to `/dashboard/server/<any-guild-id>`
3. Confirm all 20 module links + Server Logs + Modules render in the documented order.
4. Confirm each category header renders with its label and hairline.
5. Click a module in each category; confirm active-tab highlighting still works.
6. Resize the sidebar / viewport; confirm labels remain readable.

## Files touched

1. [web/app/composables/useServerSidebar.ts](../../../web/app/composables/useServerSidebar.ts) — interface update.
2. [web/app/layouts/default.vue](../../../web/app/layouts/default.vue) — renderer template.
3. [web/app/pages/dashboard/server/[guild_id].vue](../../../web/app/pages/dashboard/server/%5Bguild_id%5D.vue) — tab order + `groupLabel` values + `activeTab` resort.

## Risk

Low. Purely presentational. Routes, components, and data flow unchanged. Rollback is a single revert.
