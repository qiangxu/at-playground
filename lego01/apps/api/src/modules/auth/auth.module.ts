import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import jwkToPem from 'jwk-to-pem';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ConfigModule, // 确保 ConfigModule 可用
    PassportModule, // <-- 注册 Passport
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const privyJwk = JSON.parse(configService.get<string>('PRIVY_JWK_JSON')!);
        const privyPem = jwkToPem(privyJwk);

        return {
          // secret 用于您自己签发 token (HS256)
          secret: configService.get<string>('JWT_SECRET'),
          // publicKey 用于验证来自 Privy 的 token (RS256)
          publicKey: privyPem,
          signOptions: { 
            expiresIn: configService.get<string>('JWT_EXPIRES') || '15m',
          },
          // 明确告知 service 我们会用到哪些算法
          verifyOptions: {
            algorithms: ['ES256'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [PrismaService, RedisService, JwtStrategy], // <-- 注册我们的新策略
})
export class AuthModule {}
