export interface ObjectStorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  presignTtlSeconds: number;
}

export interface UploadUrlResult {
  url: string;
  storageKey: string;
}

export interface HeadObjectResult {
  sizeBytes: number;
  contentType: string;
}

/**
 * EHR_BUILD_SPEC.md §16: tenant-prefixed keys, no public access, pre-signed URLs with short
 * expiry, authorization checked BEFORE a URL is ever issued (that check happens in
 * domains/documents, not here — this gateway has no concept of authorization, only storage).
 * ADR-0001: implemented once against the S3 API surface (MinIO locally, Cloudflare R2 hosted,
 * real AWS S3 later) — never expose a raw bucket path to a client; only pre-signed URLs.
 */
export interface ObjectStorageGateway {
  getUploadUrl(params: { tenantId: string; filename: string; contentType: string }): Promise<UploadUrlResult>;
  getDownloadUrl(params: { storageKey: string }): Promise<string>;
  headObject(params: { storageKey: string }): Promise<HeadObjectResult | null>;
}
