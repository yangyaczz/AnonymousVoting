const { expect } = require("chai");
const { ethers } = require("hardhat");
const { groth16 } = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { log } = require("console");
const circomlibjs = require("circomlibjs");

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

// Helper function: Generate random number
function randomBigInt() {
  const randomValue = ethers.hexlify(ethers.randomBytes(31));
  return BigInt(randomValue) % 
    BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
}

describe("Anonymous Voting System", function() {
  let anonymousVoting;
  let voteVerifier;
  let revealVerifier;
  let admin;
  let voter1, voter2, voter3;
  let poseidon;
  
  // Mock voter data
  const voters = [];
  
  before(async function() {
    // Check if circuit files exist
    const voteWasmFile = path.join(__dirname, "../circuits/vote_js/vote.wasm");
    const revealWasmFile = path.join(__dirname, "../circuits/reveal_js/reveal.wasm");
    const voteZkeyFile = path.join(__dirname, "../circuits/vote_0001.zkey");
    const revealZkeyFile = path.join(__dirname, "../circuits/reveal_0001.zkey");
    
    // Skip tests if files don't exist
    if (!fs.existsSync(voteWasmFile) || !fs.existsSync(voteZkeyFile) ||
        !fs.existsSync(revealWasmFile) || !fs.existsSync(revealZkeyFile)) {
      console.log("Missing necessary zero-knowledge proof files, skipping tests");
      this.skip();
    }
    
    // Initialize Poseidon hasher
    poseidon = await circomlibjs.buildPoseidon();
  });
  
  beforeEach(async function() {
    // Get test accounts
    [admin, voter1, voter2, voter3] = await ethers.getSigners();
    
    // Deploy verifier contracts
    const VoteVerifier = await ethers.getContractFactory("VoteGroth16Verifier");
    voteVerifier = await VoteVerifier.deploy();
    await voteVerifier.waitForDeployment();

    const RevealVerifier = await ethers.getContractFactory("RevealGroth16Verifier");
    revealVerifier = await RevealVerifier.deploy();
    await revealVerifier.waitForDeployment();

    // Deploy voting contract
    const optionsCount = 3; // 3 options
    
    const AnonymousVoting = await ethers.getContractFactory("AnonymousVoting");
    anonymousVoting = await AnonymousVoting.deploy(
      admin.address, 
      voteVerifier.target, 
      revealVerifier.target, 
      optionsCount
    );
    await anonymousVoting.waitForDeployment(); 
    
    // Generate mock voter data
    voters.length = 0; // Clear previous data
    for (let i = 0; i < 3; i++) {
      const secret = randomBigInt();
      // Calculate commitment using Poseidon hash
      const commitment = poseidon.F.toString(poseidon([secret]));
      // Calculate nullifier
      const nullifier = poseidon.F.toString(poseidon([secret, BigInt(0)]));
      
      voters.push({
        secret: secret,
        commitment: commitment,
        nullifier: nullifier,
        voteOption: i + 1,
        voteSalt: randomBigInt()
      });
    }
  });
  
  describe("Contract Deployment", function() {
    it("should correctly set the admin", async function() {
      expect(await anonymousVoting.admin()).to.equal(admin.address);
    });
    
    it("should correctly set the number of voting options", async function() {
      expect(await anonymousVoting.optionsCount()).to.equal(3);
    });
    
    it("should correctly set the verifier contract addresses", async function() {
      expect(await anonymousVoting.verifier()).to.equal(voteVerifier.target);
      expect(await anonymousVoting.revealVerifier()).to.equal(revealVerifier.target);
    });
    
    it("should initialize in Registration state", async function() {
      expect(await anonymousVoting.votingState()).to.equal(0); // 0 = Registration
    });
  });
  
  describe("Voter Registration", function() {
    it("admin should be able to register voters", async function() {
      await anonymousVoting.registerVoter(voters[0].commitment);
      expect(await anonymousVoting.registeredVoterCommitments(voters[0].commitment)).to.be.true;
    });
    
    it("non-admin should not be able to register voters", async function() {
      await expect(
        anonymousVoting.connect(voter1).registerVoter(voters[0].commitment)
      ).to.be.revertedWith("Only admin can call this function");
    });
  });
  
  describe("State Management", function() {
    it("admin should be able to change voting state", async function() {
      await anonymousVoting.changeVotingState(1); // Change to Voting state
      expect(await anonymousVoting.votingState()).to.equal(1);
      
      await anonymousVoting.changeVotingState(2); // Change to Revealing state
      expect(await anonymousVoting.votingState()).to.equal(2);
      
      await anonymousVoting.changeVotingState(3); // Change to Ended state
      expect(await anonymousVoting.votingState()).to.equal(3);
    });
    
    it("non-admin should not be able to change voting state", async function() {
      await expect(
        anonymousVoting.connect(voter1).changeVotingState(1)
      ).to.be.revertedWith("Only admin can call this function");
    });
    
    it("should not be able to go back to previous state", async function() {
      await anonymousVoting.changeVotingState(1); // Change to Voting state
      
      await expect(
        anonymousVoting.changeVotingState(0) // Try to go back to Registration
      ).to.be.revertedWith("Cannot go back to previous state");
    });
  });
  
  describe("Voting Functionality", function() {
    beforeEach(async function() {
      // Register voters
      for (const voter of voters) {
        await anonymousVoting.registerVoter(voter.commitment);
      }
      
      // Change to Voting state
      await anonymousVoting.changeVotingState(1);
    });
    
    it("should not allow voting with invalid proof", async function() {
      // Mock invalid proof
      const mockProof = {
        a: [0, 0],
        b: [[0, 0], [0, 0]],
        c: [0, 0]
      };
      
      await expect(
        anonymousVoting.castVote(
          mockProof.a,
          mockProof.b,
          mockProof.c,
          voters[0].commitment,
          voters[0].nullifier,
          123456 // Random hash
        )
      ).to.be.revertedWith("Proof verification failed");
    });
    
    it("should not allow voting with unregistered commitment", async function() {
      // Generate a new commitment that's not registered
      const fakeCommitment = poseidon.F.toString(poseidon([randomBigInt()]));
      
      // Mock proof
      const mockProof = {
        a: [0, 0],
        b: [[0, 0], [0, 0]],
        c: [0, 0]
      };
      
      await expect(
        anonymousVoting.castVote(
          mockProof.a,
          mockProof.b,
          mockProof.c,
          fakeCommitment,
          voters[0].nullifier,
          123456 // Random hash
        )
      ).to.be.revertedWith("Voter not registered");
    });
  });
  
  
  // The following tests require real zero-knowledge proofs, implement in actual environment
  describe.skip("Complete Voting Flow with Real Proofs", function() {
    it("should be able to complete the entire voting process", async function() {
      // This test would use real ZK proofs to test the complete flow
      // 1. Register voters
      // 2. Change to Voting state
      // 3. Generate real proofs and vote
      // 4. Change to Revealing state
      // 5. Generate real reveal proofs and reveal votes
      // 6. Change to Ended state
      // 7. Verify results
    });
  });
});