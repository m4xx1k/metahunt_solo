import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { ConfigService } from "@nestjs/config";

import { StorageService } from "../storage/storage.service";
import { DbBackupActivity } from "./db-backup.activity";

const mockSpawn = jest.fn();
jest.mock("node:child_process", () => ({ spawn: (...a: unknown[]) => mockSpawn(...a) }));

const URL_WITH_SECRET = "postgresql://pguser:s3cr3t@db.example:6543/railway";

type SpawnStub = { code: number; stderr?: string; bytes?: number };

function stubPgDump({ code, stderr = "", bytes }: SpawnStub) {
  mockSpawn.mockImplementation((_cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
    lastArgs = args;
    lastEnv = opts.env;
    let onStderr: ((c: Buffer) => void) | undefined;
    let onClose: ((c: number) => void) | undefined;
    const file = args[args.indexOf("-f") + 1];
    queueMicrotask(() => {
      void (async () => {
        const { writeFile } = await import("node:fs/promises");
        if (bytes !== undefined) await writeFile(file, Buffer.alloc(bytes, 1));
        if (stderr) onStderr?.(Buffer.from(stderr));
        onClose?.(code);
      })();
    });
    return {
      stderr: {
        on: (_e: string, cb: (c: Buffer) => void) => {
          onStderr = cb;
        },
      },
      on: (event: string, cb: (c: number) => void) => {
        if (event === "close") onClose = cb;
      },
    };
  });
}

let lastArgs: string[] = [];
let lastEnv: NodeJS.ProcessEnv = {};

describe("DbBackupActivity", () => {
  const config = { get: () => URL_WITH_SECRET } as unknown as ConfigService;
  let uploaded: { key: string; body: Buffer } | undefined;
  let existing: string[] = [];
  let removed: string[] = [];
  const storage = {
    uploadBackup: (key: string, body: Buffer) => {
      uploaded = { key, body };
      return Promise.resolve();
    },
    listBackups: () => Promise.resolve(existing),
    removeBackup: (key: string) => {
      removed.push(key);
      return Promise.resolve();
    },
  } as unknown as StorageService;

  const day = new Date().toISOString().slice(0, 10);
  const activity = () => new DbBackupActivity(config, storage);

  beforeEach(() => {
    uploaded = undefined;
    existing = [];
    removed = [];
    lastArgs = [];
    lastEnv = {};
    mockSpawn.mockReset();
  });

  it("uploads the dump under a dated key and removes the temp file", async () => {
    stubPgDump({ code: 0, bytes: 200_000 });

    const result = await activity().backupDatabase();

    expect(result.key).toBe(`db-backups/${day}/metahunt.dump`);
    expect(uploaded?.body.byteLength).toBe(200_000);
    const leftovers = (await readdir(tmpdir())).filter((f) => f.startsWith(`metahunt-${day}-`));
    expect(leftovers).toEqual([]);
  });

  it("keeps the connection password out of argv", async () => {
    stubPgDump({ code: 0, bytes: 200_000 });

    await activity().backupDatabase();

    expect(lastArgs.join(" ")).not.toContain("s3cr3t");
    expect(lastEnv.PGPASSWORD).toBe("s3cr3t");
    expect(lastArgs).toEqual(
      expect.arrayContaining(["-h", "db.example", "-p", "6543", "-U", "pguser"]),
    );
  });

  it("refuses to upload a suspiciously small archive", async () => {
    stubPgDump({ code: 0, bytes: 100 });

    await expect(activity().backupDatabase()).rejects.toThrow(/only 100 bytes/);
    expect(uploaded).toBeUndefined();
  });

  it("fails loudly when pg_dump exits non-zero", async () => {
    stubPgDump({ code: 1, stderr: "connection refused", bytes: 0 });

    await expect(activity().backupDatabase()).rejects.toThrow(
      /pg_dump exited with 1: connection refused/,
    );
    expect(uploaded).toBeUndefined();
  });

  it("prunes the oldest backups beyond the retention window", async () => {
    existing = Array.from(
      { length: 14 },
      (_, i) => `db-backups/2026-01-${String(i + 1).padStart(2, "0")}/metahunt.dump`,
    );
    stubPgDump({ code: 0, bytes: 200_000 });

    const result = await activity().backupDatabase();

    expect(result.pruned).toBe(3);
    expect(removed).toEqual([
      "db-backups/2026-01-01/metahunt.dump",
      "db-backups/2026-01-02/metahunt.dump",
      "db-backups/2026-01-03/metahunt.dump",
    ]);
  });
});
