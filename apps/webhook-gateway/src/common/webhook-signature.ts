import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * EHR_BUILD_SPEC.md §12's "signed webhooks" — real HMAC-SHA256 verification (not staff JWT; the
 * caller here is a genuine external clearinghouse, not a workforce user). The signature header
 * convention (`sha256=<hex>`) mirrors the common Stripe/GitHub style. Verifies against the exact
 * raw request body bytes — never the parsed/re-serialized JSON, which could differ from what was
 * actually signed.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const providedHex = signatureHeader.slice(SIGNATURE_PREFIX.length).trim();
  const expectedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const provided = Buffer.from(providedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}
