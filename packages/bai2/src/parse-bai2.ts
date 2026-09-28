import { Bai2ParseError } from './errors.js';
import type { Bai2Account, Bai2File, Bai2Group, ParseBai2Result } from './types.js';

/**
 * `/` is BAI2's true record terminator (not the newline) — splitting on it first, rather than on
 * lines, handles both "one record per line" exports (the common case) and files with multiple
 * short records packed onto one physical line.
 */
function tokenizeRecords(rawText: string): string[][] {
  const rawRecords = rawText
    .split('/')
    .map((r) => r.replace(/\r?\n/g, '').trim())
    .filter((r) => r.length > 0);

  const records: string[][] = [];
  for (const raw of rawRecords) {
    const fields = raw.split(',').map((f) => f.trim());
    if (fields[0] === '88') {
      const prev = records[records.length - 1];
      if (!prev) throw new Bai2ParseError('Continuation record (88) with no preceding record to continue');
      prev.push(...fields.slice(1));
    } else {
      records.push(fields);
    }
  }
  return records;
}

function parseAmount(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Bai2ParseError(`Invalid amount field: '${raw}'`);
  return n;
}

/**
 * Parses a BAI2 file's full mandatory structure: one file header/trailer, one or more groups, one
 * or more accounts per group, zero or more transaction details per account. Throws `Bai2ParseError`
 * only for structural problems (a missing or out-of-order required record) — a control-total
 * mismatch is reported as a warning instead, since the transaction data is still usable even when a
 * bank's own trailer total is off (see `types.ts`'s doc comment on `warnings`).
 */
export function parseBai2(rawText: string): ParseBai2Result {
  const records = tokenizeRecords(rawText);
  const warnings: string[] = [];
  let i = 0;

  function expect(code: string): string[] {
    const rec = records[i];
    if (!rec || rec[0] !== code) {
      throw new Bai2ParseError(`Expected a '${code}' record at position ${i}, got '${rec?.[0] ?? '(end of file)'}'`);
    }
    i++;
    return rec;
  }

  const fileHeader = expect('01');
  const file: Bai2File = {
    senderId: fileHeader[1] ?? '',
    receiverId: fileHeader[2] ?? '',
    fileCreationDate: fileHeader[3] ?? '',
    fileCreationTime: fileHeader[4] ?? '',
    fileIdNumber: fileHeader[5] ?? '',
    groups: [],
    controlTotalCents: null,
    groupCount: null,
    recordCount: null,
  };

  while (records[i]?.[0] === '02') {
    const groupHeader = expect('02');
    const group: Bai2Group = {
      receiverId: groupHeader[1] ?? '',
      originatorId: groupHeader[2] ?? '',
      asOfDate: groupHeader[4] ?? '',
      accounts: [],
      controlTotalCents: null,
      accountCount: null,
      recordCount: null,
    };

    while (records[i]?.[0] === '03') {
      const acctHeader = expect('03');
      const account: Bai2Account = {
        accountNumber: acctHeader[1] ?? '',
        currencyCode: acctHeader[2] || null,
        summaries: [],
        transactions: [],
        controlTotalCents: null,
        recordCount: null,
      };
      // Repeating (type_code, amount, item_count, funds_type) quads, starting at field index 3.
      // Does not decompose a complex/distributed funds-type sub-structure (rare outside large
      // corporate treasury feeds) — see types.ts's doc comment.
      for (let f = 3; f + 1 < acctHeader.length && acctHeader[f]; f += 4) {
        account.summaries.push({
          typeCode: acctHeader[f]!,
          amountCents: parseAmount(acctHeader[f + 1]),
          itemCount: acctHeader[f + 2] ? Number(acctHeader[f + 2]) : null,
          fundsType: acctHeader[f + 3] ?? '',
        });
      }

      while (records[i]?.[0] === '16') {
        const txn = expect('16');
        account.transactions.push({
          typeCode: txn[1] ?? '',
          amountCents: parseAmount(txn[2]),
          fundsType: txn[3] ?? '',
          bankReferenceNumber: txn[4] || null,
          customerReferenceNumber: txn[5] || null,
          text: txn.slice(6).filter(Boolean).join(' ') || null,
        });
      }

      const acctTrailer = expect('49');
      account.controlTotalCents = parseAmount(acctTrailer[1]);
      account.recordCount = acctTrailer[2] ? Number(acctTrailer[2]) : null;

      const actualAccountTotal =
        account.summaries.reduce((sum, s) => sum + s.amountCents, 0) + account.transactions.reduce((sum, t) => sum + t.amountCents, 0);
      if (actualAccountTotal !== account.controlTotalCents) {
        warnings.push(
          `Account ${account.accountNumber}: trailer control total ${account.controlTotalCents} does not match the sum of its records (${actualAccountTotal})`,
        );
      }

      group.accounts.push(account);
    }

    const groupTrailer = expect('98');
    group.controlTotalCents = parseAmount(groupTrailer[1]);
    group.accountCount = groupTrailer[2] ? Number(groupTrailer[2]) : null;
    group.recordCount = groupTrailer[3] ? Number(groupTrailer[3]) : null;

    const actualGroupTotal = group.accounts.reduce((sum, a) => sum + (a.controlTotalCents ?? 0), 0);
    if (actualGroupTotal !== group.controlTotalCents) {
      warnings.push(`Group ${group.originatorId}: trailer control total ${group.controlTotalCents} does not match the sum of its accounts (${actualGroupTotal})`);
    }

    file.groups.push(group);
  }

  const fileTrailer = expect('99');
  file.controlTotalCents = parseAmount(fileTrailer[1]);
  file.groupCount = fileTrailer[2] ? Number(fileTrailer[2]) : null;
  file.recordCount = fileTrailer[3] ? Number(fileTrailer[3]) : null;

  const actualFileTotal = file.groups.reduce((sum, g) => sum + (g.controlTotalCents ?? 0), 0);
  if (actualFileTotal !== file.controlTotalCents) {
    warnings.push(`File trailer control total ${file.controlTotalCents} does not match the sum of its groups (${actualFileTotal})`);
  }

  if (i !== records.length) {
    warnings.push(`${records.length - i} record(s) after the file trailer were ignored`);
  }

  return { file, warnings };
}
