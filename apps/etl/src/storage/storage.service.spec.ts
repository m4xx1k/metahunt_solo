import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";

import { StorageService } from "./storage.service";

const STORAGE_CONFIG: Record<string, string> = {
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_REGION: "us-east-1",
  STORAGE_ACCESS_KEY: "metahunt",
  STORAGE_SECRET_KEY: "metahunt123",
  STORAGE_BUCKET: "rss-payloads",
};

describe("StorageService", () => {
  const s3Mock = mockClient(S3Client);
  let service: StorageService;

  beforeEach(async () => {
    s3Mock.reset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: <T>(key: string): T | undefined =>
              STORAGE_CONFIG[key] as T | undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(StorageService);
  });

  it("upload issues PutObjectCommand with configured bucket and given key", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const body = Buffer.from("<rss>payload</rss>", "utf8");

    await service.upload("ingest/abc.xml", body);

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Bucket).toBe("rss-payloads");
    expect(input.Key).toBe("ingest/abc.xml");
    expect(input.Body).toBe(body);
  });

  it("download returns buffer assembled from GetObjectCommand response stream", async () => {
    const expected = Buffer.from("hello world", "utf8");
    s3Mock.on(GetObjectCommand).resolves({
      Body: Readable.from([
        Uint8Array.from(expected.subarray(0, 5)),
        Uint8Array.from(expected.subarray(5)),
      ]) as unknown as never,
    });

    const got = await service.download("ingest/abc.xml");

    const calls = s3Mock.commandCalls(GetObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Bucket).toBe("rss-payloads");
    expect(calls[0].args[0].input.Key).toBe("ingest/abc.xml");
    expect(got.equals(expected)).toBe(true);
  });
});
