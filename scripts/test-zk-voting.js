const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const circomlibjs = require("circomlibjs");

// 辅助函数：生成随机数
function randomBigInt() {
  const randomValue = ethers.hexlify(ethers.randomBytes(31));
  return BigInt(randomValue) % 
    BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
}

// 辅助函数：将证明格式化为合约可用格式
function formatProofForContract(proof) {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][0], proof.pi_b[0][1]],
      [proof.pi_b[1][0], proof.pi_b[1][1]]
    ],
    c: [proof.pi_c[0], proof.pi_c[1]]
  };
}

async function main() {
  console.log("Testing ZK voting system...");
  
  // 检查必要文件
  const wasmFile = path.join(__dirname, "../circuits/vote_js/vote.wasm");
  const zkeyFile = path.join(__dirname, "../circuits/vote_0001.zkey");
  
  if (!fs.existsSync(wasmFile) || !fs.existsSync(zkeyFile)) {
    console.error("Missing circuit files. Please compile the circuit first.");
    return;
  }
  
  // 部署合约
  const [admin, voter1, voter2] = await ethers.getSigners();
  
  console.log("Deploying verifier contract...");
  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  console.log("Verifier deployed at:", verifier.target);
  
  console.log("Deploying voting contract...");
  const votingDuration = 60 * 60 * 24; // 1 day
  const optionsCount = 3; // 3 options
  
  const AnonymousVoting = await ethers.getContractFactory("AnonymousVoting");
  const voting = await AnonymousVoting.deploy(admin.address, votingDuration, optionsCount, verifier.target);
  await voting.waitForDeployment();
  console.log("Voting contract deployed at:", voting.target);
  
  // 生成选民数据
  console.log("Generating voter data...");
  const secret = randomBigInt();
  console.log("Voter secret:", secret.toString());
  
  // 初始化Poseidon哈希
  console.log("Initializing Poseidon hasher...");
  const poseidon = await circomlibjs.buildPoseidon();
  
  // 计算承诺 - 修复Buffer问题
  // 直接使用BigInt作为输入
  const hash = poseidon.F.toString(poseidon([secret]));
  console.log("Calculated commitment:", hash);
  
  // 计算nullifier - 修复Buffer问题
  const voteOption = 1;
  const nullifier = poseidon.F.toString(poseidon([secret, BigInt(voteOption)]));
  console.log("Calculated nullifier:", nullifier);
  
  // 准备输入
  const input = {
    privVoterSecret: secret.toString(),
    privVoteOption: voteOption,
    pubVoterCommitment: hash,
    pubVoteOption: voteOption,
    pubNullifier: nullifier
  };
  
  console.log("Generating proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmFile,
    zkeyFile
  );
  
  const commitment = publicSignals[0];
  const outputNullifier = publicSignals[2];
  
  console.log("Proof generated successfully");
  console.log("Voter commitment from proof:", commitment);
  console.log("Vote option from proof:", publicSignals[1]);
  console.log("Nullifier from proof:", outputNullifier);
  
  // 注册选民
  console.log("Registering voter...");
  await voting.registerVoter(commitment);
  console.log("Voter registered");
  
  // 格式化证明
  const formattedProof = formatProofForContract(proof);
  
  // 投票
  console.log("Casting vote...");
  const tx = await voting.castVote(
    formattedProof.a,
    formattedProof.b,
    formattedProof.c,
    commitment,
    voteOption,
    outputNullifier
  );
  await tx.wait();
  console.log("Vote cast successfully");
  
  // 结束投票并揭示结果
  console.log("Fast-forwarding time...");
  await ethers.provider.send("evm_increaseTime", [votingDuration + 1]);
  await ethers.provider.send("evm_mine", []);
  
  console.log("Revealing results...");
  await voting.revealResults();
  
  console.log("Getting results...");
  const results = await voting.getResults();
  
  console.log("Voting results:");
  for (let i = 1; i <= optionsCount; i++) {
    console.log(`Option ${i}: ${results[i]} votes`);
  }
  
  console.log("ZK voting test completed successfully");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });