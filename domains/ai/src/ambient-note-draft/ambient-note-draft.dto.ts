import { z } from 'zod';

export const AmbientNoteDraftSchema = z.object({
  instructions: z.string().max(2000).nullish(),
  /** A stored `Document` (see `POST /api/v1/documents`, `documentCategory: 'ambient_audio'`) holding
   * an audio recording of the visit — the real ambient-scribe path, transcribed via the configured
   * `TranscriptionGateway` before being handed to the AI gateway as `inputText`. */
  audioDocumentId: z.string().uuid().nullish(),
});
export type AmbientNoteDraftInput = z.infer<typeof AmbientNoteDraftSchema>;
