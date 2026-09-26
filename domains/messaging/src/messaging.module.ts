import { Module } from '@nestjs/common';
import { StaffMessageThreadController } from './thread/staff-message-thread.controller.js';
import { PortalMessageThreadController } from './thread/portal-message-thread.controller.js';

@Module({
  controllers: [StaffMessageThreadController, PortalMessageThreadController],
})
export class MessagingModule {}
