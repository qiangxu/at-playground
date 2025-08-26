import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';

import { AuthModule } from './modules/auth/auth.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { KycController } from './modules/kyc/kyc.controller';
import { GateController } from './modules/gate/gate.controller';

// 基础设施（作为 provider 注入，供各模块使用）
import { PrismaService } from './infra/prisma.service';
import { RedisService } from './infra/redis.service';


@Module({
  imports: [
    AppConfigModule,  // 全局 env 配置
    AuthModule,       // /auth/*
    WalletsModule,    // /wallets/*
    // 如果你把 KYC/Gate 做成独立模块，这里改为 KycModule / GateModule
  ],
  controllers: [
    AppController,    // 可当健康检查
    KycController,    // /kyc/session, /kyc/webhook
    GateController,   // /gate/permissions
  ],
  providers: [
    AppService,
    PrismaService,
    RedisService,
  ],
})
export class AppModule {}

