/**
 * TempVoiceChannelRepository — ephemeral per-user voice rooms.
 *
 * Keyed by `channel_id` since that's the Discord-side identifier the bot
 * already holds. The Appwrite equivalent did a list-then-delete dance;
 * Postgres lets us target the row directly.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { tempVoiceChannels, type TempVoiceChannel } from "../schema";

export type TempVoiceChannelDoc = TempVoiceChannel & {
  $id: string;
  guild_id: string;
  channel_id: string;
  owner_id: string;
  lobby_channel_id: string;
};

function toDoc(row: TempVoiceChannel): TempVoiceChannelDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    channel_id: row.channelId,
    owner_id: row.ownerId,
    lobby_channel_id: row.lobbyChannelId,
  };
}

export class TempVoiceChannelRepository {
  constructor(private db: Database) {}

  async create(data: {
    guild_id: string;
    channel_id: string;
    owner_id: string;
    lobby_channel_id: string;
  }): Promise<string> {
    const [row] = await this.db
      .insert(tempVoiceChannels)
      .values({
        guildId: data.guild_id,
        channelId: data.channel_id,
        ownerId: data.owner_id,
        lobbyChannelId: data.lobby_channel_id,
      })
      .returning({ id: tempVoiceChannels.id });
    return row.id;
  }

  async deleteByChannelId(channelId: string): Promise<void> {
    await this.db
      .delete(tempVoiceChannels)
      .where(eq(tempVoiceChannels.channelId, channelId));
  }

  async listByGuild(guildId: string): Promise<TempVoiceChannelDoc[]> {
    const rows = await this.db
      .select()
      .from(tempVoiceChannels)
      .where(eq(tempVoiceChannels.guildId, guildId));
    return rows.map(toDoc);
  }

  async listAll(): Promise<TempVoiceChannelDoc[]> {
    const rows = await this.db.select().from(tempVoiceChannels);
    return rows.map(toDoc);
  }

  async updateOwner(channelId: string, newOwnerId: string): Promise<void> {
    await this.db
      .update(tempVoiceChannels)
      .set({ ownerId: newOwnerId })
      .where(eq(tempVoiceChannels.channelId, channelId));
  }

  async upsertMigrated(input: {
    id: string;
    guild_id: string;
    channel_id: string;
    owner_id: string;
    lobby_channel_id: string;
    createdAt?: string | Date;
  }): Promise<void> {
    await this.db
      .insert(tempVoiceChannels)
      .values({
        id: input.id,
        guildId: input.guild_id,
        channelId: input.channel_id,
        ownerId: input.owner_id,
        lobbyChannelId: input.lobby_channel_id,
        ...(input.createdAt
          ? {
              createdAt:
                input.createdAt instanceof Date
                  ? input.createdAt
                  : new Date(input.createdAt),
            }
          : {}),
      })
      .onConflictDoNothing({ target: tempVoiceChannels.id });
  }
}
