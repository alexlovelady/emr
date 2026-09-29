import { callBackend } from '@/lib/api-proxy';
import { PatientSearch } from '@/components/patients/patient-search';
import { NewPatientDialog } from '@/components/patients/new-patient-dialog';
import type { Patient } from '@/lib/types';

const PAGE_SIZE = 25;

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const { search, page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam ?? '0') || 0);
  const fetched = await callBackend<Patient[]>('/api/v1/patients', {
    query: { limit: String(PAGE_SIZE + 1), offset: String(page * PAGE_SIZE), search: search || undefined },
  });
  const hasMore = fetched.length > PAGE_SIZE;
  const patients = hasMore ? fetched.slice(0, PAGE_SIZE) : fetched;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        </div>
        <NewPatientDialog />
      </div>
      <PatientSearch patients={patients} page={page} hasMore={hasMore} initialSearch={search ?? ''} />
    </div>
  );
}
