import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

@Injectable()
export class CiphertextStorage implements OnModuleDestroy {
  private connection?: { client: S3Client; bucket: string };

  private storage() {
    if (this.connection) return this.connection;
    const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env;
    if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY)
      throw new ServiceUnavailableException("File storage is not configured");
    const client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      forcePathStyle: true,
    });
    return (this.connection = { client, bucket: S3_BUCKET });
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const { client, bucket } = this.storage();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: "application/octet-stream",
      }),
      { abortSignal: AbortSignal.timeout(90_000) },
    );
  }

  async get(key: string): Promise<Buffer> {
    const { client, bucket } = this.storage();
    const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(90_000),
    });
    if (!Body) throw new ServiceUnavailableException("Missing encrypted file body");
    return Buffer.from(await Body.transformToByteArray());
  }

  async remove(key: string): Promise<void> {
    const { client, bucket } = this.storage();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }

  onModuleDestroy() {
    this.connection?.client.destroy();
  }
}
