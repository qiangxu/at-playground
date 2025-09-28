import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // 复用 lego01 的守卫逻辑
import { deriveUserDepositWallet } from '@at/chain'; // 导入我们的 SDK 函数

@Controller('deposit')
export class DepositController {
  @Get('address')
  @UseGuards(JwtAuthGuard) // 使用守卫保护此接口
  async getDepositAddress(@Request() req: any) {
    // 从守卫注入的 req.user 对象中获取 accountId
    const accountId = req.user.accountId;

    // 调用 SDK 函数为当前用户派生地址
    const depositAddress = deriveUserDepositWallet(accountId);

    return {
      address: depositAddress,
    };
  }
}