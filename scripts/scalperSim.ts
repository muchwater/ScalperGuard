import "dotenv/config";
import { ethers } from "ethers";

// ======== 환경변수 ========
// 필수
const RPC_URL = process.env.RPC_URL!;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS!;
const WALLET_A_PK = process.env.WALLET_A_PK!; // 지갑 A (초기 보유자)
const WALLET_B_PK = process.env.WALLET_B_PK!; // 지갑 B

// 선택
const TOKEN_ID = BigInt(process.env.TOKEN_ID || "1");          // 왕복시킬 tokenId
const ITERATIONS = parseInt(process.env.ITERATIONS || "6", 10); // 총 전송 횟수 (A->B->A = 2회로 계산됨)
const GAP_SEC = parseInt(process.env.GAP_SEC || "20", 10);      // 각 전송 사이 대기(초). Cooldown보다 작으면 실패.

// 최소 ERC721 ABI
const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  if (!RPC_URL || !CONTRACT_ADDRESS || !WALLET_A_PK || !WALLET_B_PK) {
    throw new Error("Missing env. Need RPC_URL, CONTRACT_ADDRESS, WALLET_A_PK, WALLET_B_PK");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const walletA = new ethers.Wallet(WALLET_A_PK, provider);
  const walletB = new ethers.Wallet(WALLET_B_PK, provider);

  const cA = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, walletA);
  const cB = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, walletB);

  console.log("== Scalper Simulation ==");
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("TokenId :", TOKEN_ID.toString());
  console.log("A       :", walletA.address);
  console.log("B       :", walletB.address);
  console.log("ITER    :", ITERATIONS, "GAP_SEC:", GAP_SEC);
  console.log("----------");

  // 현재 소유자 확인
  let owner = await cA.ownerOf(TOKEN_ID);
  console.log("Current owner:", owner);

  // 이벤트 로그 리스너(선택)
  provider.on(
    { address: CONTRACT_ADDRESS, topics: [ethers.id("Transfer(address,address,uint256)")] },
    (log) => {
      try {
        const iface = new ethers.Interface(ERC721_ABI);
        const parsed = iface.parseLog(log);
        const { from, to, tokenId } = parsed.args as any;
        console.log(`[EVENT] Transfer ${tokenId.toString()} ${from} -> ${to} (block=${log.blockNumber})`);
      } catch (e) { /* ignore */ }
    }
  );

  // A<->B 왕복 전송 루프
  let from = owner.toLowerCase() === walletA.address.toLowerCase() ? walletA : walletB;
  let to   = from.address.toLowerCase() === walletA.address.toLowerCase() ? walletB : walletA;

  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`\n[${i}/${ITERATIONS}] ${from.address} -> ${to.address}`);
    const contract = from.address.toLowerCase() === walletA.address.toLowerCase() ? cA : cB;

    try {
      const tx = await contract.safeTransferFrom(from.address, to.address, TOKEN_ID);
      console.log("  tx sent:", tx.hash);
      const r = await tx.wait();
      console.log("  confirmed in block", r?.blockNumber);
    } catch (err: any) {
      console.error("  transfer failed:", err?.shortMessage || err?.message || err);
      console.error("  Hint) Cooldown / KYC / Near event blocked 가능성. GAP_SEC을 늘리거나 정책값을 낮춰보세요.");
    }

    // 다음 턴을 위해 소유자 전환
    from = from.address.toLowerCase() === walletA.address.toLowerCase() ? walletB : walletA;
    to   = from.address.toLowerCase() === walletA.address.toLowerCase() ? walletB : walletA;

    // 간격 두기(스캘퍼가 빠르게 반복하는 패턴을 흉내낼 수 있도록 짧게 설정 가능)
    if (i < ITERATIONS) {
      console.log(`  waiting ${GAP_SEC}s...`);
      await sleep(GAP_SEC * 1000);
    }
  }

  console.log("\nDone. You can now check indexer logs and /score API.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
