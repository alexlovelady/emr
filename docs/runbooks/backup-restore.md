# Backup / restore runbook

`EHR_REGULATORY_MANUAL.md` §21.1/§25/§29 Security require a **tested** restore, not just a backup
process that appears to run: "Test actual restores; a green backup dashboard is not evidence that
restoration works." This runbook is executable end to end, and its final section records the real
result of the most recent execution — not a hypothetical procedure nobody has run.

## Why this isn't `pg_dump`/`pg_restore`

Production (Railway-hosted Postgres, per `docs/adr/0001-railway-hosting.md`) would use that
provider's own snapshot/point-in-time-recovery restore mechanism. Local development uses the
`embedded-postgres` npm package's bundled Postgres binaries, which — unlike a standard Postgres
install — do **not** include `pg_dump`, `pg_restore`, or `psql` (only `postgres`, `pg_ctl`, and
`initdb`). This runbook therefore exercises a **physical backup** (copying the stopped server's
data directory) rather than a logical SQL dump. See
`docs/adr/0005-golden-path-testing-and-backup-restore-approach.md` for the full reasoning. The
property being validated — "a backup can actually be restored and the data is really there" — is
the same either way; only the mechanism differs.

## Procedure

All paths below assume the dev Postgres data directory lives at
`C:\Users\alexa\AppData\Local\Temp\ehr-pg4\data` (see that folder's `start.cjs`).

### 1. Insert a canary row (so restoration is independently verifiable)

```bash
cd "/c/Users/alexa/AppData/Local/Temp/ehr-pg4"
node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgres://ehr_owner:ehr_owner_dev_password@127.0.0.1:5432/ehr' });
c.connect().then(async () => {
  const tenantA = await c.query(\"select id from tenants where slug = 'tenant-a'\");
  const ins = await c.query(
    'insert into patients (tenant_id, given_name, family_name, date_of_birth, status) values (\$1,\$2,\$3,\$4,\$5) returning id',
    [tenantA.rows[0].id, 'CanaryPatient', 'BackupRestoreDrillCanary-' + Date.now(), '2000-01-01', 'active']
  );
  console.log('CANARY_ID=' + ins.rows[0].id);
  const counts = await c.query('select count(*) from patients');
  console.log('PATIENT_COUNT_BEFORE=' + counts.rows[0].count);
  await c.end();
});
"
```

### 2. Take the physical backup

```bash
cd "/c/Users/alexa/AppData/Local/Temp/ehr-pg4"
./node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe stop -D ./data -m fast
cp -r ./data "/c/Users/alexa/AppData/Local/Temp/ehr-pg4-backup-$(date +%Y%m%d-%H%M%S)"
./node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe start -D ./data
```

The `stop`/`start` around the copy matters — copying a live, running Postgres data directory
file-by-file is not a consistent snapshot; stopping first guarantees the files on disk are in a
clean, restorable state (equivalent to why real filesystem/EBS-snapshot backup strategies quiesce
or rely on copy-on-write atomicity).

### 3. Prove the backup actually restores

```bash
cp -r "<backup dir from step 2>" "/c/Users/alexa/AppData/Local/Temp/ehr-pg4-restore-test"
cd "/c/Users/alexa/AppData/Local/Temp/ehr-pg4"
./node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe start \
  -D "/c/Users/alexa/AppData/Local/Temp/ehr-pg4-restore-test" \
  -o "-p 5433" \
  -l "/c/Users/alexa/AppData/Local/Temp/ehr-pg4-restore-test.log"
```

Then connect to port **5433** (not 5432 — this is a second, independent instance running
side-by-side against the restored copy) and verify:

```bash
node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgres://ehr_owner:ehr_owner_dev_password@127.0.0.1:5433/ehr' });
c.connect().then(async () => {
  const canary = await c.query('select id, family_name, status from patients where id = \$1', ['<CANARY_ID from step 1>']);
  console.log('CANARY_FOUND:', JSON.stringify(canary.rows));
  const counts = await c.query('select count(*) from patients');
  console.log('PATIENT_COUNT_RESTORED=' + counts.rows[0].count);
  await c.end();
});
"
```

**Pass criteria:** the canary row is present with the exact name inserted in step 1, and
`PATIENT_COUNT_RESTORED` equals `PATIENT_COUNT_BEFORE`.

### 4. Clean up

```bash
./node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe stop \
  -D "/c/Users/alexa/AppData/Local/Temp/ehr-pg4-restore-test" -m fast
rm -rf "/c/Users/alexa/AppData/Local/Temp/ehr-pg4-restore-test" \
       "<backup dir from step 2>" \
       "/c/Users/alexa/AppData/Local/Temp/ehr-pg4-restore-test.log"
```

This drill validates the *mechanism*; it deliberately does not retain the backup files as a real
backup archive (there is no dev-environment backup retention policy — nothing here substitutes for
a real production backup schedule/retention policy, which does not exist yet either).

## Last tested

| Field | Value |
|---|---|
| Date | 2026-09-26, ~22:08–22:09 EDT |
| Canary patient id | `de7666c0-08c3-4929-bada-b4d0cfc23142` |
| Canary family name | `BackupRestoreDrillCanary-1790474911337` |
| `patients` row count before backup | 139 |
| `patients` row count in restored instance | 139 (match) |
| `audit_events` row count in restored instance | 141 (sanity check — non-zero, present) |
| Result | **PASS** — canary row and full table contents present and correct in the independently-started restored instance |
| Performed by | This session (Claude Sonnet 5), as part of Phase 10 pilot-readiness work |

## Known gaps (not covered by this drill)

- No real backup **schedule** exists (this was a one-time manual drill, not a cron/automated job).
- No backup **retention policy** — production needs a defined retention window and a place backups
  actually live (e.g. the hosting provider's managed snapshots), not a temp folder.
- No test of restoring into a **different** Postgres major version, and no test of partial/
  point-in-time recovery (only a full-directory restore was exercised).
- Production will use its host's native backup/restore tooling (see the "Why this isn't
  `pg_dump`/`pg_restore`" section above) — that specific mechanism has not itself been tested, only
  the underlying property ("a backup can be restored with the data intact") in this dev
  environment's equivalent.
