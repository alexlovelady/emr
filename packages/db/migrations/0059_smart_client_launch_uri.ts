import { Kysely } from 'kysely';

/**
 * Item 24: the registered launch URL a third-party app exposes for the EHR to redirect a clinician
 * to when starting an EHR launch (SMART App Launch spec — the EHR navigates the browser to
 * `launch_uri?iss=<FHIR base>&launch=<opaque context id>`, and the app then begins its own
 * `/authorize` request carrying that `launch` value back). Nullable: an existing client with no
 * launch URL registered simply isn't EHR-launchable — standalone launch is completely unaffected.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('smart_clients').addColumn('launch_uri', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('smart_clients').dropColumn('launch_uri').execute();
}
