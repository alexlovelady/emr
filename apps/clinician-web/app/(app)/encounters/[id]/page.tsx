import { callBackend, callBackendOr } from '@/lib/api-proxy';
import { EncounterHeader } from '@/components/encounters/encounter-header';
import { NotesPanel } from '@/components/encounters/notes-panel';
import { OrdersPanel } from '@/components/encounters/orders-panel';
import { RecordResultDialog } from '@/components/encounters/record-result-dialog';
import { ChargesPanel } from '@/components/encounters/charges-panel';
import type { Charge, Encounter, Note, NoteTemplate, Order, Patient } from '@/lib/types';

export default async function EncounterWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const encounter = await callBackend<Encounter>(`/api/v1/encounters/${id}`);
  const [patient, notes, templates, patientOrders, patientCharges] = await Promise.all([
    callBackend<Patient>(`/api/v1/patients/${encounter.patientId}`),
    callBackend<Note[]>('/api/v1/notes', { query: { encounterId: id } }),
    callBackend<NoteTemplate[]>('/api/v1/note-templates'),
    callBackend<Order[]>('/api/v1/orders', { query: { patientId: encounter.patientId } }),
    callBackendOr<Charge[]>(`/api/v1/patients/${encounter.patientId}/charges`, []),
  ]);
  // Neither /orders nor /charges support an encounterId filter — narrow to this visit here.
  const orders = patientOrders.filter((o) => o.encounterId === id);
  const charges = patientCharges.filter((c) => c.encounterId === id);

  return (
    <div className="space-y-5">
      <EncounterHeader encounter={encounter} patient={patient} />
      <div className="flex justify-end">
        <RecordResultDialog encounterId={id} patientId={patient.id} />
      </div>
      <OrdersPanel orders={orders} encounterId={id} />
      <ChargesPanel charges={charges} patientId={patient.id} encounterId={id} />
      <NotesPanel notes={notes} templates={templates} encounterId={id} />
    </div>
  );
}
