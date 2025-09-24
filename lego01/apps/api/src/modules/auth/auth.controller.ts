import { Body, Controller, Post } from '@nestjs/common';
import jwkToPem from 'jwk-to-pem'; // 确保这个导入存在
import { PrismaService } from '../../infra/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Post('privy')
  async privy(@Body() dto: { idToken: string }) {
    console.log('[API] /auth/privy request received. Token length:', dto.idToken?.length);

    // 1. 手动从环境变量生成 PEM 公钥
    const jwk = JSON.parse(process.env.PRIVY_JWK_JSON!);
    const pem = jwkToPem(jwk);

    // 2. 在调用 verify 时，明确提供所有用于非对称加密验证的选项
    const payload: any = this.jwt.verify(dto.idToken, {
      secret: pem, // 对于 verify，公钥也通过 'secret' 选项传入
      algorithms: ['ES256'], // 明确指定您发现的正确算法
      audience: process.env.PRIVY_AUD,
    });

    const email = payload.email as string | undefined;
    const privyUserId = payload.sub as string;

    const account = await this.prisma.account.upsert({
      where: { privyUserId },
      create: { privyUserId, email },
      update: { email },
    });

    const access_token = this.jwt.sign({ sub: account.id }, { secret: process.env.JWT_SECRET!, expiresIn: process.env.JWT_EXPIRES || '15m' });
    const refresh_token = this.jwt.sign({ sub: account.id, t: 'refresh' }, { secret: process.env.JWT_SECRET!, expiresIn: process.env.REFRESH_EXPIRES || '30d' });

    await this.prisma.session.create({ data: { accountId: account.id, refreshToken: refresh_token, expiresAt: new Date(Date.now() + 30*24*3600*1000) } });

    return { user: { id: account.id, email: account.email, kycStatus: account.kycStatus }, access_token, refresh_token };
  }
}
