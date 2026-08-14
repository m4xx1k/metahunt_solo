import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConfigService } from "@nestjs/config";

import { DbBackupActivity } from "./db-backup.activity";
import { StorageService } from "../storage/storage.service";

const mockSpawn = jest.fn();
jest.mock("node:child_process", () => ({ spawn: (...a: unknown[]) => mockSpawn(...a) }));

type SpawnResult = { code: number; stderr?: string; writes?: string };

function stubPgDump({ code, stderr = "", writes }: SpawnResult) {
  mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
    let onStderr: ((c: Buffer) => void) | undefined;
    let onClose: ((c: number) => void) | undefined;
    const file = args[args.indexOf("-f") + 1];
    queueMicrotask(() => {
      void (async () => {
        if (writes !== undefined) await writeFile(file, writes);
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

describe("DbBackupActivity", () => {
  const config = { get: () => "postgres://user:pw@host:5432/db" } as unknown as ConfigService;
  let uploaded: { key: string; body: Buffer } | undefined;
  const storage = {
    upload: (key: string, body: Buffer) => {
      uploaded = { key, body };
      return Promise.resolve();
    },
  } as unknown as StorageService;

  beforeEach(() => {
    uploaded = undefined;
    mockSpawn.mockReset();
  });

  it("uploads the dump under a dated key and removes the temp file", async () => {
    stubPgDump({ code: 0, writes: "dump-bytes" });

    const result = await new DbBackupActivity(config, storage).backupDatabase();

    const day = new Date().toISOString().slice(0, 10);
    expect(result.key).toBe(`db-backups/${day}/metahunt.dump`);
    expect(uploaded?.body.toString()).toBe("dump-bytes");
    await expect(readFile(join(tmpdir(), `metahunt-${day}.dump`))).rejects.toThrow();
  });

  it("fails loudly when pg_dump exits non-zero", async () => {
    stubPgDump({ code: 1, stderr: "connection refused", writes: "" });

    await expect(new DbBackupActivity(config, storage).backupDatabase()).rejects.toThrow(
      /pg_dump exited with 1: connection refused/,
    );
    expect(uploaded).toBeUndefined();
  });
});
