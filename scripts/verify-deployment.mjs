// 只读核验 Sepolia 部署，默认 dry-run。
//
//   node scripts/verify-deployment.mjs https://RPC 合约地址 部署交易哈希
//   node scripts/verify-deployment.mjs https://RPC 合约地址 部署交易哈希 --write
//
// 不带 --write 时不会改动任何文件；带 --write 时：
//   - chain/config.json 写入前把旧文件备份到 artifacts/test-output/；
//   - evidence/ 通过 scripts/evidence.mjs 登记，并更新 evidence/manifest.json；
//     同名证据已存在时自动改用带时间戳的新文件名，不覆盖历史证据。
// 本脚本只读 RPC：不创建钱包、不签名、不处理私钥。
import fs from 'node:fs';
import path from 'node:path';
import {keccak256, Interface} from 'ethers';
import {recordEvidence, uniqueEvidenceName, writeTestOutput} from './evidence.mjs';

const flags = new Set(process.argv.slice(2).filter(argument => argument.startsWith('--')));
const [rpcUrl, addressInput, hash] = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const address = addressInput?.toLowerCase();
if (!/^https:\/\//.test(rpcUrl ?? '') || !/^0x[0-9a-f]{40}$/.test(address ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(hash ?? '')) {
  throw new Error('用法：node scripts/verify-deployment.mjs https://RPC 合约地址 部署交易哈希 [--write]');
}

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('RPC HTTP ' + response.status);
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

const chainId = Number(BigInt(await rpc('eth_chainId')));
if (chainId !== 11155111) throw new Error('仅允许 Sepolia');

const receipt = await rpc('eth_getTransactionReceipt', [hash]);
if (receipt?.status !== '0x1' || receipt.contractAddress?.toLowerCase() !== address) throw new Error('部署回执不匹配');
const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
if (block?.hash !== receipt.blockHash) throw new Error('部署区块不可验证');

const artifact = JSON.parse(fs.readFileSync('artifacts/ProofPassRegistry.json'));
const code = await rpc('eth_getCode', [address, 'latest']);
if (code.toLowerCase() !== artifact.runtimeBytecode.toLowerCase()) {
  throw new Error('运行时代码与本地编译结果不一致，请核对编译器、文件名和优化设置');
}

const abi = new Interface(artifact.abi);
const [admin] = abi.decodeFunctionResult('admin', await rpc('eth_call', [{to: address, data: abi.encodeFunctionData('admin', [])}, 'latest']));
const codeHash = keccak256(code);

console.log(`链 ID：${chainId}`);
console.log(`合约：${address}`);
console.log(`部署交易：${hash.toLowerCase()}（区块 ${Number(BigInt(receipt.blockNumber))}，status=${receipt.status}）`);
console.log(`运行时代码哈希：${codeHash}`);
console.log(`管理员：${admin}`);

if (!flags.has('--write')) {
  console.log('');
  console.log('dry-run：核验通过，未写入任何文件。确认无误后加 --write 保存配置与证据。');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const configPath = 'chain/config.json';
if (fs.existsSync(configPath)) {
  const backup = writeTestOutput(`config-backup-${stamp}.json`, fs.readFileSync(configPath, 'utf8'));
  console.log(`已备份旧配置到 ${backup}`);
}
const config = {
  ...JSON.parse(fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '{}'),
  rpcUrl,
  registryAddress: address,
  deploymentTxHash: hash.toLowerCase(),
  runtimeCodeHash: codeHash,
  deploymentStatus: 'deployed',
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

const evidenceDraft = writeTestOutput('sepolia-deployment.json', {
  at: new Date().toISOString(),
  chainId,
  registryAddress: address,
  admin,
  receipt,
  block,
  codeHash,
});
const evidenceName = uniqueEvidenceName('sepolia-deployment.json');
const saved = recordEvidence(evidenceDraft, {
  as: evidenceName,
  note: `verify-deployment.mjs 只读核验，区块 ${Number(BigInt(receipt.blockNumber))}`,
});
console.log(`已写入 ${configPath}，并登记 evidence/${saved.name}（sha256 ${saved.sha256.slice(0, 16)}…）。`);
