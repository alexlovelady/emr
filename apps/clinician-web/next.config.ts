import type { NextConfig } from 'next';

/**
 * Default Node server output (not static export) — the BFF's `middleware.ts` and Route Handlers
 * need a server runtime. See docs/adr/0006-clinician-web-bff-auth.md.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
