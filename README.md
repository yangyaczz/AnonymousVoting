# Anoymous Voting

This project implements a privacy-preserving voting system using zero-knowledge proofs (ZKPs) with Circom and the Groth16 proving system. Each voter generates a cryptographic commitment to their identity and vote choice, ensuring anonymity while preventing double voting through a nullifier mechanism. The system utilizes Poseidon hashing for efficient commitments and enforces valid vote options within a specified range. The proof is verified both off-chain using snarkjs and on-chain via a Groth16 verifier smart contract.

# Steps for setting up zero-knowledge proof

## 1. compile circuit
```shell
# in project root
cd circuits
circom vote.circom --r1cs --wasm --sym
circom reveal.circom --r1cs --wasm --sym
```

## 2. generate trusted setup (only for testing)
```shell
# in project root
# Step 1: Generate initial powers of tau
snarkjs powersoftau new bn128 14 pot14_0000.ptau -v

# Step 2: First contribution
snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="First contribution" -v

# Step 3: Prepare phase 2
snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau -v

# set circuit for vote 4-6
# Step 4: Set circuit-specific key
# Note: Ensure using the correct r1cs file path
snarkjs groth16 setup vote.r1cs pot14_final.ptau vote_0000.zkey

# Step 5: Contribute randomness to zkey
snarkjs zkey contribute vote_0000.zkey vote_0001.zkey --name="Second contribution" -v

# Step 6: Export verification key
snarkjs zkey export verificationkey vote_0001.zkey vote_verification_key.json


# set circuit for reveal 4-6
# Step 4: Set circuit-specific key
snarkjs groth16 setup reveal.r1cs pot14_final.ptau reveal_0000.zkey

# Step 5: Contribute randomness to zkey
snarkjs zkey contribute reveal_0000.zkey reveal_0001.zkey --name="Second contribution" -v

# Step 6: Export verification key
snarkjs zkey export verificationkey reveal_0001.zkey reveal_verification_key.json
```




## 3. generate solidity verifier
```shell
# Ensure vote_0001.zkey file exists
snarkjs zkey export solidityverifier vote_0001.zkey ../contracts/VoteVerifier.sol

# Ensure reveal_0001.zkey file exists
snarkjs zkey export solidityverifier reveal_0001.zkey ../contracts/RevealVerifier.sol
```

## Notes
- All commands should be executed in the project root
- Ensure that the files generated in each step exist before executing the next step
- If you encounter errors about missing files, check the file paths and ensure all previous steps have been completed