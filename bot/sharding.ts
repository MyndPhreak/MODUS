import { ShardingManager } from 'discord.js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const entryFile = process.env.TS_NODE_DEV === 'true' ? 'index.ts' : 'index.js';

const manager = new ShardingManager(path.join(__dirname, entryFile), {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto',
    execArgv: process.env.TS_NODE_DEV === 'true' ? ['-r', 'ts-node/register'] : [],
});

manager.on('shardCreate', shard => {
    console.log(`[Sharding] Launched shard ${shard.id}`);
});

manager.spawn().catch(err => {
    console.error('[Sharding] Error spawning shards:', err);
});
