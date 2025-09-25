import { Body, Controller, Post } from '@nestjs/common';
import jwkToPem from 'jwk-to-pem'; // 确保这个导入存在
import { PrismaService } from '../../infra/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Post('privy')
  async privy(@Body() dto: { idToken: string; email?: string }) { // <-- 1. 更新 DTO 类型
    console.log('[API] /auth/privy request received with DTO:', dto); // <-- 更新日志

    // 1. 手动从环境变量生成 PEM 公钥
    const jwk = JSON.parse(process.env.PRIVY_JWK_JSON!);
    const pem = jwkToPem(jwk);

    // 2. 在调用 verify 时，明确提供所有用于非对称加密验证的选项
    const payload: any = this.jwt.verify(dto.idToken, {
      secret: pem, // 对于 verify，公钥也通过 'secret' 选项传入
      algorithms: ['ES256'], // 明确指定您发现的正确算法
      audience: process.env.PRIVY_AUD,
    });

    console.log('[API] Decoded JWT Payload:', payload);
    
    // 3. 直接从请求体 DTO 中获取 email
    const email = dto.email; 
    console.log('[API] Extracted email from DTO:', email); // <-- 更新日志

    const privyUserId = payload.sub as string;

    const account = await this.prisma.account.upsert({
      where: { privyUserId },
      create: { privyUserId, email }, // <-- 使用从 DTO 获取的 email
      update: { email },             // <-- 使用从 DTO 获取的 email
    });

    // 新增：签发我们自己的会a话 Token
    const sessionPayload = { sub: account.id};
    const sessionToken = this.jwt.sign(sessionPayload);

    // 返回会话 Token 和用户信息
    return {
      token: sessionToken,
      user: { id: account.id, email: account.email, kycStatus: account.kycStatus },
    };
  }
}
