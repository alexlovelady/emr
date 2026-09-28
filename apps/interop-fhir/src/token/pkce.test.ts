import { describe, expect, it } from 'vitest';
import { verifyPkce } from './pkce.js';

describe('verifyPkce', () => {
  it('accepts the real RFC 7636 S256 example vector', () => {
    // From RFC 7636 Appendix B.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it('rejects a mismatched verifier', () => {
    expect(verifyPkce('wrong-verifier', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(false);
  });
});
