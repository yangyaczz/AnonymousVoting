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

interface IRevealVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[3] memory input
    ) external view returns (bool);
}

contract AnonymousVoting {
    // Voting states
    enum VotingState { Registration, Voting, Revealing, Ended }
    VotingState public votingState;
    
    // Verifier contracts
    IVerifier public verifier;
    IRevealVerifier public revealVerifier;
    
    // Admin address
    address public admin;
    
    // Number of voting options
    uint256 public optionsCount;
    
    // Registered voter commitments
    mapping(uint256 => bool) public registeredVoterCommitments;
    
    // Used nullifiers
    mapping(uint256 => bool) public usedNullifiers;
    
    // Vote option hash to nullifier mapping
    mapping(uint256 => uint256) public voteOptionHashes; // nullifier => voteOptionHash
    
    // Revealed votes
    mapping(uint256 => bool) public revealedVotes; // nullifier => isRevealed
    
    // Vote counts for each option
    mapping(uint256 => uint256) public voteCounts;
    
    // Total votes and revealed votes
    uint256 public totalVotes;
    
    // Events
    event VoterRegistered(uint256 commitment);
    event VoteCast(uint256 voterCommitment, uint256 nullifier, uint256 voteOptionHash);
    event VoteRevealed(uint256 nullifier, uint256 voteOption);
    event VotingStateChanged(VotingState state);
    
    // Modifier
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }
    
    modifier inState(VotingState _state) {
        require(votingState == _state, "Invalid voting state");
        _;
    }
    
    // Constructor
    constructor(
        address _admin,
        address _verifier,
        address _revealVerifier,
        uint256 _optionsCount
    ) {
        verifier = IVerifier(_verifier);
        revealVerifier = IRevealVerifier(_revealVerifier);
        admin = _admin;
        optionsCount = _optionsCount;
        votingState = VotingState.Registration;
    }
    
    // Change voting state
    function changeVotingState(VotingState _newState) external onlyAdmin {
        require(uint8(_newState) > uint8(votingState), "Cannot go back to previous state");
        votingState = _newState;
        emit VotingStateChanged(_newState);
    }
    
    // Register voter
    function registerVoter(uint256 _commitment) external onlyAdmin inState(VotingState.Registration) {
        require(!registeredVoterCommitments[_commitment], "Voter already registered");
        registeredVoterCommitments[_commitment] = true;
        emit VoterRegistered(_commitment);
    }
    
    // Cast vote
    function castVote(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 voterCommitment,
        uint256 nullifier,
        uint256 voteOptionHash
    ) external inState(VotingState.Voting) {
        // Verify voter is registered
        require(registeredVoterCommitments[voterCommitment], "Voter not registered");
        
        // Verify nullifier is used
        require(!usedNullifiers[nullifier], "Voter already voted");
        
        // Verify zero-knowledge proof
        uint[3] memory input = [voterCommitment, nullifier, voteOptionHash];
        require(verifier.verifyProof(a, b, c, input), "Proof verification failed");
        
        // Store vote option hash
        voteOptionHashes[nullifier] = voteOptionHash;
        usedNullifiers[nullifier] = true;
        totalVotes++;
        
        emit VoteCast(voterCommitment, nullifier, voteOptionHash);
    }
    
    // Reveal vote using zero-knowledge proof
    function revealVoteWithProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 nullifier,
        uint256 voteOption
    ) external inState(VotingState.Revealing) {
        // Verify vote option is valid
        require(voteOption > 0 && voteOption <= optionsCount, "Invalid vote option");
        
        // Verify nullifier exists and is not revealed
        require(usedNullifiers[nullifier], "Vote not found");
        require(!revealedVotes[nullifier], "Vote already revealed");
        
        // Get stored vote option hash
        uint256 storedVoteOptionHash = voteOptionHashes[nullifier];
        
        // Verify zero-knowledge proof
        uint[3] memory input = [nullifier, storedVoteOptionHash, voteOption];
        require(revealVerifier.verifyProof(a, b, c, input), "Proof verification failed");
        
        // Record vote
        voteCounts[voteOption]++;
        revealedVotes[nullifier] = true;

        
        emit VoteRevealed(nullifier, voteOption);
    }
    
    // Get voting results
    function getResults() external view inState(VotingState.Ended) returns (uint256[] memory) {
        uint256[] memory results = new uint256[](optionsCount);
        for (uint256 i = 1; i <= optionsCount; i++) {
            results[i-1] = voteCounts[i];
        }
        return results;
    }
    
}