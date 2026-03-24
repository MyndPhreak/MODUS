/**
 * Shared types for the Tickets module.
 * Kept separate so handlers can import without creating circular deps.
 */

export type TicketPriority = "low" | "normal" | "high" | "critical";
export type TicketStatus = "open" | "claimed" | "closed";

export interface TicketMeta {
  ticketId: number;
  ownerId: string;
  typeId: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  claimedById: string | null;
  openedAt: string; // ISO timestamp
}

export const PRIORITY_CONFIG: Record<
  TicketPriority,
  { emoji: string; label: string; color: number }
> = {
  low:      { emoji: "🟢", label: "Low",      color: 0x57f287 },
  normal:   { emoji: "🔵", label: "Normal",   color: 0x5865f2 },
  high:     { emoji: "🟠", label: "High",     color: 0xfee75c },
  critical: { emoji: "🔴", label: "Critical", color: 0xed4245 },
};

/** Prefix used to embed ticket metadata in an embed footer.text field. */
export const META_PREFIX = "ticket-meta:";
