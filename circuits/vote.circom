pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template Vote() {
    // Public inputs
    signal input pubVoterCommitment; // Voter identity commitment
    signal input pubNullifier; // Nullifier to prevent double voting
    signal input pubVoteOptionHash; // Hash of the vote option (using salt)
    
    // Private inputs
    signal input privVoterSecret; // Voter's private secret
    signal input privVoteOption; // Integer value of the vote option
    signal input privVoteSalt; // Salt value for the vote option
    
    // Convert vote option to binary bits
    component num2Bits = Num2Bits(4);
    num2Bits.in <== privVoteOption;
    
    // Verify voter identity
    component voterHasher = Poseidon(1);
    voterHasher.inputs[0] <== privVoterSecret;
    voterHasher.out === pubVoterCommitment;
    
    // Ensure vote option is within valid range (1-15)
    component gtZero = GreaterThan(4);
    gtZero.in[0] <== privVoteOption;
    gtZero.in[1] <== 0;
    gtZero.out === 1;
    
    component ltSixteen = LessThan(4);
    ltSixteen.in[0] <== privVoteOption;
    ltSixteen.in[1] <== 16;
    ltSixteen.out === 1;
    
    // Calculate nullifier to prevent double voting
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== privVoterSecret;
    nullifierHasher.inputs[1] <== 0; // Fixed value, independent of vote option
    nullifierHasher.out === pubNullifier;
    
    // Calculate hash of vote option (using salt for privacy)
    component voteHasher = Poseidon(2);
    voteHasher.inputs[0] <== privVoteOption;
    voteHasher.inputs[1] <== privVoteSalt;
    voteHasher.out === pubVoteOptionHash;
}

component main {public [pubVoterCommitment, pubNullifier, pubVoteOptionHash]} = Vote();