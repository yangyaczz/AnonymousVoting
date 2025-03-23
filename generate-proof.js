const snarkjs = require("snarkjs");
const fs = require("fs");

async function generateProof(secret, voteOption) {
  // Convert vote option to binary bits
  const optionBits = [];
  let option = voteOption;
  for (let i = 0; i < 4; i++) {
    optionBits.push(option % 2);
    option = Math.floor(option / 2);
  }
  
  // Calculate commitment using Poseidon hash
  // This is a simplified example - you need to implement actual Poseidon hashing
  const commitment = BigInt(secret) % BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  
  // Calculate nullifier
  const nullifier = (BigInt(secret) + BigInt(voteOption)) % BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  
  // Prepare input
  const input = {
    privVoterSecret: secret,
    privVoteOptionBits: optionBits,
    pubVoterCommitment: commitment.toString(),
    pubVoteOption: voteOption,
    pubNullifier: nullifier.toString()
  };
  
  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "circuits/vote_js/vote.wasm",
    "circuits/vote_0001.zkey"
  );
  
  return { proof, publicSignals, commitment, nullifier };
}

module.exports = { generateProof };