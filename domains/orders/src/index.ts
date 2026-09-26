export { OrdersModule } from './orders.module.js';
export { OrderService } from './order/order.service.js';
export { OrderRepository, type OrderRow } from './order/order.repository.js';
export { CreateOrderSchema, type CreateOrderInput } from './order/order.dto.js';
export { LAB_ORDER_GATEWAY } from './lab-order-gateway.token.js';
export { SpecimenService } from './specimen/specimen.service.js';
export { SpecimenRepository, type SpecimenRow } from './specimen/specimen.repository.js';
export { CreateSpecimenSchema, type CreateSpecimenInput } from './specimen/specimen.dto.js';
