/** One JSON object per line, per the HL7 Bulk Data Access IG's NDJSON output format. */
export function toNdjson(resources: Record<string, unknown>[]): string {
  return resources.map((resource) => JSON.stringify(resource)).join('\n') + (resources.length > 0 ? '\n' : '');
}
