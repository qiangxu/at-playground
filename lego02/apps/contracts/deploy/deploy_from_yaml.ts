import "dotenv/config";
import { ethers, upgrades, network } from "hardhat";
import { NonceManager } from "ethers";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { existsSync, readFileSync, writeFileSync } from "fs";

export interface TokenConfig {
  name: string;
  symbol: string;
  cap: number;
  tokenAddress?: string;
  transferRestrictors?: {
    name: string;
    address?: string;
  }[];
}

export function loadTokenConfig(filePath: string): TokenConfig {
  const fileContent = readFileSync(filePath, "utf8");
  return yaml.load(fileContent) as TokenConfig;
}

export function saveTokenConfig(config: TokenConfig) {
  const filePath = (network.config as any).tmpTokenConfigFile as string;
  const fileContent = yaml.dump(config);
  writeFileSync(filePath, fileContent, "utf8");
  console.log(`Token config saved to ${filePath}`);
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 2000, retryCount = 1): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (error.code === 'ECONNRESET' && retryCount <= retries) {
      console.log(`[Retry ${retryCount}/${retries}] Network error detected. Retrying in ${delayMs / 1000}s...`);
      await delay(delayMs);
      return withRetry(fn, retries, delayMs, retryCount + 1);
    }
    throw error;
  }
}

function addr(input: string): string {
  if (!input) throw new Error("empty address");
  if (input.startsWith("eoa:") || input.startsWith("safe:")) return input.split(":")[1];
  return input;
}

async function main() {
  await withRetry(async () => {
    const [deployer] = await ethers.getSigners();
    console.log("deployer:", deployer.address);

    const tmpTokenConfigFile = (network.config as any).tmpTokenConfigFile as string;
    if (!existsSync(tmpTokenConfigFile)) {
      throw new Error(`tmpTokenConfigFile not found: ${tmpTokenConfigFile}`);
    }
    const tokenConfig = loadTokenConfig(tmpTokenConfigFile);

    const SecurityToken = await ethers.getContractFactory("SecurityTokenV1Upgradeable");
    const securityToken = await upgrades.deployProxy(SecurityToken, [
      tokenConfig.name,
      tokenConfig.symbol,
      tokenConfig.cap,
      deployer.address,
    ], {
      initializer: "initialize",
      kind: "uups",
    });
    await securityToken.waitForDeployment();
    const securityTokenAddress = await securityToken.getAddress();
    console.log("SecurityToken deployed to:", securityTokenAddress);
    tokenConfig.tokenAddress = securityTokenAddress;

    if (tokenConfig.transferRestrictors && tokenConfig.transferRestrictors.length > 0) {
      for (const restrictor of tokenConfig.transferRestrictors) {
        const Restrictor = await ethers.getContractFactory(restrictor.name);
        const restrictorInstance = await Restrictor.deploy();
        await restrictorInstance.waitForDeployment();
        const restrictorAddress = await restrictorInstance.getAddress();
        console.log(`${restrictor.name} deployed to:`, restrictorAddress);
        restrictor.address = restrictorAddress;

        const tx = await securityToken.addRestrictor(restrictorAddress);
        await tx.wait();
        console.log(`add restrictor ${restrictor.name} to token`);
      }
    }

    saveTokenConfig(tokenConfig);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

