import fs from "fs";
import path from "path";
import type { SlashCommandData } from "../ModuleManager";

async function exportSlashCommands() {
  const modulesPath = path.join(__dirname, "../modules");
  const outputPath = path.join(__dirname, "../slash-commands.json");

  const commandPayloads: any[] = [];

  if (!fs.existsSync(modulesPath)) {
    console.error(`Modules directory not found at ${modulesPath}`);
    process.exit(1);
  }

  // Collect flat files
  const flatFiles = fs
    .readdirSync(modulesPath)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"))
    .map((f) => path.join(modulesPath, f));

  // Collect subdirectory index entries
  const subdirEntries = fs.readdirSync(modulesPath, { withFileTypes: true });
  const subdirFiles: string[] = [];
  for (const entry of subdirEntries) {
    if (!entry.isDirectory()) continue;
    for (const ext of ["index.ts", "index.js"]) {
      const candidate = path.join(modulesPath, entry.name, ext);
      if (fs.existsSync(candidate)) {
        subdirFiles.push(candidate);
        break;
      }
    }
  }

  const files = [...flatFiles, ...subdirFiles];

  for (const modulePath of files) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const moduleImport = require(modulePath);
      const module = moduleImport.default || moduleImport;

      const rawCommands: SlashCommandData[] = [];
      if (module.commands && Array.isArray(module.commands)) {
        rawCommands.push(...module.commands);
      } else if (module.data) {
        rawCommands.push(module.data);
      }

      for (const cmd of rawCommands) {
        if (cmd && typeof (cmd as any).toJSON === "function") {
          commandPayloads.push((cmd as any).toJSON());
        } else if (cmd) {
          commandPayloads.push(cmd);
        }
      }
    } catch (err) {
      console.error(`Failed to load module at ${modulePath}:`, err);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(commandPayloads, null, 2), "utf8");
  console.log(`Successfully exported ${commandPayloads.length} slash commands to ${outputPath}`);
}

exportSlashCommands().catch((err) => {
  console.error("Error exporting slash commands:", err);
  process.exit(1);
});
