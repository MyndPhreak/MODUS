import { describe, expect, it } from "vitest";
import { NodeRegistry, type LavalinkNodeConfig } from "./NodeRegistry";
import { parseLavalinkNodes } from "./node-config";

const node = (id: string, overrides: Partial<LavalinkNodeConfig> = {}): LavalinkNodeConfig => ({
  id,
  url: `https://${id}.relay.example.com`,
  password: "relay-password",
  region: "us-east",
  capabilities: ["youtube"],
  maxPlayers: 10,
  ...overrides,
});

const online = (registry: NodeRegistry, id: string, overrides: Record<string, number> = {}) => {
  registry.update(id, {
    available: true,
    activePlayers: 0,
    lavalinkPenalty: 0,
    cpuLoad: 0,
    frameLoss: 0,
    ...overrides,
  });
};

describe("NodeRegistry", () => {
  it("selects the only healthy node", () => {
    const registry = new NodeRegistry([node("one")]);
    online(registry, "one");

    const result = registry.selectNode({ guildId: "guild-1" });

    expect(result).toMatchObject({ ok: true, value: { id: "one" } });
  });

  it("keeps a healthy eligible node assigned to a guild", () => {
    const registry = new NodeRegistry([node("assigned"), node("lower-load")]);
    online(registry, "assigned", { activePlayers: 8 });
    online(registry, "lower-load");

    const result = registry.selectNode({ guildId: "guild-1", assignedNodeId: "assigned" });

    expect(result).toMatchObject({ ok: true, value: { id: "assigned" } });
  });

  it("excludes nodes missing a required capability", () => {
    const registry = new NodeRegistry([
      node("audio", { capabilities: ["youtube"] }),
      node("search", { capabilities: ["youtube", "soundcloud"] }),
    ]);
    online(registry, "audio");
    online(registry, "search");

    const result = registry.selectNode({ guildId: "guild-1", capabilities: ["soundcloud"] });

    expect(result).toMatchObject({ ok: true, value: { id: "search" } });
  });

  it("excludes capacity-full nodes", () => {
    const registry = new NodeRegistry([
      node("full", { maxPlayers: 1 }),
      node("open"),
    ]);
    online(registry, "full", { activePlayers: 1 });
    online(registry, "open");

    const result = registry.selectNode({ guildId: "guild-1" });

    expect(result).toMatchObject({ ok: true, value: { id: "open" } });
  });

  it("excludes draining nodes from placement", () => {
    const registry = new NodeRegistry([node("draining"), node("open")]);
    online(registry, "draining");
    online(registry, "open");
    registry.setAdministrativeState("draining", "draining");

    const result = registry.selectNode({ guildId: "guild-1" });

    expect(result).toMatchObject({ ok: true, value: { id: "open" } });
  });

  it("prefers an eligible node in the requested region", () => {
    const registry = new NodeRegistry([
      node("near", { region: "us-east" }),
      node("far", { region: "eu-west" }),
    ]);
    online(registry, "near", { activePlayers: 1 });
    online(registry, "far");

    const result = registry.selectNode({ guildId: "guild-1", region: "us-east" });

    expect(result).toMatchObject({ ok: true, value: { id: "near" } });
  });

  it("orders nodes by weighted player, Lavalink, CPU, and frame-loss penalty", () => {
    const registry = new NodeRegistry([
      node("high-penalty"),
      node("low-penalty"),
      node("same-score-b"),
      node("same-score-a"),
    ]);
    online(registry, "high-penalty", {
      activePlayers: 1,
      lavalinkPenalty: 5,
      cpuLoad: 0.2,
      frameLoss: 3,
    });
    online(registry, "low-penalty", { activePlayers: 1, cpuLoad: 0.01 });
    online(registry, "same-score-b", { activePlayers: 5 });
    online(registry, "same-score-a", { activePlayers: 5 });

    expect(registry.selectNode({ guildId: "guild-1" })).toMatchObject({
      ok: true,
      value: { id: "low-penalty" },
    });

    registry.markUnavailable("low-penalty");
    registry.markUnavailable("high-penalty");

    expect(registry.selectNode({ guildId: "guild-2" })).toMatchObject({
      ok: true,
      value: { id: "same-score-a" },
    });
  });

  it("reports capacity when compatible healthy nodes are full", () => {
    const registry = new NodeRegistry([node("full", { maxPlayers: 1 })]);
    online(registry, "full", { activePlayers: 1 });

    expect(registry.selectNode({ guildId: "guild-1" })).toMatchObject({
      ok: false,
      error: { code: "MUSIC_NODE_CAPACITY" },
    });
  });

  it("reports relay offline when no compatible healthy node exists", () => {
    const registry = new NodeRegistry([node("offline")]);

    expect(registry.selectNode({ guildId: "guild-1" })).toMatchObject({
      ok: false,
      error: { code: "MUSIC_RELAY_OFFLINE" },
    });
  });
});

describe("parseLavalinkNodes", () => {
  it("expands a deployment password without serializing it", () => {
    const nodes = parseLavalinkNodes({
      LAVALINK_NODES_JSON: JSON.stringify([{
        id: "local",
        url: "http://lavalink:2333",
        password: "${LAVALINK_SERVER_PASSWORD}",
        region: "local",
        capabilities: ["youtube"],
        maxPlayers: 20,
      }]),
      LAVALINK_SERVER_PASSWORD: "super-secret",
    });

    expect(nodes[0]?.password).toBe("super-secret");
    expect(JSON.stringify(nodes[0])).not.toContain("super-secret");
  });

  it("rejects public HTTP URLs without exposing the configured password", () => {
    expect(() => parseLavalinkNodes({
      LAVALINK_NODES_JSON: JSON.stringify([{
        id: "public",
        url: "http://relay.example.com:2333",
        password: "super-secret",
        region: "us-east",
        capabilities: ["youtube"],
        maxPlayers: 20,
      }]),
      NODE_ENV: "development",
    })).toThrowError(/HTTPS/);

    try {
      parseLavalinkNodes({
        LAVALINK_NODES_JSON: JSON.stringify([{
          id: "public",
          url: "http://relay.example.com:2333",
          password: "super-secret",
          region: "us-east",
          capabilities: ["youtube"],
          maxPlayers: 20,
        }]),
      });
    } catch (error) {
      expect(String(error)).not.toContain("super-secret");
    }
  });

  it("rejects credential-bearing node URLs before they can be serialized", () => {
    expect(() => parseLavalinkNodes({
      LAVALINK_NODES_JSON: JSON.stringify([{
        id: "private",
        url: "https://relay-user:url-password@relay.example.com:2333",
        password: "node-password",
        region: "us-east",
        capabilities: ["youtube"],
        maxPlayers: 20,
      }]),
    })).toThrowError(/must not contain credentials/);
  });
});
