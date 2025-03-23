# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```

# 零知识证明设置步骤

## 1. 编译电路
```shell
# 确保在项目根目录下执行
cd circuits
circom vote.circom --r1cs --wasm --sym
```

## 2. 生成trusted setup (仅用于测试)
```shell
# 确保所有命令在项目根目录下执行
# 第一步：生成初始的powers of tau
snarkjs powersoftau new bn128 14 pot14_0000.ptau -v

# 第二步：第一次贡献
snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="First contribution" -v

# 第三步：准备phase 2
snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau -v

# 第四步：设置电路特定的key
# 注意：确保使用正确的r1cs文件路径
snarkjs groth16 setup vote.r1cs pot14_final.ptau vote_0000.zkey

# 第五步：为zkey贡献随机性
snarkjs zkey contribute vote_0000.zkey vote_0001.zkey --name="Second contribution" -v

# 第六步：导出验证密钥
snarkjs zkey export verificationkey vote_0001.zkey verification_key.json
```

## 3. 生成Solidity验证者
```shell
# 确保vote_0001.zkey文件存在
snarkjs zkey export solidityverifier vote_0001.zkey ../contracts/VoteVerifier.sol
```

## 注意事项
- 所有命令都应该在项目根目录下执行
- 确保在执行每个步骤之前，前一个步骤生成的文件都存在
- 如果遇到文件不存在的错误，请检查文件路径和是否完成了前序步骤