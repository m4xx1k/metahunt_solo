import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { StorageService } from "../storage/storage.service";

const KEY_PREFIX = "db-backups";

@Injectable()
@Activity()
export class DbBackupActivity {
  private readonly logger = new Logger(DbBackupActivity.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  @ActivityMethod()
  async backupDatabase(): Promise<{ key: string; bytes: number }> {
    const url = this.config.get<string>("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL is not set; cannot back up");

    const day = new Date().toISOString().slice(0, 10);
    const key = `${KEY_PREFIX}/${day}/metahunt.dump`;
    const file = join(tmpdir(), `metahunt-${day}.dump`);

    try {
      await this.runPgDump(url, file);
      const body = await readFile(file);
      await this.storage.upload(key, body);
      this.logger.log(`Backed up database to ${key} (${body.byteLength} bytes)`);
      return { key, bytes: body.byteLength };
    } finally {
      await rm(file, { force: true });
    }
  }

  private runPgDump(url: string, file: string): Promise<void> {
    // -Fc is restorable by pg_restore into the lab database; -Z6 keeps the
    // upload small enough to buffer in memory before the S3 PUT.
    const args = ["-Fc", "-Z6", "--no-owner", "--no-acl", "-f", file, url];
    return new Promise((resolve, reject) => {
      const child = spawn("pg_dump", args, { stdio: ["ignore", "ignore", "pipe"] });
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
