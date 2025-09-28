import { ethers } from 'ethers';

// 从环境变量中读取 RPC URL，如果未设置则抛出错误
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  throw new Error('RPC_URL is not set in environment variables');
}

// 创建并导出一个全局的 JSON-RPC Provider 实例
export const provider = new ethers.JsonRpcProvider(rpcUrl);