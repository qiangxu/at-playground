import { ethers } from 'ethers';

const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  throw new Error('RPC_URL is not set in environment variables');
}
export const provider = new ethers.JsonRpcProvider(rpcUrl);

const omnibusKey = process.env.OMNIBUS_PRIVATE_KEY;
if (!omnibusKey) {
  throw new Error('OMNIBUS_PRIVATE_KEY is not set in environment variables');
}
export const omnibusWallet = new ethers.Wallet(omnibusKey, provider);