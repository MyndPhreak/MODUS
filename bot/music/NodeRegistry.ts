import { MusicError } from "./errors";
import type { MusicResult } from "./types";
import type { LavalinkNodeConfig } from "./node-config";

export type { LavalinkNodeConfig } from "./node-config";

export type NodeAdministrativeState = "enabled" | "draining" | "disabled";

export interface NodeHealthUpdate {
  available?: boolean;
  activePlayers?: number;
  lavalinkPenalty?: number;
  cpuLoad?: number;
  frameLoss?: number;
}

export interface NodeSnapshot {
  readonly id: string;
  readonly url: string;
  readonly region: string;
  readonly capabilities: readonly string[];
  readonly maxPlayers: number;
  readonly administrativeState: NodeAdministrativeState;
  readonly available: boolean;
  readonly activePlayers: number;
  readonly lavalinkPenalty: number;
  readonly cpuLoad: number;
  readonly frameLoss: number;
}

export interface NodeSelectionRequest {
  guildId: string;
  assignedNodeId?: string | null;
  region?: string;
  capabilities?: readonly string[];
}

interface RegistryNode extends NodeSnapshot {
  readonly config: LavalinkNodeConfig;
}

function invalidMetric(name: string): never {
  throw new Error(`Invalid Lavalink node ${name} metric.`);
}

function finiteNonNegative(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) invalidMetric(name);
  return value;
}

/**
 * Keeps the deployment node catalogue separate from its live health. Placement
 * penalty is player utilization (0-100), plus Lavalink's reported penalty,
 * CPU utilization (0-100), and a 50-point frame-loss surcharge plus the loss
 * count. Lower is better; equal scores sort by node ID for deterministic use.
 */
export class NodeRegistry {
  private readonly nodes = new Map<string, RegistryNode>();

  constructor(configs: readonly LavalinkNodeConfig[]) {
    for (const config of configs) {
      if (this.nodes.has(config.id)) {
        throw new Error(`Duplicate Lavalink node ID: ${config.id}`);
      }

      this.nodes.set(config.id, {
        config,
        id: config.id,
        url: config.url,
        region: config.region,
        capabilities: Object.freeze([...config.capabilities]),
        maxPlayers: config.maxPlayers,
        administrativeState: "enabled",
        available: false,
        activePlayers: 0,
        lavalinkPenalty: 0,
        cpuLoad: 0,
        frameLoss: 0,
      });
    }
  }

  update(id: string, update: NodeHealthUpdate): NodeSnapshot {
    const node = this.requireNode(id);
    const activePlayers = finiteNonNegative(update.activePlayers, "activePlayers");
    const lavalinkPenalty = finiteNonNegative(update.lavalinkPenalty, "lavalinkPenalty");
    const cpuLoad = finiteNonNegative(update.cpuLoad, "cpuLoad");
    const frameLoss = finiteNonNegative(update.frameLoss, "frameLoss");

    if (cpuLoad !== undefined && cpuLoad > 1) invalidMetric("cpuLoad");
    if (update.available !== undefined && typeof update.available !== "boolean") {
      throw new Error("Invalid Lavalink node availability.");
    }

    const next: RegistryNode = {
      ...node,
      available: update.available ?? node.available,
      activePlayers: activePlayers ?? node.activePlayers,
      lavalinkPenalty: lavalinkPenalty ?? node.lavalinkPenalty,
      cpuLoad: cpuLoad ?? node.cpuLoad,
      frameLoss: frameLoss ?? node.frameLoss,
    };
    this.nodes.set(id, next);
    return this.toSnapshot(next);
  }

  markUnavailable(id: string): NodeSnapshot {
    return this.update(id, { available: false });
  }

  setAdministrativeState(id: string, administrativeState: NodeAdministrativeState): NodeSnapshot {
    if (administrativeState !== "enabled" && administrativeState !== "draining" && administrativeState !== "disabled") {
      throw new Error("Invalid Lavalink node administrative state.");
    }

    const node = this.requireNode(id);
    const next = { ...node, administrativeState };
    this.nodes.set(id, next);
    return this.toSnapshot(next);
  }

  snapshot(id: string): NodeSnapshot {
    return this.toSnapshot(this.requireNode(id));
  }

  snapshots(): NodeSnapshot[] {
    return [...this.nodes.values()]
      .sort((left, right) => this.compareIds(left.id, right.id))
      .map((node) => this.toSnapshot(node));
  }

  getConfig(id: string): LavalinkNodeConfig {
    return this.requireNode(id).config;
  }

  selectNode(request: NodeSelectionRequest): MusicResult<NodeSnapshot> {
    const candidates = [...this.nodes.values()].filter((node) => this.matchesRequest(node, request));
    const available = candidates.filter((node) => this.isAvailable(node));

    if (available.length === 0) {
      return this.failure("MUSIC_RELAY_OFFLINE", "No healthy Lavalink node is available for this request.");
    }

    const eligible = available.filter((node) => node.activePlayers < node.maxPlayers);
    if (eligible.length === 0) {
      return this.failure("MUSIC_NODE_CAPACITY", "All healthy Lavalink nodes are at capacity.");
    }

    const assigned = request.assignedNodeId ? this.nodes.get(request.assignedNodeId) : undefined;
    if (assigned && eligible.some((node) => node.id === assigned.id)) {
      return { ok: true, value: this.toSnapshot(assigned) };
    }

    const regional = request.region
      ? eligible.filter((node) => node.region === request.region)
      : [];
    const placementPool = regional.length > 0 ? regional : eligible;
    const selected = placementPool
      .map((node) => ({ node, score: this.penalty(node) }))
      .sort((left, right) => left.score - right.score || this.compareIds(left.node.id, right.node.id))[0];

    return { ok: true, value: this.toSnapshot(selected!.node) };
  }

  private requireNode(id: string): RegistryNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Unknown Lavalink node ID: ${id}`);
    return node;
  }

  private toSnapshot(node: RegistryNode): NodeSnapshot {
    const { config: _config, ...snapshot } = node;
    return Object.freeze({ ...snapshot, capabilities: Object.freeze([...snapshot.capabilities]) });
  }

  private matchesRequest(node: RegistryNode, request: NodeSelectionRequest): boolean {
    return (request.capabilities ?? []).every((capability) => node.capabilities.includes(capability));
  }

  private isAvailable(node: RegistryNode): boolean {
    return node.available && node.administrativeState === "enabled";
  }

  private penalty(node: RegistryNode): number {
    const playerUtilization = (node.activePlayers / node.maxPlayers) * 100;
    const cpuPenalty = node.cpuLoad * 100;
    const frameLossPenalty = node.frameLoss > 0 ? 50 + node.frameLoss : 0;
    return playerUtilization + node.lavalinkPenalty + cpuPenalty + frameLossPenalty;
  }

  private failure(code: "MUSIC_NODE_CAPACITY" | "MUSIC_RELAY_OFFLINE", message: string): MusicResult<never> {
    return { ok: false, error: new MusicError(code, message, { retryable: true }) };
  }

  private compareIds(left: string, right: string): number {
    return left === right ? 0 : left < right ? -1 : 1;
  }
}
