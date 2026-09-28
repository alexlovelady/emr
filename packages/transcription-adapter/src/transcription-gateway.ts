export interface TranscribeAudioRequest {
  /** Object-storage key of the already-uploaded audio recording — a real implementation fetches
   * the bytes itself rather than have every caller pass them through. */
  storageKey: string;
  contentType: string;
}

export interface TranscribeAudioResult {
  transcript: string;
  /** Vendor-reported confidence, when the vendor provides one. */
  confidence: number | null;
  /** `false` means "no real speech-to-text vendor is connected" — never treat a `false` result's
   * `transcript` (always empty) as a real, if quiet, recording. Distinguishes "couldn't transcribe"
   * from "transcribed to nothing," the same `checked`-vs-`valid` split `TerminologyService` uses. */
  available: boolean;
}

/**
 * Same "buy, not built" vendor boundary as every other adapter package in this repo (lab, eRx,
 * clearinghouse, video visits, interaction checking): no real speech-to-text vendor (e.g. an OpenAI
 * Whisper API, AWS Transcribe Medical, ...) is connected. `NoopTranscriptionGateway` is the only
 * implementation and never fabricates a transcript.
 */
export interface TranscriptionGateway {
  transcribeAudio(request: TranscribeAudioRequest): Promise<TranscribeAudioResult>;
}
