import { ethers } from 'ethers';
import { provider } from '@at/chain';
import { PrismaClient } from '@at/db';

// MockUSDC 合约的 ABI，我们只需要 Transfer 事件的部分
const usdcAbi = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// MockUSDC 合约地址，从环境变量读取
const usdcContractAddress = process.env.USDC_ADDRESS;
if (!usdcContractAddress) {
  throw new Error('USDC_ADDRESS is not set in .env file');
}

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Watcher starting...');
  console.log(`👂 Listening for Transfer events on MockUSDC at ${usdcContractAddress}`);

  const usdcContract = new ethers.Contract(usdcContractAddress, usdcAbi, provider);

  // 监听 Transfer 事件
  usdcContract.on('Transfer', async (from, to, value, event) => {
    console.log('--- New Transfer Detected! ---');
    console.log(`From: ${from}`);
    console.log(`To:   ${to}`);
    console.log(`Value: ${ethers.formatUnits(value, 6)} USDC`); // 假设 USDC 是 6 位小数
    console.log(`Block: ${event.blockNumber}`);
    console.log('----------------------------');

    // TODO: 下一步我们将在这里实现核心入账逻辑
    // 1. 检查 'to' 地址是否是我们的一个用户钱包
    // 2. 如果是，就更新该用户钱包的余额
  });

  console.log('✅ Watcher is running and listening for events.');
}

main().catch((error) => {
  console.error('❌ Watcher encountered a fatal error:', error);
  process.exit(1);
});