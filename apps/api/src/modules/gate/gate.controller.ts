import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';

@Controller('gate')
export class GateController {
  constructor(private prisma: PrismaService) {}

  @Get('permissions')
  async permissions(@Req() req: any) {
    const account = await this.prisma.account.findFirstOrThrow(); // Demo：替换为 JWT 提取
    const can = account.kycStatus === 'APPROVED' && !(account.flags as any)?.frozen;
    return {
      canTrade: can,
      canDeposit: can,
      canWithdraw: can,
      reasons: can ? [] : ['KYC not approved or account frozen'],
    };
  }
}
