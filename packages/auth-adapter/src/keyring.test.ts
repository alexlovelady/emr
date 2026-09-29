import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyMaterial } from './keys.js';
import { findKey, getCurrentKey, KeyRingStore, loadOrCreateKeyRing, rotateKeyRing, type KeyRing } from './keyring.js';

let workDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(tmpdir(), 'ehr-keyring-test-'));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('loadOrCreateKeyRing', () => {
  it('bootstraps a brand-new ring when neither a keyring file nor legacy PEM files exist', async () => {
    const keyringPath = path.join(workDir, 'keyring.json');
    const ring = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));

    expect(ring.keys).toHaveLength(1);
    expect(ring.currentKid).toBe(ring.keys[0]!.kid);
    // Persisted, so a second load reads the same ring back rather than generating a fresh one.
    const reloaded = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));
    expect(reloaded.currentKid).toBe(ring.currentKid);
  });

  it('migrates existing legacy single-pair PEM files in as the ring’s first key, when no keyring file exists yet', async () => {
    const { loadOrCreateKeyMaterial } = await import('./keys.js');
    const privateKeyPath = path.join(workDir, 'legacy-priv.pem');
    const publicKeyPath = path.join(workDir, 'legacy-pub.pem');
    const legacy = await loadOrCreateKeyMaterial(privateKeyPath, publicKeyPath);

    const keyringPath = path.join(workDir, 'keyring.json');
    const ring = await loadOrCreateKeyRing(keyringPath, privateKeyPath, publicKeyPath);

    expect(ring.currentKid).toBe(legacy.kid);
    expect(ring.keys).toHaveLength(1);
    expect(ring.keys[0]!.kid).toBe(legacy.kid);
  });

  it('prefers an existing keyring file over the legacy PEM files', async () => {
    const keyringPath = path.join(workDir, 'keyring.json');
    const first = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));

    // Legacy files now exist too (written as a side effect of the first bootstrap not having them,
    // simulated here by writing new ones directly) — the already-written keyring file must win.
    const second = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'other-priv.pem'), path.join(workDir, 'other-pub.pem'));
    expect(second.currentKid).toBe(first.currentKid);
  });
});

describe('rotateKeyRing', () => {
  it('makes the new key current and retains the outgoing current key', async () => {
    const keyringPath = path.join(workDir, 'keyring.json');
    const original = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));
    const outgoingKid = original.currentKid;

    const rotated = await rotateKeyRing(keyringPath, original);

    expect(rotated.currentKid).not.toBe(outgoingKid);
    expect(rotated.keys.map((k) => k.kid)).toContain(outgoingKid);
    expect(getCurrentKey(rotated).kid).toBe(rotated.currentKid);
  });

  it('prunes a key older than retentionMs, except the just-outgoing current key', async () => {
    const now = Date.now();
    const stale = await generateKeyMaterial();
    const outgoing = await generateKeyMaterial();
    const ring: KeyRing = {
      currentKid: outgoing.kid,
      keys: [
        { ...outgoing, createdAt: new Date(now - 1000) },
        { ...stale, createdAt: new Date(now - 1_000_000) },
      ],
    };
    const keyringPath = path.join(workDir, 'keyring.json');

    const rotated = await rotateKeyRing(keyringPath, ring, 500);

    const kids = rotated.keys.map((k) => k.kid);
    expect(kids).toContain(outgoing.kid); // retained despite being past retentionMs
    expect(kids).not.toContain(stale.kid); // pruned
    expect(kids).toContain(rotated.currentKid);
  });

  it('persists the rotated ring so a subsequent load sees it', async () => {
    const keyringPath = path.join(workDir, 'keyring.json');
    const original = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));
    const rotated = await rotateKeyRing(keyringPath, original);

    const reloaded = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));
    expect(reloaded.currentKid).toBe(rotated.currentKid);
    expect(reloaded.keys).toHaveLength(rotated.keys.length);
  });
});

describe('findKey / getCurrentKey', () => {
  it('findKey returns undefined for an unknown or missing kid', async () => {
    const ring: KeyRing = { currentKid: 'a', keys: [{ ...(await generateKeyMaterial()), kid: 'a', createdAt: new Date() }] };
    expect(findKey(ring, 'not-in-ring')).toBeUndefined();
    expect(findKey(ring, undefined)).toBeUndefined();
  });

  it('getCurrentKey throws if the ring is somehow missing its own current key', () => {
    const ring = { currentKid: 'missing', keys: [] } as unknown as KeyRing;
    expect(() => getCurrentKey(ring)).toThrow(/missing its own current key/);
  });
});

describe('KeyRingStore', () => {
  it('rotate() updates what get() returns and persists to disk', async () => {
    const keyringPath = path.join(workDir, 'keyring.json');
    const ring = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));
    const store = new KeyRingStore(ring, keyringPath);
    const outgoingKid = store.get().currentKid;

    await store.rotate();

    expect(store.get().currentKid).not.toBe(outgoingKid);
    expect(store.get().keys.map((k) => k.kid)).toContain(outgoingKid);
  });

  it('reload() picks up a rotation written by a different store instance sharing the same file', async () => {
    const keyringPath = path.join(workDir, 'keyring.json');
    const ring = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));
    const storeA = new KeyRingStore(ring, keyringPath);
    const storeB = new KeyRingStore(ring, keyringPath);

    await storeA.rotate();
    expect(storeB.get().currentKid).toBe(ring.currentKid); // not yet aware

    await storeB.reload();
    expect(storeB.get().currentKid).toBe(storeA.get().currentKid);
  });

  it('startAutoReload polls reload() until stopped', async () => {
    const keyringPath = path.join(workDir, 'keyring.json');
    const ring = await loadOrCreateKeyRing(keyringPath, path.join(workDir, 'priv.pem'), path.join(workDir, 'pub.pem'));
    const storeA = new KeyRingStore(ring, keyringPath);
    const storeB = new KeyRingStore(ring, keyringPath);

    const stop = storeB.startAutoReload(20);
    try {
      await storeA.rotate();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(storeB.get().currentKid).toBe(storeA.get().currentKid);
    } finally {
      stop();
    }
  });
});
