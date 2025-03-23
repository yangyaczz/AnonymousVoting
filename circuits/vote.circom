pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template Vote() {
    // 公共输入
    signal input pubVoterCommitment; // 选民身份承诺
    signal input pubNullifier; // 防止重复投票的nullifier
    
    // 私有输入
    signal input privVoterSecret; // 选民私有秘密
    signal input privVoteOption; // 投票选项的整数值
    
    // 将投票选项转换为二进制位
    component num2Bits = Num2Bits(4);
    num2Bits.in <== privVoteOption;
    
    // 验证选民身份
    component voterHasher = Poseidon(1);
    voterHasher.inputs[0] <== privVoterSecret;
    voterHasher.out === pubVoterCommitment;
    
    // 确保投票选项在有效范围内 (1-15)
    component gtZero = GreaterThan(4);
    gtZero.in[0] <== privVoteOption;
    gtZero.in[1] <== 0;
    gtZero.out === 1;
    
    component ltSixteen = LessThan(4);
    ltSixteen.in[0] <== privVoteOption;
    ltSixteen.in[1] <== 16;
    ltSixteen.out === 1;
    
    // 计算nullifier以防止重复投票
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== privVoterSecret;
    nullifierHasher.inputs[1] <== privVoteOption;
    nullifierHasher.out === pubNullifier;
    
    // 添加对投票选项的承诺（可选）
    // 这可以用来在投票结束后验证结果
    // signal output pubVoteCommitment;
    // component voteHasher = Poseidon(1);
    // voteHasher.inputs[0] <== privVoteOption;
    // pubVoteCommitment <== voteHasher.out;
}

component main {public [pubVoterCommitment, pubNullifier]} = Vote();