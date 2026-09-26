import type { LabOrderGateway, LabOrderStatus, LabOrderSubmission, LabOrderSubmissionResult } from './lab-order-gateway.js';

/**
 * No real lab vendor exists in this environment. The placer order number is simply our own
 * order id — real adapters would get one back from the vendor's transmission API, but our
 * synthetic HL7 ingestion (packages/hl7 + apps/interop-hl7) expects the same convention: OBR-2
 * on an incoming result message must equal the order id this gateway "submitted."
 */
export class NoopLabOrderGateway implements LabOrderGateway {
  async submitOrder(order: LabOrderSubmission): Promise<LabOrderSubmissionResult> {
    return { placerOrderNumber: order.orderId, transmittedAt: new Date() };
  }

  async checkStatus(_placerOrderNumber: string): Promise<LabOrderStatus> {
    return 'unknown';
  }
}
