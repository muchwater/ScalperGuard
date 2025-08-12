import "dotenv/config";
import { ethers } from "ethers";
import * as fs from "fs";

const RPC = process.env.RPC_URL!;
const CONTRACT = process.env.CONTRACT_ADDRESS!;

const provider = new ethers.JsonRpcProvider(RPC);

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event KYCUpdated(address indexed user, bool allowed)",
  "function allowedKYC(address) view returns (bool)",
  "function ownerOf(uint256) view returns (address)"
];

const outDir = "./indexer/out";
const transfersPath = `${outDir}/transfers.jsonl`;
const kycsPath = `${outDir}/kyc.jsonl`;

async function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const iface = new ethers.Interface(abi);

  const contract = new ethers.Contract(CONTRACT, abi, provider);

  console.log("Listening events from", CONTRACT);

  contract.on("Transfer", async (from: string, to: string, tokenId: bigint, ev: any) => {
    const rec = {
      ts: Math.floor(Date.now()/1000),
      block: ev.log.blockNumber,
      tx: ev.log.transactionHash,
      from, to, tokenId: tokenId.toString()
    };
    fs.appendFileSync(transfersPath, JSON.stringify(rec)+"\n");
    console.log("Transfer:", rec);
  });

  contract.on("KYCUpdated", (user: string, allowed: boolean, ev: any) => {
    const rec = {
      ts: Math.floor(Date.now()/1000),
      block: ev.log.blockNumber,
      tx: ev.log.transactionHash,
      user, allowed
    };
    fs.appendFileSync(kycsPath, JSON.stringify(rec)+"\n");
    console.log("KYCUpdated:", rec);
  });
}

main().catch(e=>{console.error(e);process.exit(1)});