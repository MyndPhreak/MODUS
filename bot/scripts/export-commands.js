const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, '../dist/modules');
const outputFile = path.join(__dirname, '../slash-commands.json');

if (!fs.existsSync(modulesDir)) {
  console.error(`Dist modules directory not found at ${modulesDir}. Please run 'pnpm run build' inside bot first.`);
  process.exit(1);
}

// Collect subdirectory index entries
const subdirEntries = fs.readdirSync(modulesDir, { withFileTypes: true });
const subdirNames = new Set(
  subdirEntries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase())
);
const subdirFiles = [];
for (const entry of subdirEntries) {
  if (entry.isDirectory()) {
    const candidate = path.join(modulesDir, entry.name, 'index.js');
    if (fs.existsSync(candidate)) {
      subdirFiles.push(candidate);
    }
  }
}

// Collect flat files, ignoring any shadowed by a directory module
const flatFiles = fs
  .readdirSync(modulesDir)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.d.ts'))
  .filter((f) => !subdirNames.has(f.replace(/\.js$/, '').toLowerCase()))
  .map((f) => path.join(modulesDir, f));

const allFiles = [...flatFiles, ...subdirFiles];
const uniqueModules = new Map();

for (const filePath of allFiles) {
  try {
    const modImport = require(filePath);
    const mod = modImport.default || modImport;

    if (mod && mod.name) {
      uniqueModules.set(mod.name.toLowerCase(), mod);
    }
  } catch (err) {
    console.error(`Error loading module file ${filePath}:`, err.message);
  }
}

const commandPayloads = [];
const seenCommandNames = new Map(); // commandName -> moduleName

for (const [moduleName, mod] of uniqueModules.entries()) {
  const rawCommands = [];
  if (mod.commands && Array.isArray(mod.commands)) {
    rawCommands.push(...mod.commands);
  } else if (mod.data) {
    rawCommands.push(mod.data);
  }

  for (const cmd of rawCommands) {
    let payload = null;
    if (cmd && typeof cmd.toJSON === 'function') {
      payload = cmd.toJSON();
    } else if (cmd && typeof cmd === 'object') {
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

fs.writeFileSync(outputFile, JSON.stringify(commandPayloads, null, 2), 'utf8');
console.log(`Successfully exported ${commandPayloads.length} commands to ${outputFile}`);
