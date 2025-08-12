import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const name = "ScalperGuardTicket";
  const symbol = "SGT";
  const faceValue = ethers.parseEther("0.01"); // 0.01 ETH
  const eventStart = BigInt(process.env.EVENT_START || Math.floor(Date.now()/1000 + 24*3600).toString());
  const cooldown = BigInt(process.env.COOLDOWN_SEC || "600");
  const blockBefore = BigInt(process.env.BLOCK_BEFORE_START_SEC || "3600");

  const Factory = await ethers.getContractFactory("CappedResaleTicket");
  const contract = await Factory.deploy(name, symbol, faceValue, eventStart, cooldown, blockBefore);
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("Deployed at:", addr);

  const envPath = ".env";
  let env = "";
  try { env = fs.readFileSync(envPath, "utf-8"); } catch {}
  const next = env.replace(/CONTRACT_ADDRESS=.*/g, "CONTRACT_ADDRESS="+addr) || (env+`\nCONTRACT_ADDRESS=${addr}\n`);
  fs.writeFileSync(envPath, next);

  // 샘플 KYC 허용: 배포자 본인
  const tx = await contract.setKYC(deployer.address, true);
  await tx.wait();
  console.log("KYC allowed for deployer");
}

main().catch((e) => { console.error(e); process.exit(1); });