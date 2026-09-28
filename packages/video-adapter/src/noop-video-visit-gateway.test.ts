import { describe, expect, it } from 'vitest';
import { NoopVideoVisitGateway } from './noop-video-visit-gateway.js';

describe('NoopVideoVisitGateway', () => {
  it('mints distinct host and participant links for the same appointment', async () => {
    const gateway = new NoopVideoVisitGateway();
    const result = await gateway.createVisit({ appointmentId: 'appt-1' });
    expect(result.providerVisitId).toBe('appt-1');
    expect(result.practitionerJoinUrl).not.toBe(result.patientJoinUrl);
    expect(result.practitionerJoinUrl).toContain('appt-1');
    expect(result.patientJoinUrl).toContain('appt-1');
  });
});
