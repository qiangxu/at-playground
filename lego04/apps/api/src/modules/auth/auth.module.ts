// filepath: /home/qiangxu/at-playground/lego04/apps/api/src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [ConfigModule, PassportModule],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}