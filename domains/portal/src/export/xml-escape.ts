/** Minimal XML text-content escaping — no attribute-quote-specific escaping needed since every
 * value this module writes goes into element text content, never an attribute value. */
export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
