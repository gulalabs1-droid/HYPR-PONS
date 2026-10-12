import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const staticRoot = join(process.cwd(), ".next", "static");
const forbidden = [
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service-role configuration"],
  ["BEGIN PRIVATE KEY", "PEM private-key material"],
  ["PRIVATE_KEY=", "private-key environment assignment"],
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (/\.(?:js|css|json|map)$/.test(entry.name)) files.push(path);
  }
  return files;
}

let files;
try {
  files = await filesUnder(staticRoot);
} catch (error) {
  throw new Error(`Unable to inspect the Next.js client bundle at ${staticRoot}: ${error instanceof Error ? error.message : String(error)}`);
}
if (files.length === 0) throw new Error("Next.js client bundle is empty; run npm run build first");

for (const file of files) {
  const contents = await readFile(file, "utf8");
  for (const [needle, label] of forbidden) {
    if (contents.includes(needle)) throw new Error(`${label} leaked into client bundle: ${file}`);
  }
}

console.log(`client bundle security check passed (${files.length} assets inspected)`);
