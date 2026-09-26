import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair, importPKCS8, importSPKI, type KeyLike } from 'jose';

export const JWT_ALG = 'ES256';

export interface KeyMaterial {
  privateKey: KeyLike;
  publicKey: KeyLike;
  kid: string;
}

/**
 * Loads the ES256 signing keypair from PRIVATE_KEY_PATH/PUBLIC_KEY_PATH, generating and
 * persisting a new dev-only keypair if absent. This is explicitly a development convenience
 * (ADR-0002: no external IdP yet) — a real deployment must provision keys via AWS Secrets
 * Manager/KMS (spec §18.1), not rely on this auto-generation path.
 */
export async function loadOrCreateKeyMaterial(privateKeyPath: string, publicKeyPath: string): Promise<KeyMaterial> {
  try {
    const [privatePem, publicPem] = await Promise.all([
      fs.readFile(privateKeyPath, 'utf8'),
      fs.readFile(publicKeyPath, 'utf8'),
    ]);
    const privateKey = await importPKCS8(privatePem, JWT_ALG);
    const publicKey = await importSPKI(publicPem, JWT_ALG);
    return { privateKey, publicKey, kid: await computeKid(publicKey) };
  } catch {
    console.warn(
      `[auth-adapter] No JWT signing key found at ${privateKeyPath} — generating a new ES256 ` +
        'dev keypair and writing it to disk. This is a development convenience only (see ' +
        'ADR-0002); production must provision keys via AWS Secrets Manager/KMS, never this path.',
    );
    const { privateKey, publicKey } = await generateKeyPair(JWT_ALG, { extractable: true });
    await fs.mkdir(path.dirname(privateKeyPath), { recursive: true });
    await fs.mkdir(path.dirname(publicKeyPath), { recursive: true });
    await fs.writeFile(privateKeyPath, await exportPKCS8(privateKey), { mode: 0o600 });
    await fs.writeFile(publicKeyPath, await exportSPKI(publicKey), { mode: 0o644 });
    return { privateKey, publicKey, kid: await computeKid(publicKey) };
  }
}

async function computeKid(publicKey: KeyLike): Promise<string> {
  const jwk = await exportJWK(publicKey);
  return createHash('sha256').update(JSON.stringify(jwk)).digest('hex').slice(0, 16);
}
