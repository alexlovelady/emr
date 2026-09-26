import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { JwksController } from './jwks.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController, JwksController],
  providers: [AuthService],
})
export class AuthModule {}
