// 守护两件事：
// 1. 冻结在 deployment/ 下的 v1 源码 + 编译输入，必须能复现出已部署的字节码；
// 2. 当前源码 ABI 必须是已部署 ABI 的超集（只新增，不改签名/返回结构），
//    否则线上 UI 连 v1 合约会解码失败。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import solc from 'solc';

const frozen = [
  {
    name: 'ProofPassRegistry',
    input: 'deployment/sepolia-registry/compiler-input.json',
    artifact: 'deployment/sepolia-registry/ProofPassRegistry.deployed.json',
    current: 'artifacts/ProofPassRegistry.json',
  },
  {
    name: 'ProofPassGoverned',
    input: 'deployment/upgrade-sepolia/compiler-input.json',
    artifact: 'deployment/upgrade-sepolia/artifact.json',
    current: 'artifacts/ProofPassGoverned.json',
  },
];

test('冻结的 v1 部署材料可复现出已部署字节码', () => {
  for (const entry of frozen) {
    const input = JSON.parse(fs.readFileSync(entry.input, 'utf8'));
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const errors = (output.errors ?? []).filter((error) => error.severity === 'error');
    assert.deepEqual(errors, [], `${entry.name} 冻结编译输入无法编译`);
    const compiled = output.contracts[`${entry.name}.sol`][entry.name];
    const deployed = JSON.parse(fs.readFileSync(entry.artifact, 'utf8'));
    assert.equal(
      '0x' + compiled.evm.bytecode.object,
      deployed.bytecode,
      `${entry.name} 创建字节码与冻结产物不一致`,
    );
    assert.equal(
      '0x' + compiled.evm.deployedBytecode.object,
      deployed.runtimeBytecode,
      `${entry.name} 运行时代码与冻结产物不一致`,
    );
  }
});

test('当前源码 ABI 与已部署 ABI 向后兼容（只新增，不改签名）', () => {
  const key = (entry) =>
    `${entry.type}:${entry.name ?? ''}(${(entry.inputs ?? []).map((input) => input.type).join(',')})->${(entry.outputs ?? []).map((output) => output.type).join(',')}`;
  for (const entry of frozen) {
    const deployedAbi = JSON.parse(fs.readFileSync(entry.artifact, 'utf8')).abi;
    const currentAbi = JSON.parse(fs.readFileSync(entry.current, 'utf8')).abi;
    const deployedByKey = new Map(deployedAbi.map((item) => [key(item), JSON.stringify(item)]));
    const currentByKey = new Map(currentAbi.map((item) => [key(item), JSON.stringify(item)]));
    for (const [signature, definition] of deployedByKey) {
      assert.equal(
        currentByKey.get(signature),
        definition,
        `${entry.name} 改动了已部署的接口：${signature}`,
      );
    }
  }
});
