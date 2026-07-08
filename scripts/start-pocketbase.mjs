// Start PocketBase for local dev. First run: ensures the local superuser the
// Next.js server authenticates as exists (credentials from env or dev defaults
// matching .env.example), then serves on 127.0.0.1:8090.
// Usage: node scripts/start-pocketbase.mjs   (or: npm run pb:start from web/)

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbDir = join(root, "pocketbase");
const exe = join(pbDir, process.platform === "win32" ? "pocketbase.exe" : "pocketbase");

if (!existsSync(exe)) {
  console.error("PocketBase binary not found. Run first: npm run pb:download");
  process.exit(1);
}

const email = process.env.POCKETBASE_ADMIN_EMAIL || "admin@honeymoney.local";
const password = process.env.POCKETBASE_ADMIN_PASSWORD || "honeymoney-local-dev";

// idempotent — also triggers migrations (schema + demo seed) on first run
execFileSync(exe, ["superuser", "upsert", email, password], { cwd: pbDir, stdio: "inherit" });

console.log("Starting PocketBase → http://127.0.0.1:8090 (admin UI: /_/)");
const child = spawn(exe, ["serve", "--http=127.0.0.1:8090"], { cwd: pbDir, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
