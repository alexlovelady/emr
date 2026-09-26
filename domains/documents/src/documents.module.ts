import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller.js';

@Module({
  controllers: [DocumentController],
})
export class DocumentsModule {}
