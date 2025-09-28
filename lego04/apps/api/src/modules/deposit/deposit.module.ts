import { Module } from '@nestjs/common';
import { DepositController } from './deposit.controller';

@Module({
  controllers: [DepositController],
})
export class DepositModule {}