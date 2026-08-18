import fs from "fs";
import path from "path";
import type { SlashCommandData } from "../ModuleManager";

async function exportSlashCommands() {
  const modulesPath = path.join(__dirname, "../modules");
  const outputPath = path.join(__dirname, "../slash-commands.json");

  if (!fs.existsSync(modulesPath)) {
    console.error(`Modules directory not found at ${modulesPath}`);
    process.exit(1);
  }

  // Collect subdirectory index entries
  const subdirEntries = fs.readdirSync(modulesPath, { withFileTypes: true });
  const subdirNames = new Set(
    subdirEntries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase())
  );
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

  // Collect flat files, ignoring any shadowed by a directory module
  const flatFiles = fs
    .readdirSync(modulesPath)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"))
    .filter((f) => !subdirNames.has(f.replace(/\.(ts|js)$/, "").toLowerCase()))
    .map((f) => path.join(modulesPath, f));

  const files = [...flatFiles, ...subdirFiles];
  const uniqueModules = new Map<string, any>();

  for (const modulePath of files) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const moduleImport = require(modulePath);
      const module = moduleImport.default || moduleImport;

      if (module && module.name) {
        uniqueModules.set(module.name.toLowerCase(), module);
      }
    } catch (err) {
      console.error(`Failed to load module at ${modulePath}:`, err);
    }
  }

  const commandPayloads: any[] = [];
  const seenCommandNames = new Map<string, string>(); // commandName -> moduleName

  for (const [moduleName, module] of uniqueModules.entries()) {
    const rawCommands: SlashCommandData[] = [];
    if (module.commands && Array.isArray(module.commands)) {
      rawCommands.push(...module.commands);
    } else if (module.data) {
      rawCommands.push(module.data);
    }

    for (const cmd of rawCommands) {
      let payload: any = null;
      if (cmd && typeof (cmd as any).toJSON === "function") {
        payload = (cmd as any).toJSON();
      } else if (cmd && typeof cmd === "object") {
        payload = cmd;
      }

      if (payload && payload.name) {
        const nameKey = payload.name.toLowerCase();
        if (seenCommandNames.has(nameKey)) {
          const prevModule = seenCommandNames.get(nameKey);
          throw new Error(
            `Duplicate slash command name '/${payload.name}' found in module '${moduleName}' (already defined by module '${prevModule}')`
          );
        }
        seenCommandNames.set(nameKey, moduleName);
        commandPayloads.push(payload);
      }
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(commandPayloads, null, 2), "utf8");
  console.log(`Successfully exported ${commandPayloads.length} slash commands to ${outputPath}`);
}

exportSlashCommands().catch((err) => {
  console.error("Error exporting slash commands:", err);
  process.exit(1);
});
