import { ethers } from "hardhat";

async function main() {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) throw new Error("CONTRACT_ADDRESS missing in .env");
  const [signer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("CappedResaleTicket", addr, signer);

  const target = process.argv[2];
  const allow = (process.argv[3] || "true").toLowerCase() !== "false";
  if (!target) throw new Error("Usage: npm run setkyc -- 0xWallet [true|false]");

  const tx = await contract.setKYC(target, allow);
  await tx.wait();
  console.log(`KYC set ${target} => ${allow}`);
}

main().catch((e)=>{console.error(e);process.exit(1)});