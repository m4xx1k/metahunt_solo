import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  // Database dumps carry every user's PII, so they can be pointed at a bucket
  // with its own credential; unset, they share the RSS payload bucket.
  private readonly backupBucket: string;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      endpoint: config.get<string>("STORAGE_ENDPOINT"),
      region: config.get<string>("STORAGE_REGION"),
      credentials: {
        accessKeyId: config.get<string>("STORAGE_ACCESS_KEY")!,
        secretAccessKey: config.get<string>("STORAGE_SECRET_KEY")!,
      },
      forcePathStyle: true,
    });
    this.bucket = config.get<string>("STORAGE_BUCKET")!;
    this.backupBucket = config.get<string>("STORAGE_BACKUP_BUCKET") || this.bucket;
  }

  async upload(key: string, body: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body }));
  }

  async uploadBackup(key: string, body: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.backupBucket, Key: key, Body: body }),
    );
  }

  async listBackups(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.backupBucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
      token = res.NextContinuationToken;
    } while (token);
    return keys.sort();
  }

  async removeBackup(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.backupBucket, Key: key }));
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async download(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
