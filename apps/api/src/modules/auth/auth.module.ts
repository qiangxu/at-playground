import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [PrismaService, RedisService],
})
export class AuthModule {}
