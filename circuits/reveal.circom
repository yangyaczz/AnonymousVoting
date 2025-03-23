pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template RevealVote() {
    // Public inputs
    signal input pubNullifier; // Nullifier associated with the vote
    signal input pubVoteOptionHash; // Previously submitted vote option hash
    signal input pubVoteOption; // Revealed vote option
    
    // Private inputs
    signal input privVoteSalt; // Salt value used previously
    
    // Verify that the vote option matches the previously submitted hash
    component voteHasher = Poseidon(2);
    voteHasher.inputs[0] <== pubVoteOption;
    voteHasher.inputs[1] <== privVoteSalt;
    voteHasher.out === pubVoteOptionHash;
}

component main {public [pubNullifier, pubVoteOptionHash, pubVoteOption]} = RevealVote();