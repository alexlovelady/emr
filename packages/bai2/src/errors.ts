/** Thrown for any structurally invalid BAI2 file — a missing file/group/account header or trailer,
 * or a record with too few fields for its type. Control-total mismatches are NOT structural errors
 * (a bank can export a slightly-off file and it's still worth reconciling what parsed) — those
 * surface as `warnings` on the parsed result instead. */
export class Bai2ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Bai2ParseError';
  }
}
