export { ConsentModule } from './consent.module.js';
export { ConsentService } from './proxy-grant/proxy-grant.service.js';

export { ProxyGrantRepository, portalAccountExists, type PatientProxyGrantRow } from './proxy-grant/proxy-grant.repository.js';
export {
  CreateProxyGrantSchema,
  type CreateProxyGrantInput,
  RevokeProxyGrantSchema,
  type RevokeProxyGrantInput,
} from './proxy-grant/proxy-grant.dto.js';
