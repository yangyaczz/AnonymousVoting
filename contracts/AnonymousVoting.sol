// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[3] memory input
    ) external view returns (bool);
}

contract AnonymousVoting {
    address public admin;
    uint256 public votingEndTime;
    bool public resultRevealed;
    
    // 投票选项数量
    uint256 public optionsCount;
    
    // 投票计数
    mapping(uint256 => uint256) private voteCounts;
    
    // 已使用的nullifier，防止重复投票
    mapping(uint256 => bool) public usedNullifiers;
    
    // 已注册的选民承诺
    mapping(uint256 => bool) public registeredVoterCommitments;
    
    // 验证者合约
    IVerifier public verifier;
    
    // 投票结果
    uint256[] public finalResults;
    
    event VoterRegistered(uint256 commitment);
    event VoteCast(uint256 nullifier, uint256 option);
    event ResultRevealed();
    
    constructor(address _admin, uint256 _votingDuration, uint256 _optionsCount, address _verifierAddress) {
        admin = _admin;
        votingEndTime = block.timestamp + _votingDuration;
        optionsCount = _optionsCount;
        verifier = IVerifier(_verifierAddress);
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only the admin can call this function");
        _;
    }
    
    modifier votingOpen() {
        require(block.timestamp < votingEndTime, "Voting has ended");
        _;
    }
    
    modifier votingClosed() {
        require(block.timestamp >= votingEndTime, "Voting has not ended yet");
        _;
    }
    
    // 注册选民
    function registerVoter(uint256 commitment) external onlyAdmin {
        require(!registeredVoterCommitments[commitment], "Voter commitment already registered");
        registeredVoterCommitments[commitment] = true;
        emit VoterRegistered(commitment);
    }
    
    // 批量注册选民
    function batchRegisterVoters(uint256[] calldata commitments) external onlyAdmin {
        for (uint i = 0; i < commitments.length; i++) {
            if (!registeredVoterCommitments[commitments[i]]) {
                registeredVoterCommitments[commitments[i]] = true;
                emit VoterRegistered(commitments[i]);
            }
        }
    }
    
    // 投票函数
    function castVote(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 voterCommitment,
        uint256 voteOption,
        uint256 nullifier
    ) external votingOpen {
        // Verify voter is registered
        require(registeredVoterCommitments[voterCommitment], "Voter not registered");
        
        // Verify vote option is valid
        require(voteOption > 0 && voteOption <= optionsCount, "Invalid vote option");
        
        // Verify nullifier has not been used
        require(!usedNullifiers[nullifier], "Voter already voted");
        
        // Verify zero-knowledge proof
        uint[3] memory input = [voterCommitment, voteOption, nullifier];
        require(verifier.verifyProof(a, b, c, input), "Proof verification failed");
        
        // Mark nullifier as used
        usedNullifiers[nullifier] = true;
        
        // Record vote
        voteCounts[voteOption] += 1;
        
        emit VoteCast(nullifier, voteOption);
    }
    
    // 揭示结果
    function revealResults() external onlyAdmin votingClosed {
        require(!resultRevealed, "Results already revealed");
        
        resultRevealed = true;
        
        // Collect vote counts for all options
        finalResults = new uint256[](optionsCount + 1); // +1 because options start from 1
        for (uint256 i = 1; i <= optionsCount; i++) {
            finalResults[i] = voteCounts[i];
        }
        
        emit ResultRevealed();
    }
    
    // 获取投票结果
    function getResults() external view returns (uint256[] memory) {
        require(resultRevealed, "Results not revealed yet");
        return finalResults;
    }
    
    // Extend voting time
    function extendVoting(uint256 additionalTime) external onlyAdmin votingOpen {
        votingEndTime += additionalTime;
    }
}