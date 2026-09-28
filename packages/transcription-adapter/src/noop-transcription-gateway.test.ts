import { describe, expect, it } from 'vitest';
import { NoopTranscriptionGateway } from './noop-transcription-gateway.js';

describe('NoopTranscriptionGateway', () => {
  it('never fabricates a transcript — always reports unavailable', async () => {
    const gateway = new NoopTranscriptionGateway();
    const result = await gateway.transcribeAudio({ storageKey: 'audio/some-key.webm', contentType: 'audio/webm' });
    expect(result.available).toBe(false);
    expect(result.transcript).toBe('');
    expect(result.confidence).toBeNull();
  });
});
