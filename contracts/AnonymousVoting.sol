// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[2] memory input
    ) external view returns (bool);
}

contract AnonymousVoting {
    address public admin;
    uint256 public votingEndTime;
    uint256 public optionsCount;
    IVerifier public verifier;
    bool public resultRevealed;
    
    // 记录已注册的选民承诺
    mapping(uint256 => bool) public registeredVoterCommitments;
    
    // 记录已使用的nullifier，防止重复投票
    mapping(uint256 => bool) public usedNullifiers;
    
    // 记录每个选项的投票数
    mapping(uint256 => uint256) private voteCounts;
    
    // 最终结果
    uint256[] public finalResults;
    
    // 事件
    event VoterRegistered(uint256 commitment);
    event VoteCast(uint256 voterCommitment, uint256 nullifier);
    event ResultsRevealed();
    
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
    
    constructor(
        address _admin,
        uint256 _votingDuration,
        uint256 _optionsCount,
        address _verifier
    ) {
        admin = _admin;
        votingEndTime = block.timestamp + _votingDuration;
        optionsCount = _optionsCount;
        verifier = IVerifier(_verifier);
        
        // 初始化结果数组
        finalResults = new uint256[](_optionsCount + 1);
    }
    
    // 注册单个选民
    function registerVoter(uint256 commitment) external onlyAdmin {
        require(!registeredVoterCommitments[commitment], "Voter commitment already registered");
        registeredVoterCommitments[commitment] = true;
        emit VoterRegistered(commitment);
    }
    
    // 批量注册选民
    function batchRegisterVoters(uint256[] calldata commitments) external onlyAdmin {
        for (uint256 i = 0; i < commitments.length; i++) {
            if (!registeredVoterCommitments[commitments[i]]) {
                registeredVoterCommitments[commitments[i]] = true;
                emit VoterRegistered(commitments[i]);
            }
        }
    }
    
    // 投票
    function castVote(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 voterCommitment,
        uint256 voteOption, // 这个参数现在是私有的，不会被验证
        uint256 nullifier
    ) external votingOpen {
        // 验证选民是否已注册
        require(registeredVoterCommitments[voterCommitment], "Voter not registered");
        
        // 验证投票选项是否有效
        require(voteOption > 0 && voteOption <= optionsCount, "Invalid vote option");
        
        // 验证nullifier是否已使用
        require(!usedNullifiers[nullifier], "Voter already voted");
        
        // 验证零知识证明
        uint[2] memory input = [voterCommitment, nullifier];
        require(verifier.verifyProof(a, b, c, input), "Proof verification failed");
        
        // 记录投票
        voteCounts[voteOption]++;
        usedNullifiers[nullifier] = true;
        
        emit VoteCast(voterCommitment, nullifier);
    }
    
    // 揭示结果
    function revealResults() external onlyAdmin votingClosed {
        require(!resultRevealed, "Results already revealed");
        
        for (uint256 i = 1; i <= optionsCount; i++) {
            finalResults[i] = voteCounts[i];
        }
        
        resultRevealed = true;
        emit ResultsRevealed();
    }
    
    // 获取投票结果
    function getResults() external view returns (uint256[] memory) {
        require(resultRevealed, "Results not revealed yet");
        return finalResults;
    }
    
    // 延长投票时间
    function extendVoting(uint256 additionalTime) external onlyAdmin votingOpen {
        votingEndTime += additionalTime;
    }
}