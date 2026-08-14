import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { StorageService } from "../storage/storage.service";

const KEY_PREFIX = "db-backups";
const KEEP_BACKUPS = 12;
// A -Fc archive of an empty database is still a few KB of header, so anything
// this small means pg_dump exited 0 having produced nothing usable.
const MIN_DUMP_BYTES = 64 * 1024;

@Injectable()
@Activity()
export class DbBackupActivity {
  private readonly logger = new Logger(DbBackupActivity.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  @ActivityMethod()
  async backupDatabase(): Promise<{ key: string; bytes: number; pruned: number }> {
    const url = this.config.get<string>("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL is not set; cannot back up");

    const day = new Date().toISOString().slice(0, 10);
    const key = `${KEY_PREFIX}/${day}/metahunt.dump`;
    // Unique per attempt: a timed-out attempt keeps running (Temporal cannot
    // kill it), and a shared path would let two dumps write the same file.
    const file = join(tmpdir(), `metahunt-${day}-${randomUUID()}.dump`);

    try {
      await this.runPgDump(url, file);
      const body = await readFile(file);
      if (body.byteLength < MIN_DUMP_BYTES) {
        throw new Error(`pg_dump produced only ${body.byteLength} bytes; refusing to upload`);
      }
      await this.storage.uploadBackup(key, body);
      const pruned = await this.prune(key);
      this.logger.log(`Backed up database to ${key} (${body.byteLength} bytes, pruned ${pruned})`);
      return { key, bytes: body.byteLength, pruned };
    } finally {
      await rm(file, { force: true });
    }
  }

  // Retention lives here rather than in a bucket lifecycle rule so the policy
  // is visible next to the thing that writes the objects.
  private async prune(justWritten: string): Promise<number> {
    const keys = (await this.storage.listBackups(`${KEY_PREFIX}/`)).filter(
      (k) => k !== justWritten,
    );
    const stale = keys.slice(0, Math.max(0, keys.length + 1 - KEEP_BACKUPS));
    for (const key of stale) await this.storage.removeBackup(key);
    return stale.length;
  }

  private runPgDump(url: string, file: string): Promise<void> {
    const dsn = new URL(url);
    // Connection parts go through flags and the password through the
    // environment: argv is world-readable via /proc/<pid>/cmdline and ps.
    const args = [
      "-Fc",
      "-Z6",
      "--no-owner",
      "--no-acl",
      "-h",
      dsn.hostname,
      "-p",
      dsn.port || "5432",
      "-U",
      decodeURIComponent(dsn.username),
      "-d",
      dsn.pathname.slice(1),
      "-f",
      file,
    ];
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: decodeURIComponent(dsn.password),
    };
    const sslmode = dsn.searchParams.get("sslmode");
    if (sslmode) env.PGSSLMODE = sslmode;

    return new Promise((resolve, reject) => {
      const child = spawn("pg_dump", args, { stdio: ["ignore", "ignore", "pipe"], env });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve();
        reject(new Error(`pg_dump exited with ${code}: ${stderr.trim()}`));
      });
    });
  }
}
