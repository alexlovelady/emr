import { Boxes } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { NewResourceDialog } from '@/components/resources/new-resource-dialog';
import type { LocationRow, ResourceRow } from '@/lib/types';

export default async function ResourcesPage() {
  const [resources, locations] = await Promise.all([
    callBackend<ResourceRow[]>('/api/v1/resources'),
    callBackend<LocationRow[]>('/api/v1/locations'),
  ]);
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
          <p className="text-sm text-muted-foreground">{resources.length} rooms / equipment, for multi-resource scheduling</p>
        </div>
        <NewResourceDialog locations={locations} />
      </div>
      {locations.length === 0 && <p className="text-sm text-muted-foreground">Create a location first before adding a resource.</p>}
      <Card>
        <CardContent className="pt-6">
          {resources.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Boxes className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No resources yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.resourceType}</TableCell>
                    <TableCell>{locationName(r.locationId)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
