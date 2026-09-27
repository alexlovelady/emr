import { callBackend } from '@/lib/api-proxy';
import { EncounterHeader } from '@/components/encounters/encounter-header';
import { NotesPanel } from '@/components/encounters/notes-panel';
import { OrdersPanel } from '@/components/encounters/orders-panel';
import { RecordResultDialog } from '@/components/encounters/record-result-dialog';
import type { Encounter, Note, NoteTemplate, Order, Patient } from '@/lib/types';

export default async function EncounterWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const encounter = await callBackend<Encounter>(`/api/v1/encounters/${id}`);
  const [patient, notes, templates, patientOrders] = await Promise.all([
    callBackend<Patient>(`/api/v1/patients/${encounter.patientId}`),
    callBackend<Note[]>('/api/v1/notes', { query: { encounterId: id } }),
    callBackend<NoteTemplate[]>('/api/v1/note-templates'),
    callBackend<Order[]>('/api/v1/orders', { query: { patientId: encounter.patientId } }),
  ]);
  // GET /orders only supports a patientId filter, not encounterId — narrow to this visit here.
  const orders = patientOrders.filter((o) => o.encounterId === id);

  return (
    <div className="space-y-5">
      <EncounterHeader encounter={encounter} patient={patient} />
      <div className="flex justify-end">
        <RecordResultDialog encounterId={id} patientId={patient.id} />
      </div>
      <OrdersPanel orders={orders} encounterId={id} />
      <NotesPanel notes={notes} templates={templates} encounterId={id} />
    </div>
  );
}
