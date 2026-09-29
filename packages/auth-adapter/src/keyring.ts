import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { exportPKCS8, exportSPKI, importPKCS8, importSPKI } from 'jose';
import { JWT_ALG, generateKeyMaterial, loadOrCreateKeyMaterial, type KeyMaterial } from './keys.js';

export interface KeyRingEntry extends KeyMaterial {
  createdAt: Date;
}

/** `keys[0]` is always the current signing key (`currentKid`) — everything after it is retained
 * only so a token signed before the most recent rotation still verifies. */
export interface KeyRing {
  currentKid: string;
  keys: KeyRingEntry[];
}

interface StoredKeyEntry {
  kid: string;
  privateKeyPem: string;
  publicKeyPem: string;
  createdAt: string;
}

interface StoredKeyRing {
  currentKid: string;
  keys: StoredKeyEntry[];
}

/** Same "plaintext PEM on disk" posture `loadOrCreateKeyMaterial` already documents as a dev-only
 * convenience (ADR-0002) — a real deployment provisions keys via AWS Secrets Manager/KMS, never
 * this path. Rotation is real either way; only the storage backend would change. */
async function readStoredRing(keyringPath: string): Promise<StoredKeyRing | null> {
  try {
    const raw = await fs.readFile(keyringPath, 'utf8');
    return JSON.parse(raw) as StoredKeyRing;
  } catch {
    return null;
  }
}

async function writeStoredRing(keyringPath: string, ring: KeyRing): Promise<void> {
  const stored: StoredKeyRing = {
    currentKid: ring.currentKid,
    keys: await Promise.all(
      ring.keys.map(async (k) => ({
        kid: k.kid,
        privateKeyPem: await exportPKCS8(k.privateKey),
        publicKeyPem: await exportSPKI(k.publicKey),
        createdAt: k.createdAt.toISOString(),
      })),
    ),
  };
  await fs.mkdir(path.dirname(keyringPath), { recursive: true });
  await fs.writeFile(keyringPath, JSON.stringify(stored, null, 2), { mode: 0o600 });
}

async function hydrateRing(stored: StoredKeyRing): Promise<KeyRing> {
  const keys = await Promise.all(
    stored.keys.map(async (entry) => ({
      kid: entry.kid,
      privateKey: await importPKCS8(entry.privateKeyPem, JWT_ALG),
      publicKey: await importSPKI(entry.publicKeyPem, JWT_ALG),
      createdAt: new Date(entry.createdAt),
    })),
  );
  return { currentKid: stored.currentKid, keys };
}

/**
 * Replaces `FirstPartyIdentityProvider`'s old single `KeyMaterial` with a rotatable ring. Load
 * order: (1) an existing keyring file, (2) the legacy single-pair files
 * (`JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`) migrated in as the ring's first key — so
 * upgrading to this doesn't invalidate every already-issued token on deploy — or (3) bootstrap a
 * brand-new ring, same dev-convenience behavior `loadOrCreateKeyMaterial` already had.
 */
export async function loadOrCreateKeyRing(keyringPath: string, legacyPrivateKeyPath: string, legacyPublicKeyPath: string): Promise<KeyRing> {
  const stored = await readStoredRing(keyringPath);
  if (stored) return hydrateRing(stored);

  const legacy = await loadOrCreateKeyMaterial(legacyPrivateKeyPath, legacyPublicKeyPath);
  const ring: KeyRing = { currentKid: legacy.kid, keys: [{ ...legacy, createdAt: new Date() }] };
  await writeStoredRing(keyringPath, ring);
  return ring;
}

/** Re-reads the keyring file from disk without creating one — the periodic reload every process
 * other than the one that performed the rotation uses to pick it up (see each app's
 * `KEY_RING_RELOAD_INTERVAL_MS`-driven poll). Returns `null` on a transient read/parse failure
 * (e.g. another process mid-write) so a caller can just keep its current in-memory ring and retry
 * next tick, rather than crashing on a momentary race. */
export async function reloadKeyRing(keyringPath: string): Promise<KeyRing | null> {
  const stored = await readStoredRing(keyringPath);
  if (!stored) return null;
  try {
    return await hydrateRing(stored);
  } catch {
    return null;
  }
}

/**
 * Generates a new current signing key and prunes any key older than `retentionMs` (the previous
 * current key is always kept at least once more here, even if technically past the retention
 * window, so a token signed moments before this call — using the outgoing key — doesn't
 * immediately fail to verify; it ages out on the *next* rotation instead). Default retention is
 * generous (7 days) relative to any realistic access-token TTL (minutes) precisely so an
 * in-flight token is never the reason to make this window tight.
 */
export async function rotateKeyRing(keyringPath: string, ring: KeyRing, retentionMs: number = 7 * 24 * 60 * 60 * 1000): Promise<KeyRing> {
  const fresh = await generateKeyMaterial();
  const now = new Date();
  const previousCurrent = ring.keys.find((k) => k.kid === ring.currentKid);
  const retained = ring.keys.filter((k) => now.getTime() - k.createdAt.getTime() <= retentionMs);
  const keys: KeyRingEntry[] = [
    { ...fresh, createdAt: now },
    // previousCurrent is unconditionally kept here regardless of its own age — see this
    // function's doc comment — so it must never be dropped just because it also happens to
    // already be within the (normal, non-edge-case) retention window below.
    ...(previousCurrent ? [previousCurrent] : []),
    ...retained.filter((k) => k.kid !== previousCurrent?.kid),
  ];
  const rotated: KeyRing = { currentKid: fresh.kid, keys };
  await writeStoredRing(keyringPath, rotated);
  return rotated;
}

export function getCurrentKey(ring: KeyRing): KeyRingEntry {
  const current = ring.keys.find((k) => k.kid === ring.currentKid);
  if (!current) throw new Error(`Key ring is missing its own current key (kid=${ring.currentKid}) — this is a bug, not a runtime condition`);
  return current;
}

export function findKey(ring: KeyRing, kid: string | undefined): KeyRingEntry | undefined {
  if (kid === undefined) return undefined;
  return ring.keys.find((k) => k.kid === kid);
}

/**
 * A mutable, shareable holder for a process's in-memory `KeyRing` — the piece that actually makes
 * rotation propagate. Every consumer that needs "the current keys" (the identity provider that
 * signs new tokens, the Fastify hooks that verify a bearer token by its `kid`, interop-fhir's
 * SMART-token sign/verify, interop-hl7's staff-token verify) holds a reference to the SAME store
 * instance and always calls `.get()` fresh per request/operation rather than capturing a `KeyRing`
 * once — so `.rotate()` (called by whichever process handles the admin rotate request) and
 * `.reload()` (polled by every OTHER process sharing the same keyring file, since a rotation
 * performed in one Node process's memory never reaches another process's memory on its own) both
 * take effect immediately for every caller already holding this store, no restart needed.
 */
export class KeyRingStore {
  private ring: KeyRing;

  constructor(
    initial: KeyRing,
    private readonly keyringPath: string,
  ) {
    this.ring = initial;
  }

  get(): KeyRing {
    return this.ring;
  }

  /** Generates a new current key and prunes retention-expired ones; see `rotateKeyRing`. */
  async rotate(retentionMs?: number): Promise<void> {
    this.ring = await rotateKeyRing(this.keyringPath, this.ring, retentionMs);
  }

  /** Re-reads the keyring file; a no-op (keeps the current in-memory ring) if the file is
   * unreadable/unparseable at this instant — see `reloadKeyRing`'s own doc comment. */
  async reload(): Promise<void> {
    const fresh = await reloadKeyRing(this.keyringPath);
    if (fresh) this.ring = fresh;
  }

  /** Starts a `reload()` poll every `intervalMs`; returns a function that stops it. The returned
   * timer is `unref()`'d so it never by itself keeps the Node process alive (matches every other
   * background poller in this codebase, e.g. OutboxRelay). */
  startAutoReload(intervalMs: number): () => void {
    const timer = setInterval(() => {
      this.reload().catch(() => undefined);
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }
}

/** Convenience constructor combining `loadOrCreateKeyRing` with wrapping the result in a
 * `KeyRingStore` — what every app's core module actually calls. */
export async function createKeyRingStore(
  keyringPath: string,
  legacyPrivateKeyPath: string,
  legacyPublicKeyPath: string,
): Promise<KeyRingStore> {
  const ring = await loadOrCreateKeyRing(keyringPath, legacyPrivateKeyPath, legacyPublicKeyPath);
  return new KeyRingStore(ring, keyringPath);
}
