#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env.local");
const backupPath = path.join(cwd, `.env.local.backup-${Date.now()}`);

const keysToRemove = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

if (!fs.existsSync(envPath)) {
  console.error(".env.local not found");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
fs.writeFileSync(backupPath, raw, "utf8");

const next = raw
  .split(/\r?\n/)
  .filter((line) => {
    const [key] = line.split("=", 1);
    return !keysToRemove.has((key || "").trim());
  })
  .join("\n");

fs.writeFileSync(envPath, `${next.trim()}\n`, "utf8");

console.log("Supabase env keys removed from .env.local");
console.log(`Backup written to: ${backupPath}`);
