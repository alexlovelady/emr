/**
 * BAI2 (Bank Administration Institute Cash Management Balance Reporting, version 2) — the standard
 * fixed-structure format banks export for balance/transaction downloads. Amounts are integers in
 * the currency's minor unit (cents for USD) with no decimal point, per spec.
 *
 * This models the mandatory file/group/account/transaction hierarchy and continuation (`88`)
 * records. It does NOT decompose a `16` record's funds-availability sub-fields (BAI2's optional
 * "distribution of availability" structure within the funds-type field) — `fundsType` is kept as
 * the raw sub-field string. That's a real, deliberate scope limit: reconciliation only needs the
 * transaction amount/date/reference, not float-availability detail.
 */

export interface Bai2Transaction {
  typeCode: string;
  amountCents: number;
  fundsType: string;
  bankReferenceNumber: string | null;
  customerReferenceNumber: string | null;
  text: string | null;
}

export interface Bai2AccountSummary {
  typeCode: string;
  amountCents: number;
  itemCount: number | null;
  fundsType: string;
}

export interface Bai2Account {
  accountNumber: string;
  currencyCode: string | null;
  summaries: Bai2AccountSummary[];
  transactions: Bai2Transaction[];
  controlTotalCents: number | null;
  recordCount: number | null;
}

export interface Bai2Group {
  receiverId: string;
  originatorId: string;
  asOfDate: string;
  accounts: Bai2Account[];
  controlTotalCents: number | null;
  accountCount: number | null;
  recordCount: number | null;
}

export interface Bai2File {
  senderId: string;
  receiverId: string;
  fileCreationDate: string;
  fileCreationTime: string;
  fileIdNumber: string;
  groups: Bai2Group[];
  controlTotalCents: number | null;
  groupCount: number | null;
  recordCount: number | null;
}

export interface ParseBai2Result {
  file: Bai2File;
  /** Non-fatal issues — a control-total that doesn't match its own trailer, most commonly (a
   * truncated download, a bank's own export quirk). The parsed data is still returned: a corrupt
   * trailer doesn't mean the transaction detail is unusable, so warn rather than throw. */
  warnings: string[];
}
