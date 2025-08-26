import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';

@Controller('wallets')
export class WalletsController {
  constructor(private prisma: PrismaService) {}

  @Post('register')
  async register(@Req() req: any, @Body() dto: { address: string; provider: 'PRIVY'|'SIWE'|'SAFE'|'OTHER'; kind: 'EMBEDDED'|'EXTERN'|'SAFE'|'AA'; }) {
    const accountId = req.user?.sub || req.accountId || (await this.prisma.account.findFirstOrThrow()).id; // Demo: 替换为 JWT Guard
    await this.prisma.wallet.upsert({
      where: { address: dto.address },
      update: { provider: dto.provider as any, kind: dto.kind as any, accountId },
      create: { accountId, address: dto.address, provider: dto.provider as any, kind: dto.kind as any },
    });
    return { ok: true };
  }

  @Get()
  async list(@Req() req: any) {
    const accountId = req.user?.sub || (await this.prisma.account.findFirstOrThrow()).id;
    return this.prisma.wallet.findMany({ where: { accountId } });
  }
}
