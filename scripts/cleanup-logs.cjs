#!/usr/bin/env node
const { readdir, lstat, unlink } = require('node:fs/promises');
const { resolve, join } = require('node:path');

const DEFAULT_RETENTION_DAYS = 30;
function retentionDays(value = String(DEFAULT_RETENTION_DAYS)) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error('LOG_RETENTION_DAYS must be a positive integer');
  }
  return Number(value);
}

async function cleanupLogs({ directory, days = DEFAULT_RETENTION_DAYS, dryRun = false, now = new Date() }) {
  if (!directory || !directory.trim()) throw new Error('LOG_DIR must be configured');
  days = retentionDays(days);
  const dir = resolve(directory);
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('LOG_DIR must be a real directory');
  // Keep the current UTC day and the previous days-1 complete daily files.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cutoff = today - (days - 1) * 86400000;
  const expired = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const match = /^graphql-(?:errors-)?(\d{4}-\d{2}-\d{2})\.log$/.exec(entry.name);
    if (!match || !entry.isFile() || entry.isSymbolicLink()) continue;
    const date = new Date(match[1] + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] || date.getTime() >= cutoff) continue;
    // Recheck before deletion; never follow a symlink or recurse into directories.
    const file = join(dir, entry.name);
    try {
      const current = await lstat(file);
      if (!current.isFile() || current.isSymbolicLink()) continue;
      if (!dryRun) await unlink(file);
      expired.push(entry.name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // Concurrent cleanup is harmless.
    }
  }
  return expired.sort();
}

async function main() {
  require('dotenv/config');
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: npm run logs:cleanup -- [--dry-run]');
  const dryRun = args.includes('--dry-run');
  const days = retentionDays(process.env.LOG_RETENTION_DAYS);
  const files = await cleanupLogs({ directory: process.env.LOG_DIR, days, dryRun });
  console.log(JSON.stringify({ event: 'logs.cleanup', dryRun, retentionDays: days, count: files.length, files }));
}
if (require.main === module) main().catch(() => {
  // No filesystem paths or arbitrary OS error messages in logs.
  console.error('Log cleanup failed: check LOG_DIR, LOG_RETENTION_DAYS, arguments and filesystem permissions.');
  process.exitCode = 1;
});
module.exports = { cleanupLogs, retentionDays };
