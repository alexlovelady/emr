import { callBackendOr } from '@/lib/api-proxy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { NewThreadForm } from '@/components/messages/new-thread-form';
import { ThreadList } from '@/components/messages/thread-list';
import type { MessageThread } from '@/lib/types';

export default async function MessagesPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const threads = await callBackendOr<MessageThread[]>(`/api/v1/portal/patients/${patientId}/message-threads`, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Messages</CardTitle>
        <NewThreadForm patientId={patientId} />
      </CardHeader>
      <CardContent>
        <ThreadList patientId={patientId} threads={threads} />
      </CardContent>
    </Card>
  );
}
