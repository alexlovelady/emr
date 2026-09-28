import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import type { AiContextItem } from '@ehr/ai-adapter';
import type { TranscriptionGateway } from '@ehr/transcription-adapter';
import { DocumentRepository } from '@ehr/documents';

type Executor = Kysely<DB> | Transaction<DB>;

export interface AmbientAudioResolution {
  inputText: string;
  contextItems: AiContextItem[];
}

/**
 * Resolves the real ambient-scribe path: looks up the stored audio `Document`, transcribes it via
 * the configured `TranscriptionGateway`, and returns text ready to hand to the AI gateway. Throws
 * rather than ever silently drafting a note from an empty/fake transcript (see
 * `TranscriptionGateway`'s `available` field doc comment).
 */
export async function resolveAmbientAudioInput(
  trx: Executor,
  tenantId: string,
  encounterId: string,
  audioDocumentId: string,
  transcriptionGateway: TranscriptionGateway,
  documentRepo: DocumentRepository = new DocumentRepository(),
): Promise<AmbientAudioResolution> {
  const document = await documentRepo.findById(trx, tenantId, audioDocumentId);
  if (!document || document.encounterId !== encounterId) {
    throw new NotFoundError('Audio recording not found for this encounter', { audioDocumentId });
  }
  if (document.status !== 'stored') {
    throw new ConflictError('Audio recording has not finished uploading', { audioDocumentId, status: document.status });
  }

  const transcription = await transcriptionGateway.transcribeAudio({
    storageKey: document.storageKey,
    contentType: document.contentType,
  });
  if (!transcription.available) {
    throw new ConflictError(
      'Audio transcription is not available — no speech-to-text vendor is connected. Provide typed instructions instead.',
      { audioDocumentId },
    );
  }

  return {
    inputText: transcription.transcript,
    contextItems: [{ ref: `Document/${document.id}`, data: { transcriptConfidence: transcription.confidence } }],
  };
}
