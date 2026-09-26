import { Module } from '@nestjs/common';
import { IntakeFormTemplateController } from './template/template.controller.js';
import { IntakeFormTemplateService } from './template/template.service.js';
import { IntakeFormResponseController } from './response/response.controller.js';
import { IntakeFormResponseService } from './response/response.service.js';

@Module({
  controllers: [IntakeFormTemplateController, IntakeFormResponseController],
  providers: [IntakeFormTemplateService, IntakeFormResponseService],
})
export class IntakeModule {}
