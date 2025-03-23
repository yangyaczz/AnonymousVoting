pragma circom 2.0.0;

template SimpleVote() {
    signal input privSecret;
    signal output pubCommitment;
    
    pubCommitment <== privSecret * privSecret;
}

component main = SimpleVote();