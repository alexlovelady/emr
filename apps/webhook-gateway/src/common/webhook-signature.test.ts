import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from './webhook-signature.js';

const SECRET = 'test-secret';

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
  it('accepts a validly-signed body', () => {
    const body = JSON.stringify({ hello: 'world' });
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ hello: 'world' });
    const signature = sign(body);
    const tampered = JSON.stringify({ hello: 'mallory' });
    expect(verifyWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a signature produced with the wrong secret', () => {
    const body = JSON.stringify({ hello: 'world' });
    expect(verifyWebhookSignature(body, sign(body, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyWebhookSignature('{}', undefined, SECRET)).toBe(false);
  });

  it('rejects a signature header missing the sha256= prefix', () => {
    const body = '{}';
    const rawHex = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
    expect(verifyWebhookSignature(body, rawHex, SECRET)).toBe(false);
  });

  it('rejects a malformed hex signature without throwing', () => {
    expect(verifyWebhookSignature('{}', 'sha256=not-hex', SECRET)).toBe(false);
  });
});
