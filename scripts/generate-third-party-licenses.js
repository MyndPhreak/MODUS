#!/usr/bin/env node
// Regenerates docs/THIRD_PARTY_LICENSES.md from `pnpm licenses list --prod --json`.
// Run via `pnpm run licenses:generate`; CI (`ci.yml`) runs this and diffs the
// result against the committed file to catch drift when dependencies change.

const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "THIRD_PARTY_LICENSES.md");

// `pnpm licenses list` reads each prod package's index file out of the
// content-addressable store. Packages that are in the dependency graph but not
// materialized on the current platform — e.g. the `wasm32-wasi` fallback
// bindings pulled by @discordjs/voice/@snazzah/davey and rolldown, plus their
// @emnapi/@napi-rs peers — have no index, so the command aborts with
// ERR_PNPM_MISSING_PACKAGE_INDEX_FILE and emits no license data at all.
//
// The named package can be pulled into the store on demand with `pnpm store
// add`; doing so simply surfaces the next missing one, so we loop until the
// command succeeds. Each iteration adds one base package (the error names the
// peer-decorated id, but the index — and `store add` — key off the bare
// name@version, so we strip any trailing `(...)` peer suffix).
function collectLicenses() {
  const MAX_ATTEMPTS = 60;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = spawnSync("pnpm", ["licenses", "list", "--prod", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
      shell: process.platform === "win32",
    });

    if (res.status === 0) {
      return JSON.parse(res.stdout);
    }

    // On failure pnpm writes a JSON error object to stdout. Pull the missing
    // package id out of it; anything else is a real error we shouldn't mask.
    const missing = parseMissingPackage(res.stdout);
    if (!missing) {
      throw new Error(
        `pnpm licenses list failed:\n${res.stdout || res.stderr || "(no output)"}`,
      );
    }

    console.log(`Materializing missing store package: ${missing}`);
    execSync(`pnpm store add ${missing}`, { cwd: repoRoot, stdio: "ignore" });
  }
  throw new Error(
    `Gave up after ${MAX_ATTEMPTS} attempts to materialize missing store packages.`,
  );
}

function parseMissingPackage(stdout) {
  if (!stdout) return null;
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (parsed?.error?.code !== "ERR_PNPM_MISSING_PACKAGE_INDEX_FILE") return null;
  const match = parsed.error.message?.match(/index file for (.+?) \(at /);
  if (!match) return null;
  // Strip the `(@peer@x)(@peer@y)` suffix — store add wants bare name@version.
  return match[1].replace(/\(.*\)$/, "");
}

const data = collectLicenses();

const licenseOrder = Object.keys(data).sort((a, b) => data[b].length - data[a].length);

let total = 0;
const lines = [];
lines.push("# Third-Party Licenses");
lines.push("");
lines.push("MODUS is licensed under the MIT License (see [LICENSE](./LICENSE)). It depends on");
lines.push("__TOTAL__ third-party packages, which are distributed under their own licenses. This");
lines.push("file is generated from production dependencies across the pnpm workspace (`bot`, `web`,");
lines.push("`packages/db`) via `pnpm licenses list --prod --json`.");
lines.push("");
lines.push("Regenerate with:");
lines.push("```sh");
lines.push("pnpm run licenses:generate");
lines.push("```");
lines.push("");

for (const license of licenseOrder) {
  const pkgs = data[license].slice().sort((a, b) => a.name.localeCompare(b.name));
  total += pkgs.length;
  lines.push(`## ${license} (${pkgs.length})`);
  lines.push("");
  for (const p of pkgs) {
    const versions = p.versions.join(", ");
    const author = p.author ? ` — ${p.author}` : "";
    const homepage = p.homepage ? ` ([source](${p.homepage}))` : "";
    lines.push(`- **${p.name}** \`${versions}\`${author}${homepage}`);
  }
  lines.push("");
}

const output = lines.join("\n").replace("__TOTAL__", String(total)) + "\n";
fs.writeFileSync(outputPath, output);
console.log(`Wrote ${total} packages across ${licenseOrder.length} license groups to ${outputPath}`);
