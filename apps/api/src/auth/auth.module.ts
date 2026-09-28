import { Module } from '@nestjs/common';
import { WorkforceModule } from '@ehr/workforce';
import { AuthController } from './auth.controller.js';
import { JwksController } from './jwks.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [WorkforceModule],
  controllers: [AuthController, JwksController],
  providers: [AuthService],
})
export class AuthModule {}
