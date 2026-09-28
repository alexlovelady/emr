import type { TranscribeAudioRequest, TranscribeAudioResult, TranscriptionGateway } from './transcription-gateway.js';

/**
 * No real speech-to-text vendor is connected in this environment. This never fabricates a
 * transcript — `available: false` with an empty `transcript` is the only possible result, so a
 * caller can never mistake "we didn't transcribe this" for "the recording was silent."
 */
export class NoopTranscriptionGateway implements TranscriptionGateway {
  async transcribeAudio(_request: TranscribeAudioRequest): Promise<TranscribeAudioResult> {
    return { transcript: '', confidence: null, available: false };
  }
}
