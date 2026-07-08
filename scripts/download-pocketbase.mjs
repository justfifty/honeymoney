// Download the PocketBase binary for this OS into pocketbase/.
// Cross-platform (Windows / macOS / Linux) — uses the system `tar` to unzip,
// which ships with Windows 10+, macOS, and most Linux distros.
// Usage: node scripts/download-pocketbase.mjs   (or: npm run pb:download from web/)

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbDir = join(root, "pocketbase");
const exe = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
const target = join(pbDir, exe);

if (existsSync(target)) {
  console.log(`✓ PocketBase already present at ${target}`);
  process.exit(0);
}

const platform =
  process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
const arch = process.arch === "arm64" ? "arm64" : "amd64";

console.log(`Fetching latest PocketBase release for ${platform}/${arch}…`);
const release = await (
  await fetch("https://api.github.com/repos/pocketbase/pocketbase/releases/latest")
).json();
const asset = release.assets.find((a) => a.name.includes(`_${platform}_${arch}.zip`));
if (!asset) {
  console.error(`No PocketBase asset for ${platform}/${arch}. Assets:`);
  release.assets.forEach((a) => console.error("  " + a.name));
  process.exit(1);
}

console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`);
const zip = Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer());
mkdirSync(pbDir, { recursive: true });
const zipPath = join(pbDir, "pb.zip");
writeFileSync(zipPath, zip);

execSync(`tar -xf pb.zip ${exe}`, { cwd: pbDir, stdio: "inherit" });
rmSync(zipPath);
if (process.platform !== "win32") chmodSync(target, 0o755);

console.log(`✓ Installed ${release.tag_name} → ${target}`);
console.log(`Next: npm run pb:start   (admin UI: http://127.0.0.1:8090/_/)`);
