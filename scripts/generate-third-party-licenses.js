#!/usr/bin/env node
// Regenerates docs/THIRD_PARTY_LICENSES.md from `pnpm licenses list --prod --json`.
// Run via `pnpm run licenses:generate`; CI (`ci.yml`) runs this and diffs the
// result against the committed file to catch drift when dependencies change.

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "THIRD_PARTY_LICENSES.md");

const raw = execSync("pnpm licenses list --prod --json", {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 64,
});
const data = JSON.parse(raw);

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
