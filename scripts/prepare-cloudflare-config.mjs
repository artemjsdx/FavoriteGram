import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const databaseId = String(process.argv[2] || "").trim()
if (!/^[a-f0-9-]{16,}$/i.test(databaseId)) throw new Error("A valid Cloudflare D1 database ID is required")

const root = resolve(import.meta.dirname, "..")
const template = await readFile(resolve(root, "wrangler.template.jsonc"), "utf8")
const outputDirectory = resolve(root, ".wrangler")
await mkdir(outputDirectory, { recursive: true })
await writeFile(resolve(outputDirectory, "deploy.jsonc"), template.replace("__D1_DATABASE_ID__", databaseId))
console.log("Prepared .wrangler/deploy.jsonc")
