import { z } from "zod";

export interface LavalinkNodeConfig {
  readonly id: string;
  readonly url: string;
  readonly password: string;
  readonly region: string;
  readonly capabilities: readonly string[];
  readonly maxPlayers: number;
  readonly toJSON?: () => Omit<LavalinkNodeConfig, "password" | "toJSON"> & { password: "[REDACTED]" };
}

type NodeEnvironment = Record<string, string | undefined>;

const nodeConfigSchema = z.object({
  id: z.string().trim().min(1),
  url: z.string().url(),
  password: z.string().min(1),
  region: z.string().trim().min(1),
  capabilities: z.array(z.string().trim().min(1)),
  maxPlayers: z.number().int().positive(),
}).strict();

const nodesSchema = z.array(nodeConfigSchema).min(1);

function isPrivateHttpHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.")) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    return octets[0] === 10
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  }

  return host.endsWith(".ts.net") || !host.includes(".");
}

function assertSecureNodeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Lavalink node URLs must be valid HTTP(S) URLs.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Lavalink node URLs must not contain credentials.");
  }

  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && isPrivateHttpHost(parsed.hostname)) return;

  throw new Error("Public Lavalink node URLs must use HTTPS.");
}

function expandPassword(password: string, environment: NodeEnvironment): string {
  const match = password.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
  if (!match) return password;

  const expanded = environment[match[1]];
  if (!expanded) {
    throw new Error("Lavalink node password environment variable is not set.");
  }

  return expanded;
}

function redactableNodeConfig(config: z.infer<typeof nodeConfigSchema>, password: string): LavalinkNodeConfig {
  const result = {
    id: config.id,
    url: config.url,
    region: config.region,
    capabilities: Object.freeze([...config.capabilities]),
    maxPlayers: config.maxPlayers,
  } as Omit<LavalinkNodeConfig, "password"> as LavalinkNodeConfig;

  Object.defineProperty(result, "password", {
    value: password,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(result, "toJSON", {
    value: () => ({
      id: result.id,
      url: result.url,
      password: "[REDACTED]" as const,
      region: result.region,
      capabilities: result.capabilities,
      maxPlayers: result.maxPlayers,
    }),
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return Object.freeze(result);
}

/**
 * Parses the deployment-owned Lavalink node list. The schema is strict so a
 * misspelled node field cannot silently produce an unplaceable relay.
 */
export function parseLavalinkNodes(environment: NodeEnvironment = process.env): LavalinkNodeConfig[] {
  const raw = environment.LAVALINK_NODES_JSON;
  if (!raw) {
    throw new Error("LAVALINK_NODES_JSON must configure at least one Lavalink node.");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("LAVALINK_NODES_JSON must be valid JSON.");
  }

  const parsed = nodesSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error("LAVALINK_NODES_JSON contains an invalid node configuration.");
  }

  const ids = new Set<string>();
  return parsed.data.map((config) => {
    if (ids.has(config.id)) {
      throw new Error("LAVALINK_NODES_JSON node IDs must be unique.");
    }
    ids.add(config.id);
    assertSecureNodeUrl(config.url);
    return redactableNodeConfig(config, expandPassword(config.password, environment));
  });
}
