import { ethers } from "hardhat";

async function main() {
  const feeBps = Number(process.env.ESCROW_FEE_BPS||0);
  const [deployer] = await ethers.getSigners();
  const Escrow = await ethers.getContractFactory("Escrow");
  const esc = await Escrow.deploy(feeBps, deployer.address);
  await esc.waitForDeployment();
  console.log("escrow:", await esc.getAddress());
}
main().catch((e)=>{ console.error(e); process.exit(1); });
