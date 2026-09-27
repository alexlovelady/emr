import {
  AlertTriangle,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  FlaskConical,
  MessageSquare,
  Pill,
  Stethoscope,
  Upload,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ProblemsPanel } from '@/components/chart/problems-panel';
import { AllergiesPanel } from '@/components/chart/allergies-panel';
import { MedicationsPanel } from '@/components/chart/medications-panel';
import { ResultsList } from '@/components/chart/results-list';
import { NotesList } from '@/components/chart/notes-list';
import { CoveragePanel } from '@/components/chart/coverage-panel';
import { IntakePanel } from '@/components/chart/intake-panel';
import { MessagesPanel } from '@/components/chart/messages-panel';
import { DocumentsPanel } from '@/components/chart/documents-panel';
import { BillingPanel } from '@/components/chart/billing-panel';
import type {
  Allergy,
  Charge,
  Claim,
  Coverage,
  Denial,
  DiagnosticReport,
  DocumentItem,
  EligibilityCheck,
  IntakeFormResponse,
  IntakeFormTemplate,
  MedicationItem,
  MessageThread,
  PatientIdentifier,
  PatientLedger,
  Prescription,
  Problem,
  SignedNote,
} from '@/lib/types';

function StatChip({ icon: Icon, label, count, tone }: { icon: typeof Stethoscope; label: string; count: number; tone: 'default' | 'warn' }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <Icon className={`h-4 w-4 ${tone === 'warn' && count > 0 ? 'text-destructive' : 'text-muted-foreground'}`} strokeWidth={2} />
      <div>
        <div className="text-lg font-semibold leading-none">{count}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

interface ChartTabsProps {
  patientId: string;
  problems: Problem[];
  allergies: Allergy[];
  medications: MedicationItem[];
  prescriptions: Prescription[];
  results: DiagnosticReport[];
  notes: SignedNote[];
  coverages: Coverage[];
  identifiers: PatientIdentifier[];
  intakeResponses: IntakeFormResponse[];
  intakeTemplates: IntakeFormTemplate[];
  messageThreads: MessageThread[];
  documents: DocumentItem[];
  charges: Charge[];
  claims: Claim[];
  denials: Denial[];
  eligibilityChecks: EligibilityCheck[];
  ledger: PatientLedger | null;
}

export function ChartTabs({
  patientId,
  problems,
  allergies,
  medications,
  prescriptions,
  results,
  notes,
  coverages,
  identifiers,
  intakeResponses,
  intakeTemplates,
  messageThreads,
  documents,
  charges,
  claims,
  denials,
  eligibilityChecks,
  ledger,
}: ChartTabsProps) {
  const activeProblems = problems.filter((p) => p.status !== 'deleted' && p.clinicalStatus === 'active').length;
  const activeAllergies = allergies.filter((a) => a.status !== 'deleted').length;
  const activeMeds = medications.filter((m) => m.status !== 'deleted' && m.status === 'active').length;
  const pendingResults = results.filter((r) => r.reviewStatus !== 'reviewed').length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip icon={Stethoscope} label="Active problems" count={activeProblems} tone="default" />
        <StatChip icon={AlertTriangle} label="Allergies" count={activeAllergies} tone="warn" />
        <StatChip icon={Pill} label="Active medications" count={activeMeds} tone="default" />
        <StatChip icon={FlaskConical} label="Pending results" count={pendingResults} tone="warn" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="problems">
            <TabsList className="flex-wrap">
              <TabsTrigger value="problems">
                <Stethoscope className="mr-1.5 h-3.5 w-3.5" /> Problems
              </TabsTrigger>
              <TabsTrigger value="medications">
                <Pill className="mr-1.5 h-3.5 w-3.5" /> Medications
              </TabsTrigger>
              <TabsTrigger value="allergies">
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Allergies
              </TabsTrigger>
              <TabsTrigger value="results">
                <FlaskConical className="mr-1.5 h-3.5 w-3.5" /> Results
              </TabsTrigger>
              <TabsTrigger value="notes">
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Notes
              </TabsTrigger>
              <TabsTrigger value="coverage">
                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Coverage
              </TabsTrigger>
              <TabsTrigger value="intake">
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Intake
              </TabsTrigger>
              <TabsTrigger value="messages">
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Messages
              </TabsTrigger>
              <TabsTrigger value="documents">
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Documents
              </TabsTrigger>
              <TabsTrigger value="billing">
                <DollarSign className="mr-1.5 h-3.5 w-3.5" /> Billing
              </TabsTrigger>
            </TabsList>
            <TabsContent value="problems">
              <ProblemsPanel problems={problems} patientId={patientId} />
            </TabsContent>
            <TabsContent value="medications">
              <MedicationsPanel medications={medications} prescriptions={prescriptions} patientId={patientId} />
            </TabsContent>
            <TabsContent value="allergies">
              <AllergiesPanel allergies={allergies} patientId={patientId} />
            </TabsContent>
            <TabsContent value="results">
              <ResultsList reports={results} patientId={patientId} />
            </TabsContent>
            <TabsContent value="notes">
              <NotesList notes={notes} />
            </TabsContent>
            <TabsContent value="coverage">
              <CoveragePanel coverages={coverages} identifiers={identifiers} patientId={patientId} />
            </TabsContent>
            <TabsContent value="intake">
              <IntakePanel responses={intakeResponses} templates={intakeTemplates} patientId={patientId} />
            </TabsContent>
            <TabsContent value="messages">
              <MessagesPanel threads={messageThreads} patientId={patientId} />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsPanel documents={documents} patientId={patientId} />
            </TabsContent>
            <TabsContent value="billing">
              <BillingPanel
                patientId={patientId}
                coverages={coverages}
                charges={charges}
                claims={claims}
                denials={denials}
                eligibilityChecks={eligibilityChecks}
                ledger={ledger}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
