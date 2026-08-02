const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, '../dist/modules');
const outputFile = path.join(__dirname, '../slash-commands.json');

const commandPayloads = [];

if (!fs.existsSync(modulesDir)) {
  console.error(`Dist modules directory not found at ${modulesDir}. Please run 'pnpm run build' inside bot first.`);
  process.exit(1);
}

const flatFiles = fs.readdirSync(modulesDir)
  .filter(f => f.endsWith('.js'))
  .map(f => path.join(modulesDir, f));

const subdirFiles = [];
const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isDirectory()) {
    const candidate = path.join(modulesDir, entry.name, 'index.js');
    if (fs.existsSync(candidate)) {
      subdirFiles.push(candidate);
    }
  }
}

const allFiles = [...flatFiles, ...subdirFiles];

for (const filePath of allFiles) {
  try {
    const modImport = require(filePath);
    const mod = modImport.default || modImport;

    const rawCommands = [];
    if (mod.commands && Array.isArray(mod.commands)) {
      rawCommands.push(...mod.commands);
    } else if (mod.data) {
      rawCommands.push(mod.data);
    }

    for (const cmd of rawCommands) {
      if (cmd && typeof cmd.toJSON === 'function') {
        commandPayloads.push(cmd.toJSON());
      } else if (cmd && typeof cmd === 'object') {
        commandPayloads.push(cmd);
      }
    }
  } catch (err) {
    console.error(`Error loading module file ${filePath}:`, err.message);
  }
}

fs.writeFileSync(outputFile, JSON.stringify(commandPayloads, null, 2), 'utf8');
console.log(`Successfully exported ${commandPayloads.length} commands to ${outputFile}`);
