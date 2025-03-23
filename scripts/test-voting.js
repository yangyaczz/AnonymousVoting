const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const circomlibjs = require("circomlibjs");

// Helper function: Generate random number
function randomBigInt() {
  const randomValue = ethers.hexlify(ethers.randomBytes(31));
  return BigInt(randomValue) %
    BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
}

// Helper function: Format proof for contract
function formatProofForContract(proof) {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]]
    ],
    c: [proof.pi_c[0], proof.pi_c[1]]
  };
}

async function main() {
  console.log("Testing ZK Voting System...");

  // Check necessary files
  const voteWasmFile = path.join(__dirname, "../circuits/vote_js/vote.wasm");
  const revealWasmFile = path.join(__dirname, "../circuits/reveal_js/reveal.wasm");
  const voteZkeyFile = path.join(__dirname, "../circuits/vote_0001.zkey");
  const revealZkeyFile = path.join(__dirname, "../circuits/reveal_0001.zkey");

  if (!fs.existsSync(voteWasmFile) || !fs.existsSync(voteZkeyFile)) {
    console.error("Missing circuit files. Please compile the circuits first.");
    return;
  }

  if (!fs.existsSync(revealWasmFile) || !fs.existsSync(revealZkeyFile)) {
    console.error("Missing circuit files. Please compile the circuits first.");
    return;
  }

  // Deploy contracts
  const [admin, voter1, voter2] = await ethers.getSigners();

  console.log("Deploying vote verifier contract...");
  const VoteVerifier = await ethers.getContractFactory("VoteGroth16Verifier");
  const voteVerifier = await VoteVerifier.deploy();
  await voteVerifier.waitForDeployment();
  console.log("Vote verifier contract deployed at:", voteVerifier.target);

  console.log("Deploying reveal verifier contract...");
  const RevealVerifier = await ethers.getContractFactory("RevealGroth16Verifier");
  const revealVerifier = await RevealVerifier.deploy();
  await revealVerifier.waitForDeployment();
  console.log("Reveal verifier contract deployed at:", revealVerifier.target);

  console.log("Deploying voting contract...");
  const optionsCount = 3; // 3 options

  const AnonymousVoting = await ethers.getContractFactory("AnonymousVoting");
  const voting = await AnonymousVoting.deploy(
    admin.address,
    voteVerifier.target,
    revealVerifier.target,
    optionsCount
  );
  await voting.waitForDeployment();
  console.log("Voting contract deployed at:", voting.target);

  // Generate voter data
  console.log("Generating voter data...");
  const secret = randomBigInt();
  console.log("Voter secret:", secret.toString());

  // Initialize Poseidon hash
  console.log("Initializing Poseidon hash...");
  const poseidon = await circomlibjs.buildPoseidon();

  // Calculate commitment
  const hash = poseidon.F.toString(poseidon([secret]));
  console.log("Calculated commitment:", hash);

  // Calculate nullifier
  const voteOption = 1;
  const voteSalt = randomBigInt(); // Random salt
  const nullifier = poseidon.F.toString(poseidon([secret, BigInt(0)]));
  console.log("Calculated nullifier:", nullifier);

  // Calculate vote option hash
  const voteOptionHash = poseidon.F.toString(poseidon([BigInt(voteOption), voteSalt]));
  console.log("Calculated vote option hash:", voteOptionHash);

  // Prepare input
  const input = {
    privVoterSecret: secret.toString(),
    privVoteOption: voteOption,
    privVoteSalt: voteSalt.toString(),
    pubVoterCommitment: hash,
    pubNullifier: nullifier,
    pubVoteOptionHash: voteOptionHash
  };

  console.log("Generating vote proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    voteWasmFile,
    voteZkeyFile
  );

  const commitment = publicSignals[0];
  const outputNullifier = publicSignals[1];
  const outputVoteOptionHash = publicSignals[2];

  console.log("Proof generated successfully");
  console.log("Voter commitment in proof:", commitment);
  console.log("Nullifier in proof:", outputNullifier);
  console.log("Vote option hash in proof:", outputVoteOptionHash);

  // Change state to registration phase
  console.log("Changing state to registration phase...");
  // Registration phase is already the initial state, no need to change

  // Register voter
  console.log("Registering voter...");
  await voting.connect(admin).registerVoter(commitment);
  console.log("Voter registered");

  // Change state to voting phase
  console.log("Changing state to voting phase...");
  await voting.connect(admin).changeVotingState(1); // 1 = Voting phase

  // Format proof
  const formattedProof = formatProofForContract(proof);

  // Cast vote
  console.log("Casting vote...");
  const tx = await voting.castVote(
    formattedProof.a,
    formattedProof.b,
    formattedProof.c,
    commitment,
    outputNullifier,
    outputVoteOptionHash
  );
  await tx.wait();
  console.log("Vote cast successfully");

  // Change state to revealing phase
  console.log("Changing state to revealing phase...");
  await voting.connect(admin).changeVotingState(2); // 2 = Revealing phase

  // Generate reveal proof
  console.log("Generating reveal proof...");
  const revealInput = {
    privVoteSalt: voteSalt.toString(),
    pubNullifier: nullifier,
    pubVoteOptionHash: voteOptionHash,
    pubVoteOption: voteOption
  };

  const { proof: revealProof, publicSignals: revealPublicSignals } = await snarkjs.groth16.fullProve(
    revealInput,
    revealWasmFile,
    revealZkeyFile
  );

  console.log("Reveal proof generated successfully");
  console.log("Reveal proof public signals:", revealPublicSignals);

  // Format reveal proof
  const formattedRevealProof = formatProofForContract(revealProof);

  // Reveal vote
  console.log("Revealing vote...");
  const revealTx = await voting.revealVoteWithProof(
    formattedRevealProof.a,
    formattedRevealProof.b,
    formattedRevealProof.c,
    outputNullifier,
    voteOption
  );
  await revealTx.wait();
  console.log("Vote revealed");

  // Change state to ended phase
  console.log("Changing state to ended phase...");
  await voting.connect(admin).changeVotingState(3); // 3 = Ended phase

  console.log("Getting results...");
  const results = await voting.getResults();

  console.log("Voting results:");
  for (let i = 0; i < optionsCount; i++) {
    console.log(`Option ${i + 1}: ${results[i]} votes`);
  }

  console.log("ZK Voting test completed successfully");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });