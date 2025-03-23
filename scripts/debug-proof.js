const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const circomlibjs = require("circomlibjs");

async function main() {
    console.log("Debugging proof verification...");

    // check necessary files
    const voteWasmFile = path.join(__dirname, "../circuits/vote_js/vote.wasm");
    const revealWasmFile = path.join(__dirname, "../circuits/reveal_js/reveal.wasm");
    const voteZkeyFile = path.join(__dirname, "../circuits/vote_0001.zkey");
    const revealZkeyFile = path.join(__dirname, "../circuits/reveal_0001.zkey");

    if (!fs.existsSync(voteWasmFile) || !fs.existsSync(voteZkeyFile)) {
        console.error("Missing circuit files. Please compile the circuit first.");
        return;
    }

    if (!fs.existsSync(revealWasmFile) || !fs.existsSync(revealZkeyFile)) {
        console.error("Missing circuit files. Please compile the circuit first.");
        return;
    }

    // deploy verifier contract
    const [admin] = await ethers.getSigners();

    console.log("Deploying verifier contract...");
    const VoteVerifier = await ethers.getContractFactory("VoteGroth16Verifier");
    const voteVerifier = await VoteVerifier.deploy();
    await voteVerifier.waitForDeployment();
    console.log("VoteVerifier deployed at:", voteVerifier.target);

    const RevealVerifier = await ethers.getContractFactory("RevealGroth16Verifier");
    const revealVerifier = await RevealVerifier.deploy();
    await revealVerifier.waitForDeployment();
    console.log("RevealVerifier deployed at:", revealVerifier.target);

    // generate voter data
    console.log("Generating voter data...");
    const secret = BigInt(123456); // use fixed value for debugging
    console.log("Voter secret:", secret.toString());

    // initialize Poseidon hasher
    console.log("Initializing Poseidon hasher...");
    const poseidon = await circomlibjs.buildPoseidon();

    // calculate commitment
    const hash = poseidon.F.toString(poseidon([secret]));
    console.log("Calculated commitment:", hash);

    // calculate nullifier
    const voteOption = 1;
    const voteSalt = BigInt(789012); // random salt
    const nullifier = poseidon.F.toString(poseidon([secret, BigInt(0)]));
    console.log("Calculated nullifier:", nullifier);

    const voteOptionHash = poseidon.F.toString(poseidon([BigInt(voteOption), voteSalt]));
    console.log("Calculated voteOptionHash:", voteOptionHash);



    // prepare input
    const input = {
        privVoterSecret: secret.toString(),
        privVoteOption: voteOption,
        privVoteSalt: voteSalt.toString(),
        pubVoterCommitment: hash,
        pubNullifier: nullifier,
        pubVoteOptionHash: voteOptionHash
    };

    console.log("Input for proof generation:", JSON.stringify(input, null, 2));

    console.log("Generating proof...");
    const { proof: voteProof, publicSignals: votePublicSignals } = await snarkjs.groth16.fullProve(
        input,
        voteWasmFile,
        voteZkeyFile
    );

    console.log("Proof generated successfully");
    console.log("Public signals:", votePublicSignals);


    // format proof
    const formattedProof = {
        a: [voteProof.pi_a[0], voteProof.pi_a[1]],
        b: [
            [voteProof.pi_b[0][1], voteProof.pi_b[0][0]],
            [voteProof.pi_b[1][1], voteProof.pi_b[1][0]]
        ],
        c: [voteProof.pi_c[0], voteProof.pi_c[1]]
    };

    console.log("Formatted proof:", JSON.stringify(formattedProof, null, 2));

    // snarkjs verification
    console.log("Verifying proof directly...");


    const voteVkeyJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../circuits/vote_verification_key.json"), "utf8"));
    const snarkjsVerification = await snarkjs.groth16.verify(voteVkeyJson, votePublicSignals, voteProof);
    console.log("SnarkJS verification result:", snarkjsVerification);


    // solidity verification
    const isValid = await voteVerifier.verifyProof(
        formattedProof.a,
        formattedProof.b,
        formattedProof.c,
        votePublicSignals
    );
    console.log("Solidity verification result:", isValid);


    // reveal input
    const revealInput = {
        privVoteSalt: voteSalt.toString(),
        pubNullifier: nullifier,
        pubVoteOptionHash: voteOptionHash,
        pubVoteOption: voteOption
    };

    console.log("Reveal input:", JSON.stringify(revealInput, null, 2));

    console.log("Generating reveal proof...");
    const { proof: revealProof, publicSignals: revealPublicSignals } = await snarkjs.groth16.fullProve(
        revealInput,
        revealWasmFile,
        revealZkeyFile
    );

    console.log("Reveal proof generated successfully");
    console.log("Reveal public signals:", revealPublicSignals);

    // format reveal proof
    const formattedRevealProof = {
        a: [revealProof.pi_a[0], revealProof.pi_a[1]],
        b: [
            [revealProof.pi_b[0][1], revealProof.pi_b[0][0]],
            [revealProof.pi_b[1][1], revealProof.pi_b[1][0]]
        ],
        c: [revealProof.pi_c[0], revealProof.pi_c[1]]
    };

    console.log("Formatted reveal proof:", JSON.stringify(formattedRevealProof, null, 2));
    
    // snarkjs verification
    console.log("Verifying reveal proof directly...");
    const revealVkeyJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../circuits/reveal_verification_key.json"), "utf8"));
    const snarkjsRevealVerification = await snarkjs.groth16.verify(revealVkeyJson, revealPublicSignals, revealProof);
    console.log("SnarkJS reveal verification result:", snarkjsRevealVerification);
    
    // solidity verification
    const isValidReveal = await revealVerifier.verifyProof(
        formattedRevealProof.a,
        formattedRevealProof.b,
        formattedRevealProof.c,
        revealPublicSignals
    );
    console.log("Solidity reveal verification result:", isValidReveal);
    
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });