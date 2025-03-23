const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const circomlibjs = require("circomlibjs");

async function main() {
    console.log("Debugging proof verification...");

    // 检查必要文件
    const wasmFile = path.join(__dirname, "../circuits/simple_vote_js/simple_vote.wasm");
    const zkeyFile = path.join(__dirname, "../circuits/vote_0001.zkey");

    if (!fs.existsSync(wasmFile) || !fs.existsSync(zkeyFile)) {
        console.error("Missing circuit files. Please compile the circuit first.");
        return;
    }

    // 部署验证者合约
    const [admin] = await ethers.getSigners();

    console.log("Deploying verifier contract...");
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    console.log("Verifier deployed at:", verifier.target);

    // 生成选民数据
    console.log("Generating voter data...");
    const secret = BigInt(4); // 使用固定值便于调试
    console.log("Voter secret:", secret.toString());


    // 准备输入
    const input = {
        privSecret: secret.toString(),
    };

    console.log("Input for proof generation:", JSON.stringify(input, null, 2));

    console.log("Generating proof...");
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmFile,
        zkeyFile
    );

    console.log("Proof generated successfully");
    console.log("Public signals:", publicSignals);

    // publicSignals = ['15241383936'];

    console.log("proof", proof);


    // 格式化证明
    const formattedProof = {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [
            [proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]]
        ],
        c: [proof.pi_c[0], proof.pi_c[1]]
    };

    console.log("Formatted proof:", JSON.stringify(formattedProof, null, 2));

    // snarkjs验证证明
    console.log("Verifying proof directly...");

    console.log("Verifying with snarkjs...");
    const vkeyJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../circuits/verification_key.json"), "utf8"));
    const snarkjsVerification = await snarkjs.groth16.verify(vkeyJson, publicSignals, proof);
    console.log("SnarkJS verification result:", snarkjsVerification);

    try {
        const isValid = await verifier.verifyProof(
            formattedProof.a,
            formattedProof.b,
            formattedProof.c,
            publicSignals
        );
        console.log("Direct verification result:", isValid);
    } catch (error) {
        console.error("Error verifying proof directly:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

