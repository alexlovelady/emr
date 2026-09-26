import { randomUUID } from 'node:crypto';
import { HeadObjectCommand, NotFound, PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  HeadObjectResult,
  ObjectStorageConfig,
  ObjectStorageGateway,
  UploadUrlResult,
} from './object-storage-gateway.js';

export class S3ObjectStorageGateway implements ObjectStorageGateway {
  private readonly client: S3Client;

  constructor(private readonly config: ObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async getUploadUrl(params: { tenantId: string; filename: string; contentType: string }): Promise<UploadUrlResult> {
    const storageKey = buildStorageKey(params.tenantId, params.filename);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: storageKey,
      ContentType: params.contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: this.config.presignTtlSeconds });
    return { url, storageKey };
  }

  async getDownloadUrl(params: { storageKey: string }): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: params.storageKey });
    return getSignedUrl(this.client, command, { expiresIn: this.config.presignTtlSeconds });
  }

  async headObject(params: { storageKey: string }): Promise<HeadObjectResult | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: params.storageKey }),
      );
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? 'application/octet-stream' };
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }
}

/** Tenant-prefixed key (spec §16) — never derived from client-supplied path segments directly. */
export function buildStorageKey(tenantId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return `tenants/${tenantId}/documents/${randomUUID()}-${sanitized}`;
}
