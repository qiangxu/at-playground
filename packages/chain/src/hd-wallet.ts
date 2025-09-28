import { createHash } from 'crypto';
import { ethers } from 'ethers';

const mnemonic = process.env.HD_WALLET_MNEMONIC;

if (!mnemonic) {
  throw new Error('HD_WALLET_MNEMONIC environment variable is not set');
}

const mNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m");
console.log('Master Node Depth:', mNode.depth); 


console.log('0th HD addr:', mNode.derivePath(`m/44'/60'/0'/0/0`).address);
console.log('1st HD addr:', mNode.derivePath(`m/44'/60'/0'/0/1`).address);

export function deriveUserDepositWallet(userId: string): string {
  // 1. 使用 SHA-256 对 userId 进行哈希
  const userIndexHex = createHash('sha256').update(userId).digest('hex').substring(0, 8); // 取前 8 个十六进制字符 (32位)
  // 2. 从哈希结果中取出一部分，转换为一个安全的整数
  // BIP-44 的地址索引是一个 31 位的非负整数 (0 to 2^31 - 1)
  const userIndex = parseInt(userIndexHex, 16) & 0x7FFFFFFF; // 使用位掩码确保它是一个 31 位的正整数
  const derivationPath = `m/44'/60'/0'/0/${userIndex}`;
  const userNode = mNode.derivePath(derivationPath);
  return userNode.address;
}