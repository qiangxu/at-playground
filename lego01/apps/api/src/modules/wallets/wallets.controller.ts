import { Body, Controller, Get, Post, Req, UseGuards, Request } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // <-- 导入守卫

@Controller('wallets')
export class WalletsController {
  constructor(private prisma: PrismaService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard) // <-- 应用守卫！此接口现在受到保护
  async register(
    @Body() dto: { address: string; provider: string; kind: string },
    @Request() req: any, // <-- 获取请求对象
  ) {
    // 从守卫附加的 user 对象中获取 accountId
    const accountId = req.user.accountId;

    const wallet = await this.prisma.wallet.upsert({
      where: { address: dto.address },
      create: {
        address: dto.address,
        provider: dto.provider as any, // Cast to WalletProvider if you trust the input, or use proper enum conversion
        kind: dto.kind as any,
        accountId: accountId, // <-- 关联到当前登录的用户
      },
      update: {
        accountId: accountId, // 如果钱包已存在，确保它关联到当前用户
      },
    });

    return wallet;
  }

  @Get()
  async list(@Req() req: any) {
    const accountId = req.user?.sub || (await this.prisma.account.findFirstOrThrow()).id;
    return this.prisma.wallet.findMany({ where: { accountId } });
  }
}
