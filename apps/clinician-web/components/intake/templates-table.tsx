import { ClipboardList } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import type { IntakeFormTemplate } from '@/lib/types';

export function TemplatesTable({ templates }: { templates: IntakeFormTemplate[] }) {
  if (templates.length === 0) {
    return <EmptyState icon={ClipboardList} message="No intake form templates yet." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Fields</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-medium">{t.name}</TableCell>
            <TableCell className="text-muted-foreground">{t.schema.map((f) => f.label).join(', ')}</TableCell>
            <TableCell className="text-muted-foreground">v{t.schemaVersion}</TableCell>
            <TableCell>
              <Badge variant={t.status === 'active' ? 'success' : 'outline'}>{t.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
