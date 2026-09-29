import PDFDocument from 'pdfkit';
import type { PatientRow } from '@ehr/patient';
import type { ProblemRow, AllergyRow, NoteRow } from '@ehr/clinical';
import type { MedicationRow } from '@ehr/medication';
import type { DiagnosticReportRow } from '@ehr/results';

export interface RecordsPdfInput {
  generatedAt: Date;
  patient: PatientRow;
  problems: ProblemRow[];
  allergies: AllergyRow[];
  medications: MedicationRow[];
  notes: NoteRow[];
  results: DiagnosticReportRow[];
}

function section(doc: PDFKit.PDFDocument, title: string, items: string[]): void {
  doc.moveDown(0.5).fontSize(14).text(title, { underline: true });
  doc.fontSize(11);
  if (items.length === 0) {
    doc.text('None recorded.');
    return;
  }
  for (const item of items) doc.text(`• ${item}`);
}

/**
 * Item 25: a real, human-readable PDF clinical summary — not constrained by C-CDA's rigid schema
 * (see `ccd-generator.ts` for that), so it also includes signed notes, which CCD has no section
 * for. Built with `pdfkit` (pure JS, no headless-browser/native-binary dependency, matching this
 * repo's general aversion to heavy binary tooling — e.g. `packages/db-backup`'s own `pg_dump`
 * dependency is a documented pain point, not a pattern to repeat here).
 */
export function generateRecordsPdf(input: RecordsPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const { patient } = input;
  doc.fontSize(18).text('Patient Health Record Summary', { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Generated: ${input.generatedAt.toISOString()}`);
  doc.moveDown(0.5);
  doc.fontSize(14).text('Demographics', { underline: true });
  doc.fontSize(11);
  doc.text(`Name: ${patient.givenName}${patient.middleName ? ` ${patient.middleName}` : ''} ${patient.familyName}`);
  doc.text(`Date of birth: ${patient.dateOfBirth}`);
  if (patient.sexAtBirth) doc.text(`Sex at birth: ${patient.sexAtBirth}`);
  if (patient.phone) doc.text(`Phone: ${patient.phone}`);
  if (patient.email) doc.text(`Email: ${patient.email}`);

  section(
    doc,
    'Problems',
    input.problems.map((p) => `${p.displayName} (${p.clinicalStatus}${p.onsetDate ? `, onset ${p.onsetDate}` : ''})`),
  );
  section(
    doc,
    'Allergies',
    input.allergies.map((a) => `${a.substance}${a.reaction ? ` — reaction: ${a.reaction}` : ''}${a.severity ? ` (${a.severity})` : ''}`),
  );
  section(
    doc,
    'Medications',
    input.medications.map((m) => `${m.medicationName}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? `, ${m.frequency}` : ''} — ${m.status}`),
  );
  section(
    doc,
    'Signed notes',
    input.notes.map((n) => `${n.noteType} — signed ${n.signedAt?.toISOString().slice(0, 10) ?? 'unknown date'}`),
  );
  section(
    doc,
    'Results',
    input.results.map((r) => `${r.displayName}${r.conclusion ? `: ${r.conclusion}` : ''} (${r.issuedAt.toISOString().slice(0, 10)})`),
  );

  doc.end();
  return done;
}
