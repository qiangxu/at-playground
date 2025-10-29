import "dotenv/config";
import { ethers, upgrades } from "hardhat";
import { NonceManager } from "ethers";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

function addr(input: string): string {
  if (!input) throw new Error("empty address");
  if (input.startsWith("eoa:") || input.startsWith("safe:")) return input.split(":")[1];
  return input;
}

async function main() {
  const configPath =
    process.env.TOKEN_CONFIG ||
    path.resolve(__dirname, "../../configs/examples/token.config.yaml");

  const raw = fs.readFileSync(configPath, "utf8");
  const cfg: any = yaml.load(raw);

  if (cfg.type !== "erc20_restricted") {
    throw new Error("M0 仅支持 erc20_restricted");
  }

  // signer + NonceManager
  const [deployer0] = await ethers.getSigners();
  console.log("deployer:", deployer0.address);
  const nm = new NonceManager(deployer0);
  //const pending = await ethers.provider.getTransactionCount(deployer0.address, "pending");
  //await nm.setTransactionCount(pending);

  // deploy SimpleRestrictor(admin = deployer0)
  const RestrictorFactory = await ethers.getContractFactory("SimpleRestrictor", nm);
  const restrictor = await RestrictorFactory.deploy(deployer0.address);
  await restrictor.waitForDeployment();
  const restrictorAddr = await restrictor.getAddress();
  console.log("restrictor:", restrictorAddr);

  // deploy token proxy (UUPS)
  const TokenFactory = await ethers.getContractFactory("SecurityTokenV1Upgradeable", nm);
  const owner = addr(cfg.roles.owner);
  const token = await upgrades.deployProxy(
    TokenFactory,
    [
      cfg.name,
      cfg.symbol,
      Number(cfg.decimals || 18),
      BigInt(cfg.cap),
      owner,
      restrictorAddr
    ],
    { kind: "uups" }
  );
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("token:", tokenAddr);

  // grant roles on token
  //const minterRole = await token.MINTER_ROLE();
  //const complianceRole = await token.COMPLIANCE_ROLE();

  const ROLE_MINTER = ethers.id("MINTER_ROLE");
  const ROLE_COMPLIANCE = ethers.id("COMPLIANCE_ROLE");

  for (const m of cfg.roles.minters || []) {
    const a = addr(m);
    const tx = await token.connect(nm).grantRole(ROLE_MINTER, a);
    await tx.wait();
  }
  for (const c of cfg.roles.complianceAdmins || []) {
    const a = addr(c);
    const tx = await token.connect(nm).grantRole(ROLE_COMPLIANCE, a);
    await tx.wait();
  }

  // setup compliance whitelist on restrictor
  const defaultAdmin = await restrictor.DEFAULT_ADMIN_ROLE();
  const restrictorCompliance = await restrictor.COMPLIANCE_ROLE();

  const complianceAdmins: string[] = (cfg.roles.complianceAdmins || []).map(addr);
  for (const admin of complianceAdmins) {
    let tx = await restrictor.connect(nm).grantRole(defaultAdmin, admin);
    await tx.wait();
    tx = await restrictor.connect(nm).grantRole(restrictorCompliance, admin);
    await tx.wait();
  }
  for (const u of (cfg.whitelist && cfg.whitelist.allow) || []) {
    const tx = await restrictor.connect(nm).setWhitelist(u, true);
    await tx.wait();
  }

  // issuance: immediate mint
  const steps: any[] = (cfg.issuance && cfg.issuance.schedule) || [];
  for (const s of steps) {
    if (String(s.t || "").toLowerCase() === "immediate") {
      console.log("minting immediate:", s.mint, "to", s.to);
      const tx = await token.connect(nm).mint(s.to, BigInt(s.mint));
      await tx.wait();
    }
  }

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

