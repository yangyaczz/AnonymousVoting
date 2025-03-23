const { expect } = require("chai");
const { ethers } = require("hardhat");
const { groth16 } = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { log } = require("console");

// 辅助函数：将BigInt转换为适合合约的格式
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

// 辅助函数：生成随机数
function randomBigInt() {
    const randomValue = ethers.hexlify(ethers.randomBytes(31));
    return BigInt(randomValue) % 
      BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  }

describe("Anonymous Voting System", function() {
  let anonymousVoting;
  let verifier;
  let admin;
  let voter1, voter2, voter3;
  
  // Mock zero-knowledge proof data
  // Note: In actual testing, you need to use real proofs
  const mockProof = {
    a: [0, 0],
    b: [[0, 0], [0, 0]],
    c: [0, 0]
  };
  
  // Mock voter data
  const voters = [];
  
  before(async function() {
    // Remove this line to enable tests
    // this.skip();
    
    // In actual testing, you need to load compiled circuits and proving keys
    // const wasmFile = path.join(__dirname, "../circuits/vote_js/vote.wasm");
    // const zkeyFile = path.join(__dirname, "../circuits/vote_0001.zkey");
    
    // Check if files exist
    // if (!fs.existsSync(wasmFile) || !fs.existsSync(zkeyFile)) {
    //   console.log("Missing necessary zero-knowledge proof files, skipping tests");
    //   this.skip();
    // }
  });
  
  beforeEach(async function() {
    // 获取测试账户
    [admin, voter1, voter2, voter3] = await ethers.getSigners();
    
    // 部署验证者合约
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    // 部署投票合约
    const votingDuration = 60 * 60 * 24; // 1天
    const optionsCount = 3; // 3个选项
    
    const AnonymousVoting = await ethers.getContractFactory("AnonymousVoting");
    anonymousVoting = await AnonymousVoting.deploy(admin.address, votingDuration, optionsCount, verifier.target);
    await anonymousVoting.waitForDeployment(); 
    
    // 生成模拟选民数据
    for (let i = 0; i < 3; i++) {
      const secret = randomBigInt();
      // 在实际测试中，你需要使用Poseidon哈希计算承诺
      // 这里使用简单的哈希模拟
      const commitment = BigInt(ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [secret])
      )) % BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
      
      voters.push({
        secret: secret,
        commitment: commitment
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
    
    it("should correctly set the verifier contract address", async function() {
      expect(await anonymousVoting.verifier()).to.equal(verifier.target);
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
      ).to.be.revertedWith("Only the admin can call this function");
    });
    
    it("admin should be able to batch register voters", async function() {
      const commitments = voters.map(v => v.commitment);
      await anonymousVoting.batchRegisterVoters(commitments);
      
      for (const voter of voters) {
        expect(await anonymousVoting.registeredVoterCommitments(voter.commitment)).to.be.true;
      }
    });
  });
  
  describe("Voting Functionality", function() {
    // Note: These tests require real zero-knowledge proofs
    // Without real proofs, we can only test basic contract functionality
    
    it("unregistered voters should not be able to vote", async function() {
      // Mock voting data
      const voterCommitment = voters[0].commitment;
      const voteOption = 1;
      const nullifier = randomBigInt();
      
      await expect(
        anonymousVoting.castVote(
          mockProof.a,
          mockProof.b,
          mockProof.c,
          voterCommitment,
          voteOption,
          nullifier
        )
      ).to.be.revertedWith("Voter not registered");
    });
    
    it("vote option should be within valid range", async function() {
      // Register voter
      await anonymousVoting.registerVoter(voters[0].commitment);
      
      // Mock voting data
      const voterCommitment = voters[0].commitment;
      const invalidOption = 10; // Out of range
      const nullifier = randomBigInt();
      
      await expect(
        anonymousVoting.castVote(
          mockProof.a,
          mockProof.b,
          mockProof.c,
          voterCommitment,
          invalidOption,
          nullifier
        )
      ).to.be.revertedWith("Invalid vote option");
    });
  });
  
  describe("Result Revelation", function() {
    it("should not be able to reveal results during voting period", async function() {
      await expect(
        anonymousVoting.revealResults()
      ).to.be.revertedWith("Voting has not ended yet");
    });
    
    it("non-admin should not be able to reveal results", async function() {
      // Simulate time passing to end voting
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      await expect(
        anonymousVoting.connect(voter1).revealResults()
      ).to.be.revertedWith("Only the admin can call this function");
    });
    
    it("admin should be able to reveal results after voting ends", async function() {
      // Simulate time passing to end voting
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      await anonymousVoting.revealResults();
      expect(await anonymousVoting.resultRevealed()).to.be.true;
    });
    
    it("should be able to get voting results after revelation", async function() {
      // Simulate time passing to end voting
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      await anonymousVoting.revealResults();
      const results = await anonymousVoting.getResults();
      
      // Verify result array length
      expect(results.length).to.equal(4); // Options start from 1, so length is optionsCount+1
    });
  });
  
  describe("Voting Time Management", function() {
    it("admin should be able to extend voting time", async function() {
      const initialEndTime = await anonymousVoting.votingEndTime();
      const additionalTime = 60 * 60 * 24; // 1 day
      
      await anonymousVoting.extendVoting(additionalTime);
      
      const newEndTime = await anonymousVoting.votingEndTime();
      expect(newEndTime).to.equal(initialEndTime + BigInt(additionalTime));
    });
    
    it("should not be able to extend voting time after voting ends", async function() {
      // Simulate time passing to end voting
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      await expect(
        anonymousVoting.extendVoting(3600)
      ).to.be.revertedWith("Voting has ended");
    });
  });
  
  // The following tests require real zero-knowledge proofs, implement in actual environment
  describe.skip("Complete Voting Flow", function() {
    it("should be able to complete the entire voting process", async function() {
      // 1. Register voters
      await anonymousVoting.batchRegisterVoters(voters.map(v => v.commitment));
      
      // 2. Generate real zero-knowledge proofs and vote
      // This part requires snarkjs and compiled circuits
      
      // 3. End voting and reveal results
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      await anonymousVoting.revealResults();
      
      // 4. Verify results
      const results = await anonymousVoting.getResults();
      // Verify voting results
    });
  });
});