import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';

import { WalletsModule } from './modules/wallets/wallets.module';
import { DepositModule } from './modules/deposit/deposit.module';
import { AuthModule } from './modules/auth/auth.module'; // <-- 新增导入

// 基础设施（作为 provider 注入，供各模块使用）
import { PrismaService } from './infra/prisma.service';
import { RedisService } from './infra/redis.service';


@Module({
  imports: [
    AppConfigModule,  // 全局 env 配置
    AuthModule, // <-- 在这里注册
    WalletsModule,    // /wallets/* (保留用于注册外部钱包)
    DepositModule, // <-- 在这里注册新模块
    // 未来这里会添加 WithdrawalModule 等
  ],
  controllers: [
    AppController,    // 可当健康检查
  ],
  providers: [
    AppService,
    PrismaService,
    RedisService,
  ],
})
export class AppModule {}

