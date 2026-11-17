// 一致性检查：当前源码、artifacts、ABI、冻结的已部署材料、配置里的 runtimeCodeHash。
// 只读本地文件，不访问网络。用法：npm run check:artifacts
import fs from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';

const problems = [];
const results = [];
const check = (label, condition, detail = '') => {
  results.push({ label, ok: Boolean(condition), detail });
  if (!condition) problems.push(`${label}${detail ? '：' + detail : ''}`);
};

function compile(inputPath) {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((error) => error.severity === 'error');
  if (errors.length)
    throw new Error(
      `${inputPath} 编译失败：\n${errors.map((error) => error.formattedMessage).join('\n')}`,
    );
  const sourceName = Object.keys(input.sources)[0];
  const contractName = sourceName.replace(/\.sol$/, '');
  const contract = output.contracts[sourceName]?.[contractName];
  if (!contract) throw new Error(`${inputPath} 未产出 ${contractName}`);
  return { contract, contractName };
}

const targets = [
  {
    name: 'ProofPassRegistry',
    input: 'artifacts/compiler-input.json',
    artifact: 'artifacts/ProofPassRegistry.json',
    abi: 'chain/abi.json',
    frozenInput: 'deployment/sepolia-registry/compiler-input.json',
    frozenArtifact: 'deployment/sepolia-registry/ProofPassRegistry.deployed.json',
    config: 'chain/config.json',
  },
  {
    name: 'ProofPassGoverned',
    input: 'artifacts/governed-compiler-input.json',
    artifact: 'artifacts/ProofPassGoverned.json',
    abi: 'upgrade/abi.json',
    frozenInput: 'deployment/upgrade-sepolia/compiler-input.json',
    frozenArtifact: 'deployment/upgrade-sepolia/artifact.json',
    config: 'upgrade/config.json',
  },
];

for (const target of targets) {
  const { contract } = compile(target.input);
  const compiledBytecode = '0x' + contract.evm.bytecode.object;
  const compiledRuntime = '0x' + contract.evm.deployedBytecode.object;
  const artifact = JSON.parse(fs.readFileSync(target.artifact, 'utf8'));
  check(`${target.artifact} 创建字节码与源码一致`, artifact.bytecode === compiledBytecode);
  check(`${target.artifact} 运行时代码与源码一致`, artifact.runtimeBytecode === compiledRuntime);
  check(
    `${target.artifact} ABI 与源码一致`,
    JSON.stringify(artifact.abi) === JSON.stringify(contract.abi),
  );

  const abi = JSON.parse(fs.readFileSync(target.abi, 'utf8'));
  check(`${target.abi} 与 artifacts 同步`, JSON.stringify(abi) === JSON.stringify(artifact.abi));

  const { contract: frozenContract } = compile(target.frozenInput);
  const frozen = JSON.parse(fs.readFileSync(target.frozenArtifact, 'utf8'));
  check(
    `${target.frozenArtifact} 冻结源码可复现创建字节码`,
    frozen.bytecode === '0x' + frozenContract.evm.bytecode.object,
  );
  check(
    `${target.frozenArtifact} 冻结源码可复现运行时代码`,
    frozen.runtimeBytecode === '0x' + frozenContract.evm.deployedBytecode.object,
  );

  const config = JSON.parse(fs.readFileSync(target.config, 'utf8'));
  check(
    `${target.config} runtimeCodeHash 指向已部署字节码`,
    config.runtimeCodeHash === keccak256(frozen.runtimeBytecode),
    `配置 ${config.runtimeCodeHash}，冻结 ${keccak256(frozen.runtimeBytecode)}`,
  );
}

for (const result of results) console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${result.label}`);
if (problems.length) {
  console.error(
    `\n共 ${problems.length} 项不一致。修复后重新运行 npm run compile / npm run compile:upgrade。`,
  );
  process.exitCode = 1;
} else {
  console.log('\n全部一致：源码、artifacts、ABI、冻结的已部署材料与配置哈希。');
}
