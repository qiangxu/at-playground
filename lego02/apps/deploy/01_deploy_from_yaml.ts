import "dotenv/config";
import { ethers, upgrades } from "hardhat";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function addr(input: string): string {
  if (!input) throw new Error("empty address");
  if (input.startsWith("eoa:") || input.startsWith("safe:")) return input.split(":")[1];
  return input;
}

async function main() {
  const configPath = process.env.TOKEN_CONFIG || path.resolve(__dirname, "../../configs/examples/token.config.yaml");

  const raw = fs.readFileSync(configPath, "utf8");
  const cfg: any = yaml.load(raw);

  if (cfg.type !== "erc20_restricted") throw new Error("M0 仅支持 erc20_restricted");

  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  // 1) deploy SimpleRestrictor(admin = deployer)
  const Restrictor = await ethers.getContractFactory("SimpleRestrictor");
  const restrictor = await Restrictor.deploy(deployer.address);
  await restrictor.waitForDeployment();
  console.log("restrictor:", await restrictor.getAddress());

  // 2) deploy token proxy
  const Token = await ethers.getContractFactory("SecurityTokenV1Upgradeable");
  const owner = addr(cfg.roles.owner);
  const token = await upgrades.deployProxy(Token, [
    cfg.name,
    cfg.symbol,
    Number(cfg.decimals || 18),
    BigInt(cfg.cap),
    owner,
    await restrictor.getAddress()
  ], { kind: "uups" });
  await token.waitForDeployment();
  console.log("token:", await token.getAddress());

  // 3) grant roles on token
  for (const m of cfg.roles.minters || []) {
    const a = addr(m);
    const tx = await token.grantRole(await token.MINTER_ROLE(), a);
    await tx.wait();
  }
  for (const c of cfg.roles.complianceAdmins || []) {
    const a = addr(c);
    const tx = await token.grantRole(await token.COMPLIANCE_ROLE(), a);
    await tx.wait();
  }

  // 4) setup compliance whitelist on restrictor
  const complianceAdmins: string[] = (cfg.roles.complianceAdmins || []).map(addr);
  for (const admin of complianceAdmins) {
    const tx = await restrictor.grantRole(await restrictor.DEFAULT_ADMIN_ROLE(), admin);
    await tx.wait();
    const tx2 = await restrictor.grantRole(await restrictor.COMPLIANCE_ROLE(), admin);
    await tx2.wait();
  }
  for (const u of cfg.whitelist?.allow || []) {
    const tx = await restrictor.connect(deployer).setWhitelist(u, true);
    await tx.wait();
  }

  // 5) immediate mint
  const steps: any[] = cfg.issuance?.schedule || [];
  for (const s of steps) {
    if (String(s.t).toLowerCase() === "immediate") {
      console.log("minting immediate:", s.mint, "to", s.to);
      const tx = await token.mint(s.to, BigInt(s.mint));
      await tx.wait();
    }
  }

  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); }
