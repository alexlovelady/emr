import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  ImportBankStatementSchema,
  MatchDepositSchema,
  IgnoreDepositSchema,
  type ImportBankStatementInput,
  type MatchDepositInput,
  type IgnoreDepositInput,
} from './bank-reconciliation.dto.js';
import { BankReconciliationService } from './bank-reconciliation.service.js';

@Controller('api/v1/bank-deposits')
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Post('import')
  @RequirePermission(PERMISSION_KEYS.BANK_RECONCILIATION_MANAGE)
  @Audited('bank_deposit.import', 'BankDeposit')
  async import(@Body(new ZodValidationPipe(ImportBankStatementSchema)) body: ImportBankStatementInput, @Req() req: FastifyRequest) {
    return this.service.importStatement(getCurrentTransaction(), requireCtx(req), body.rawText);
  }

  @Post('auto-match')
  @RequirePermission(PERMISSION_KEYS.BANK_RECONCILIATION_MANAGE)
  @Audited('bank_deposit.auto_match', 'BankDeposit')
  async autoMatch(@Req() req: FastifyRequest) {
    return this.service.autoMatch(getCurrentTransaction(), requireCtx(req));
  }

  @Get('unmatched')
  @RequirePermission(PERMISSION_KEYS.BANK_RECONCILIATION_MANAGE)
  @Audited('bank_deposit.list_unmatched', 'BankDeposit')
  async listUnmatched(@Req() req: FastifyRequest) {
    return this.service.listUnmatched(getCurrentTransaction(), requireCtx(req));
  }

  @Post(':id/match')
  @RequirePermission(PERMISSION_KEYS.BANK_RECONCILIATION_MANAGE)
  @Audited('bank_deposit.match', 'BankDeposit')
  async match(@Param('id') id: string, @Body(new ZodValidationPipe(MatchDepositSchema)) body: MatchDepositInput, @Req() req: FastifyRequest) {
    return this.service.matchManually(getCurrentTransaction(), requireCtx(req), id, body.remittanceId);
  }

  @Post(':id/ignore')
  @RequirePermission(PERMISSION_KEYS.BANK_RECONCILIATION_MANAGE)
  @Audited('bank_deposit.ignore', 'BankDeposit')
  async ignore(@Param('id') id: string, @Body(new ZodValidationPipe(IgnoreDepositSchema)) body: IgnoreDepositInput, @Req() req: FastifyRequest) {
    return this.service.ignore(getCurrentTransaction(), requireCtx(req), id, body.reason);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
