// 只读 RPC 核验升级版部署，默认 dry-run；不创建钱包、不签名。
//
//   node scripts/verify-upgrade-deployment.mjs <RPC> <地址> <交易> <治理地址.json> <阈值> [预期部署地址]
//   ... --write                 写入 upgrade/config.json 并登记证据
//   ... --artifact <路径>       指定用于比对的编译产物（复核 2026-11-07 的 v1 部署时用
//                               deployment/upgrade-sepolia/artifact.json）
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {AbiCoder, keccak256, isAddress} from 'ethers';
import {recordEvidence, uniqueEvidenceName, writeTestOutput} from './evidence.mjs';

const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a) && a.toLowerCase() === b.toLowerCase();
const isQuantity = value => typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);

export function validateDeploymentTransaction({hash, address, receipt, tx, expectedDeployer}) {
  if (receipt?.status !== '0x1' || receipt.contractAddress?.toLowerCase() !== address.toLowerCase() || tx?.to !== null) throw new Error('不是该合约的成功创建交易');
  if (!sameHash(receipt.transactionHash, hash) || !sameHash(tx.hash, hash)) throw new Error('交易哈希与请求不匹配');
  if (!sameHash(tx.blockHash, receipt.blockHash) || !isQuantity(receipt.blockNumber) || !isQuantity(tx.blockNumber) || BigInt(tx.blockNumber) !== BigInt(receipt.blockNumber)) throw new Error('交易与回执的区块不匹配');
  if (tx.chainId != null && (!isQuantity(tx.chainId) || BigInt(tx.chainId) !== 11155111n)) throw new Error('交易链 ID 不是 Sepolia');
  if (!isAddress(tx.from ?? '')) throw new Error('交易发送者无效');
  const sender = tx.from.toLowerCase();
  if (receipt.from != null && receipt.from.toLowerCase() !== sender) throw new Error('交易与回执的发送者不匹配');
  if (expectedDeployer != null && (!isAddress(expectedDeployer) || expectedDeployer.toLowerCase() !== sender)) throw new Error('部署发送者与预期钱包不匹配');
  return sender;
}

export function classifyFinality(receipt, finalizedBlock) {
  if (!isQuantity(finalizedBlock?.number) || !sameHash(finalizedBlock?.hash, finalizedBlock?.hash)) return 'unknown';
  return BigInt(finalizedBlock.number) >= BigInt(receipt.blockNumber) ? 'finalized' : 'pending';
}

export async function verifyDeployment(rawArgs = process.argv.slice(2)) {
  const flags = new Set(rawArgs.filter(argument => argument.startsWith('--')));
  const artifactIndex = rawArgs.indexOf('--artifact');
  if (artifactIndex >= 0 && !rawArgs[artifactIndex + 1]) throw new Error('--artifact 缺少路径');
  const artifactPath = artifactIndex >= 0 ? rawArgs[artifactIndex + 1] : 'artifacts/ProofPassGoverned.json';
  const args = rawArgs.filter((argument, index) => !argument.startsWith('--') && index !== artifactIndex + 1);
  const [rpcUrl, addressInput, hash, ownersFile, thresholdInput, expectedDeployer] = args;
  const address = addressInput?.toLowerCase(), threshold = Number(thresholdInput);
  if (!/^https:\/\//.test(rpcUrl ?? '') || !isAddress(address ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(hash ?? '') || !ownersFile || (expectedDeployer != null && !isAddress(expectedDeployer))) {
    throw new Error('用法：node scripts/verify-upgrade-deployment.mjs https://RPC 合约地址 部署交易哈希 治理地址数组.json 阈值 [预期部署钱包地址] [--write] [--artifact 路径]');
  }
  const owners = JSON.parse(fs.readFileSync(ownersFile, 'utf8'));
  if (!Array.isArray(owners) || owners.length !== 3 || !owners.every(a => isAddress(a) && !/^0x0+$/.test(a)) || new Set(owners.map(a => a.toLowerCase())).size !== owners.length || !Number.isInteger(threshold) || threshold !== 2) {
    throw new Error('治理成员或阈值无效');
  }

  async function rpc(method, params = []) {
    const response = await fetch(rpcUrl, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('RPC HTTP ' + response.status);
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return result.result;
  }

  if (BigInt(await rpc('eth_chainId')) !== 11155111n) throw new Error('仅允许 Sepolia');
  const [receipt, tx, code] = await Promise.all([rpc('eth_getTransactionReceipt', [hash]), rpc('eth_getTransactionByHash', [hash]), rpc('eth_getCode', [address, 'latest'])]);
  const sender = validateDeploymentTransaction({hash, address, receipt, tx, expectedDeployer});
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!sameHash(block?.hash, receipt.blockHash) || !isQuantity(block?.number) || BigInt(block.number) !== BigInt(receipt.blockNumber)) throw new Error('部署区块不匹配');

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  if (code.toLowerCase() !== artifact.runtimeBytecode.toLowerCase()) throw new Error(`升级合约运行时代码不匹配（比对产物：${artifactPath}）`);
  const expected = artifact.bytecode + AbiCoder.defaultAbiCoder().encode(['address[]', 'uint8'], [owners, threshold]).slice(2);
  if (tx.input.toLowerCase() !== expected.toLowerCase()) throw new Error('构造参数、治理成员顺序或编译字节码不匹配');

  let finality;
  try {
    const finalizedBlock = await rpc('eth_getBlockByNumber', ['finalized', false]);
    finality = {status: classifyFinality(receipt, finalizedBlock), checkedAt: new Date().toISOString(), finalizedBlock};
    if (finality.status === 'unknown') finality.reason = 'RPC 未返回有效 finalized 区块';
  } catch (error) {
    finality = {status: 'unknown', checkedAt: new Date().toISOString(), reason: String(error.message).slice(0, 200)};
  }
  if (finality.status === 'finalized') {
    const canonical = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
    if (!sameHash(canonical?.hash, receipt.blockHash)) throw new Error('最终性复查时部署区块已变化');
  }

  console.log(`合约：${address}`);
  console.log(`部署交易：${hash.toLowerCase()}（区块 ${Number(BigInt(receipt.blockNumber))}，发送者 ${sender}）`);
  console.log(`运行时代码哈希：${keccak256(code)}`);
  console.log(`最终性：${finality.status}`);

  if (!flags.has('--write')) {
    console.log('');
    console.log('dry-run：核验通过，未写入任何文件。确认无误后加 --write 保存配置与证据。');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const config = {mode: 'testnet', chainId: 11155111, deploymentStatus: 'deployed', registryAddress: address, deploymentTxHash: hash.toLowerCase(), runtimeCodeHash: keccak256(code), rpcUrl};
  const configPath = 'upgrade/config.json';
  if (fs.existsSync(configPath)) {
    const backup = writeTestOutput(`upgrade-config-backup-${stamp}.json`, fs.readFileSync(configPath, 'utf8'));
    console.log(`已备份旧配置到 ${backup}`);
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  const draft = writeTestOutput('upgrade-sepolia-deployment.json', {
    at: new Date().toISOString(), ...config, governors: owners, threshold, sender,
    expectedDeployer: expectedDeployer?.toLowerCase() ?? null, receipt, tx, block, finality,
    artifact: artifactPath,
  });
  const evidenceName = uniqueEvidenceName('upgrade-sepolia-deployment.json');
  const saved = recordEvidence(draft, {as: evidenceName, note: `verify-upgrade-deployment.mjs 只读核验，区块 ${Number(BigInt(receipt.blockNumber))}，最终性 ${finality.status}`});
  console.log(`已写入 ${configPath}，并登记 evidence/${saved.name}。成功入块不等于最终确认。`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyDeployment();
