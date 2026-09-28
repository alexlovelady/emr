import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchRxNorm, validateRxNormCode } from './rxnav-client.js';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('validateRxNormCode', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports a real RxCUI as valid, checked, with its display name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ properties: { rxcui: '861007', name: 'metformin hydrochloride 500 MG Oral Tablet' } })),
    );
    expect(await validateRxNormCode('861007')).toEqual({
      valid: true,
      checked: true,
      display: 'metformin hydrochloride 500 MG Oral Tablet',
    });
  });

  it('reports an unknown RxCUI as invalid but checked — RxNav returns an empty object, not a 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    expect(await validateRxNormCode('99999999')).toEqual({ valid: false, checked: true });
  });

  it('reports checked:false (not valid:false) on an HTTP error — never claim a code is wrong when we could not ask', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)));
    expect(await validateRxNormCode('861007')).toEqual({ valid: false, checked: false });
  });

  it('reports checked:false on a network failure or timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await validateRxNormCode('861007')).toEqual({ valid: false, checked: false });
  });
});

describe('searchRxNorm', () => {
  afterEach(() => vi.restoreAllMocks());

  it('flattens prescribable term-type groups into concept matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          drugGroup: {
            conceptGroup: [
              { tty: 'IN' }, // no conceptProperties at all — should be skipped, not crash
              {
                tty: 'SCD',
                conceptProperties: [{ rxcui: '861007', name: 'metformin hydrochloride 500 MG Oral Tablet' }],
              },
              {
                tty: 'SBD',
                conceptProperties: [{ rxcui: '861008', name: 'Glucophage 500 MG Oral Tablet' }],
              },
            ],
          },
        }),
      ),
    );
    expect(await searchRxNorm('metformin', 20)).toEqual([
      { code: '861007', display: 'metformin hydrochloride 500 MG Oral Tablet' },
      { code: '861008', display: 'Glucophage 500 MG Oral Tablet' },
    ]);
  });

  it('respects the limit across groups', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          drugGroup: {
            conceptGroup: [
              {
                tty: 'SCD',
                conceptProperties: [
                  { rxcui: '1', name: 'one' },
                  { rxcui: '2', name: 'two' },
                ],
              },
              { tty: 'SBD', conceptProperties: [{ rxcui: '3', name: 'three' }] },
            ],
          },
        }),
      ),
    );
    expect(await searchRxNorm('x', 1)).toEqual([{ code: '1', display: 'one' }]);
  });

  it('returns an empty array when RxNav finds nothing (no conceptGroup key at all)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ drugGroup: { name: null } })));
    expect(await searchRxNorm('zzznotarealdrug', 20)).toEqual([]);
  });

  it('returns an empty array on an HTTP error or network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)));
    expect(await searchRxNorm('metformin', 20)).toEqual([]);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await searchRxNorm('metformin', 20)).toEqual([]);
  });
});
