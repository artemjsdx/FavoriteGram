import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = join(root, "out");
const distDir = join(root, "dist");
const mimeTypes = {
  ".css": "text/css; charset=utf-8", ".gif": "image/gif", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon",
  ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2",
};

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

const assets = {};
for (const path of await walk(outDir)) {
  const key = `/${relative(outDir, path).split(sep).join("/")}`;
  const bytes = await readFile(path);
  assets[key] = { body: bytes.toString("base64"), type: mimeTypes[extname(path).toLowerCase()] || "application/octet-stream" };
}

const source = await readFile(join(root, "worker", "index.js"), "utf8");
if (!source.includes("const STATIC_ASSETS = {};")) throw new Error("Worker asset placeholder is missing");
const worker = source.replace("const STATIC_ASSETS = {};", `const STATIC_ASSETS = ${JSON.stringify(assets)};`);

await rm(distDir, { recursive: true, force: true });
await mkdir(join(distDir, "server"), { recursive: true });
await mkdir(join(distDir, ".openai", "drizzle"), { recursive: true });
await writeFile(join(distDir, "server", "index.js"), worker);
await cp(join(root, ".openai", "hosting.json"), join(distDir, ".openai", "hosting.json"));
await cp(join(root, "drizzle", "0000_hosted_state.sql"), join(distDir, ".openai", "drizzle", "0000_hosted_state.sql"));
console.log(`Built Sites Worker with ${Object.keys(assets).length} static assets`);
