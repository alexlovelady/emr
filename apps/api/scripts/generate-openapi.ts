import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';
import { LoginSchema, RefreshSchema, MfaChallengeSchema } from '../src/auth/auth.dto.js';
import { CreateOrganizationSchema, CreateLocationSchema } from '@ehr/tenant';
import { CreateUserSchema, CreatePractitionerSchema } from '@ehr/workforce';
import { RequestUploadSchema } from '@ehr/documents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generates docs/api/openapi.json from the same Zod schemas each controller validates requests
 * with (packages/api-contracts' ZodValidationPipe) — one source of truth, per spec §2.1's "Zod
 * at external boundaries." CI (openapi-contract-check) regenerates this and fails on any diff,
 * so the committed file can never silently drift from the actual request contracts.
 *
 * Deliberately request-body-only for now: modeling every response shape would require turning
 * each domain's *Row interface into a Zod schema too (currently TypeScript-only) — a reasonable
 * next increment, not done here. GET endpoints are listed with a generic 200 response.
 */
function schema(s: ZodSchema, name: string) {
  return zodToJsonSchema(s, name).definitions?.[name] ?? zodToJsonSchema(s);
}

const problemDetail = {
  type: 'object',
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: {},
    instance: { type: 'string' },
    request_id: { type: 'string' },
  },
  required: ['type', 'title', 'status'],
};

function jsonBody(s: ZodSchema, name: string) {
  return { content: { 'application/json': { schema: schema(s, name) } } };
}

const problemResponse = { description: 'Problem Details (RFC 7807)', content: { 'application/json': { schema: problemDetail } } };
const responses = (successDescription: string, successSchema?: unknown) => ({
  ...(successSchema
    ? { '200': { description: successDescription, content: { 'application/json': { schema: successSchema } } } }
    : { '200': { description: successDescription } }),
  '400': problemResponse,
  '401': problemResponse,
  '403': problemResponse,
  '404': problemResponse,
  '409': problemResponse,
  '422': problemResponse,
});

function post(summary: string, tag: string, body?: ZodSchema, bodyName?: string) {
  return {
    post: {
      summary,
      tags: [tag],
      ...(body && bodyName ? { requestBody: { required: true, ...jsonBody(body, bodyName) } } : {}),
      responses: responses('Success'),
    },
  };
}

function get(summary: string, tag: string, params: string[] = []) {
  return {
    get: {
      summary,
      tags: [tag],
      parameters: params.map((p) => ({ name: p, in: 'path', required: true, schema: { type: 'string' } })),
      responses: responses('Success'),
    },
  };
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'EHR Product API',
    version: '0.1.0',
    description:
      'Phase 1 platform-foundation surface (Lane B, spec §8.2). Generated from apps/api/scripts/generate-openapi.ts — do not hand-edit docs/api/openapi.json.',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/auth/login': post('Log in with tenant slug + email + password', 'Auth', LoginSchema, 'Login'),
    '/auth/refresh': post('Rotate a refresh token for a new access/refresh pair', 'Auth', RefreshSchema, 'Refresh'),
    '/auth/logout': post('Revoke a refresh token', 'Auth', RefreshSchema, 'Logout'),
    '/auth/mfa/challenge': {
      post: {
        summary: 'MFA challenge (structural stub — always 501, see ADR-0002)',
        tags: ['Auth'],
        requestBody: { required: true, ...jsonBody(MfaChallengeSchema, 'MfaChallenge') },
        responses: { '501': problemResponse },
      },
    },
    '/organizations': {
      ...post('Create an organization', 'Tenant', CreateOrganizationSchema, 'CreateOrganization'),
      ...get('List organizations in the caller’s tenant', 'Tenant'),
    },
    '/organizations/{id}': get('Get an organization by id', 'Tenant', ['id']),
    '/locations': {
      ...post('Create a location', 'Tenant', CreateLocationSchema, 'CreateLocation'),
      ...get('List locations in the caller’s tenant', 'Tenant'),
    },
    '/locations/{id}': get('Get a location by id', 'Tenant', ['id']),
    '/users': {
      ...post('Create a workforce user', 'Workforce', CreateUserSchema, 'CreateUser'),
      ...get('List users in the caller’s tenant', 'Workforce'),
    },
    '/users/{id}': get('Get a user by id', 'Workforce', ['id']),
    '/practitioners': {
      ...post('Create a practitioner (and its WorkforceIdentity link)', 'Workforce', CreatePractitionerSchema, 'CreatePractitioner'),
      ...get('List practitioners in the caller’s tenant', 'Workforce'),
    },
    '/practitioners/{id}': get('Get a practitioner by id', 'Workforce', ['id']),
    '/documents': post('Request a presigned upload URL', 'Documents', RequestUploadSchema, 'RequestUpload'),
    '/documents/{id}/confirm': post('Confirm a completed upload', 'Documents'),
    '/documents/{id}/download-url': get('Get a presigned download URL', 'Documents', ['id']),
  },
  components: {
    schemas: { ProblemDetail: problemDetail },
  },
};

async function main(): Promise<void> {
  const outPath = path.join(__dirname, '..', '..', '..', 'docs', 'api', 'openapi.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(document, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[generate-openapi] wrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error('[generate-openapi] failed:', err);
  process.exit(1);
});
