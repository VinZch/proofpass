// Read-only Sepolia evidence capture. No wallet, signing, or send-transaction methods.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Interface, keccak256 } from 'ethers';
import { validatePackage, commitment, ZERO } from '../upgrade/protocol.js';
const lower = (value) => value?.toLowerCase();
const same = (actual, expected, message) => assert.equal(lower(actual), lower(expected), message);

export function validateCredentialTransaction({
  stage,
  p,
  digest,
  hash,
  config,
  tx,
  receipt,
  receiptBlock,
  abi,
}) {
  assert(['issue', 'correct'].includes(stage), '阶段必须为 issue 或 correct');
  assert.equal(receipt?.status, '0x1', '回执未成功');
  same(tx?.hash, hash, '交易哈希不匹配');
  same(receipt.transactionHash, hash, '回执哈希不匹配');
  same(tx.from, p.issuer, '交易发送者不匹配');
  same(receipt.from, p.issuer, '回执发送者不匹配');
  same(tx.to, config.registryAddress, '交易合约不匹配');
  same(receipt.to, config.registryAddress, '回执合约不匹配');
  same(tx.blockHash, receipt.blockHash, '交易区块哈希不匹配');
  same(receiptBlock.hash, receipt.blockHash, '部署链上区块已变化');
  assert.equal(BigInt(tx.blockNumber), BigInt(receipt.blockNumber));
  assert.equal(BigInt(receiptBlock.number), BigInt(receipt.blockNumber));
  if (tx.chainId != null) assert.equal(BigInt(tx.chainId), 11155111n, '交易不是 Sepolia');
  assert.equal(BigInt(tx.value), 0n, 'value 必须为 0');
  const parsed = abi.parseTransaction({ data: tx.input, value: tx.value });
  assert.equal(parsed?.name, stage, '调用方法不匹配');
  let reasonHash = ZERO;
  if (stage === 'issue') assert.equal(p.previousId, ZERO, '首次签发不应有前版');
  else {
    assert.notEqual(p.previousId, ZERO, '更正缺少前版');
    reasonHash = parsed.args[5];
    assert.notEqual(reasonHash, ZERO, '更正原因摘要为空');
    assert.notEqual(p.previousId, p.credentialId, '新旧编号不能相同');
  }
  const args =
    stage === 'issue'
      ? [p.institution, p.credentialId, digest, p.validUntil]
      : [p.institution, p.previousId, p.credentialId, digest, p.validUntil, reasonHash];
  same(tx.input, abi.encodeFunctionData(stage, args), 'ABI 参数与凭证包不匹配');
  const logs = receipt.logs.filter((log) => lower(log.address) === lower(config.registryAddress));
  const event = (name) => {
    const found = logs.filter((log) => sameTopic(log.topics[0], abi.getEvent(name).topicHash));
    assert.equal(found.length, 1, name + ' 事件数量不符');
    return abi.parseLog(found[0]).args;
  };
  const issued = event('Issued');
  same(issued[0], p.institution);
  same(issued[1], p.credentialId);
  same(issued[2], p.issuer);
  same(issued[3], digest);
  if (stage === 'correct') {
    const revoked = event('Revoked');
    same(revoked[0], p.institution);
    same(revoked[1], p.previousId);
    assert.equal(revoked[2], 2n);
    same(revoked[3], reasonHash);
    const corrected = event('Corrected');
    same(corrected[0], p.institution);
    same(corrected[1], p.previousId);
    same(corrected[2], p.credentialId);
  }
  return { reasonHash, logs };
}
const sameTopic = (a, b) => lower(a) === lower(b);
export function validateRecordSnapshot({
  stage,
  p,
  digest,
  reasonHash,
  record,
  oldRecord,
  institution,
  block,
  receiptBlock,
}) {
  same(record.commitment, digest);
  same(record.issuedBy, p.issuer);
  assert.equal(record.validUntil, BigInt(p.validUntil));
  assert.equal(record.keyEpoch, BigInt(p.keyEpoch));
  same(record.previousId, p.previousId);
  assert.equal(record.registeredAt, BigInt(receiptBlock.timestamp));
  assert.equal(record.revocationKind, 0n, '新版凭证已撤销');
  assert.equal(record.revokedAt, 0n);
  same(record.replacedBy, ZERO);
  same(record.reasonHash, ZERO);
  assert(record.validUntil > BigInt(block.timestamp), '新版凭证已过期');
  same(institution.key, p.issuer, '当前机构密钥与签发者不符');
  assert.equal(institution.epoch, BigInt(p.keyEpoch));
  assert.equal(institution.enabled, true);
  if (stage === 'correct') {
    assert(oldRecord);
    assert.notEqual(oldRecord.commitment, ZERO);
    assert.equal(oldRecord.revocationKind, 2n);
    same(oldRecord.replacedBy, p.credentialId);
    same(record.previousId, p.previousId);
    same(oldRecord.reasonHash, reasonHash);
    assert.equal(oldRecord.revokedAt, BigInt(receiptBlock.timestamp));
  }
}
const recordFields = [
  'commitment',
  'registeredAt',
  'validUntil',
  'issuedBy',
  'keyEpoch',
  'previousId',
  'replacedBy',
  'revokedAt',
  'revocationKind',
  'reasonHash',
];
const plainRecord = (r) => Object.fromEntries(recordFields.map((name) => [name, r[name]]));
export async function verifyCredential(args = process.argv.slice(2)) {
  const [stage, packagePath, hash, outputPath] = args;
  assert(
    ['issue', 'correct'].includes(stage) && packagePath && /^0x[0-9a-fA-F]{64}$/.test(hash ?? ''),
    '用法：node scripts/verify-upgrade-credential.mjs issue|correct 凭证包.json 交易哈希 [证据输出.json]',
  );
  const config = JSON.parse(fs.readFileSync('upgrade/config.json', 'utf8'));
  assert.equal(config.mode, 'testnet');
  assert.equal(config.chainId, 11155111);
  assert.equal(config.deploymentStatus, 'deployed');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const p = validatePackage(pkg, config),
    digest = await commitment(pkg, config);
  const abi = new Interface(JSON.parse(fs.readFileSync('upgrade/abi.json', 'utf8')));
  let id = 0;
  async function rpc(method, params = []) {
    assert(
      [
        'eth_chainId',
        'eth_getTransactionByHash',
        'eth_getTransactionReceipt',
        'eth_getBlockByNumber',
        'eth_getCode',
        'eth_call',
      ].includes(method),
    );
    const response = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error('RPC HTTP ' + response.status);
    const r = await response.json();
    if (r.error) throw Error(JSON.stringify(r.error));
    return r.result;
  }
  assert.equal(BigInt(await rpc('eth_chainId')), 11155111n);
  const [tx, receipt] = await Promise.all([
    rpc('eth_getTransactionByHash', [hash]),
    rpc('eth_getTransactionReceipt', [hash]),
  ]);
  assert(receipt, '交易尚未入块，稍后重试');
  // Capture historical post-transaction state so later corrections do not invalidate
  // a repeat audit of issuance. This snapshot is not a claim about current validity.
  const receiptBlock = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  const block = receiptBlock;
  same(
    keccak256(await rpc('eth_getCode', [config.registryAddress, block.number])),
    config.runtimeCodeHash,
    '合约代码哈希不符',
  );
  const { reasonHash, logs } = validateCredentialTransaction({
    stage,
    p,
    digest,
    hash,
    config,
    tx,
    receipt,
    receiptBlock,
    abi,
  });
  const calls = [];
  async function call(name, params) {
    const request = { to: config.registryAddress, data: abi.encodeFunctionData(name, params) };
    const result = await rpc('eth_call', [request, block.number]);
    calls.push({ method: 'eth_call', ...request, blockTag: block.number, result });
    return abi.decodeFunctionResult(name, result);
  }
  const [recordResult, institution, oldResult] = await Promise.all([
    call('getRecord', [p.institution, p.credentialId]),
    call('institutions', [p.institution]),
    stage === 'correct' ? call('getRecord', [p.institution, p.previousId]) : null,
  ]);
  const record = recordResult[0],
    oldRecord = oldResult?.[0];
  validateRecordSnapshot({
    stage,
    p,
    digest,
    reasonHash,
    record,
    oldRecord,
    institution,
    block,
    receiptBlock,
  });
  const [canonical, canonicalReceiptBlock] = await Promise.all([
    rpc('eth_getBlockByNumber', [block.number, false]),
    rpc('eth_getBlockByNumber', [receipt.blockNumber, false]),
  ]);
  same(canonical.hash, block.hash, '查询快照发生重组');
  same(canonicalReceiptBlock.hash, receipt.blockHash, '交易区块发生重组');
  let finality;
  try {
    const f = await rpc('eth_getBlockByNumber', ['finalized', false]);
    finality = {
      status: f?.number
        ? BigInt(f.number) >= BigInt(receipt.blockNumber)
          ? 'finalized'
          : 'pending'
        : 'unknown',
      checkedAt: new Date().toISOString(),
      blockNumber: f?.number ?? null,
      blockHash: f?.hash ?? null,
    };
  } catch (error) {
    finality = { status: 'unknown', checkedAt: new Date().toISOString(), reason: error.message };
  }
  const evidence = {
    at: new Date().toISOString(),
    stage,
    network: 'Sepolia',
    chainId: 11155111,
    registryAddress: config.registryAddress,
    passed: true,
    packageSource: packagePath,
    payload: p,
    commitment: digest,
    reasonHash,
    tx,
    receipt,
    receiptBlock,
    block,
    blockTag: block.number,
    snapshotScope: 'receipt-block historical state; not current credential validity',
    calls,
    events: logs,
    record: plainRecord(record),
    oldRecord: oldRecord ? plainRecord(oldRecord) : null,
    institution: {
      key: institution.key,
      epoch: institution.epoch,
      revision: institution.revision,
      enabled: institution.enabled,
    },
    canonicalBlocksRechecked: true,
    finality,
    limitations:
      'Real testnet transaction and historical technical credential check only; current validity, holder identity and school approval unverified.',
  };
  const output =
    outputPath ?? 'evidence/upgrade-sepolia-' + stage + '-' + hash.toLowerCase().slice(2) + '.json';
  fs.writeFileSync(
    output,
    JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n',
  );
  console.log(
    JSON.stringify({
      passed: true,
      stage,
      output,
      transactionHash: hash,
      receiptBlock: Number(BigInt(receipt.blockNumber)),
      snapshotBlock: Number(BigInt(block.number)),
      credentialId: p.credentialId,
      previousId: p.previousId,
      finality: finality.status,
    }),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyCredential();
