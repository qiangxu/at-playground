import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { PrismaService } from '../../infra/prisma.service';

@Module({ controllers: [WalletsController], providers: [PrismaService] })
export class WalletsModule {}
