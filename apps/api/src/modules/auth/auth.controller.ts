import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import { PrismaService } from '../../infra/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Post('privy')
  async privy(@Body() dto: { idToken: string }) {
    const jwk = JSON.parse(process.env.PRIVY_JWK_JSON!);
    const pem = jwkToPem(jwk);
    const payload: any = jwt.verify(dto.idToken, pem, { algorithms: ['RS256'], audience: process.env.PRIVY_AUD });
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
