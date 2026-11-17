// Read-only fixed-block audit of execute(4); never signs or sends transactions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Interface, keccak256, toBeHex } from 'ethers';
import { ZERO, verifyPackage } from '../upgrade/protocol.js';
import { validateGovernanceEnvelope } from './verify-upgrade-governance.mjs';
const same = (a, b, message) => assert.equal(a.toLowerCase(), b.toLowerCase(), message);
const fields = [
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
const plainRecord = (r) =>
  Object.fromEntries(
    fields.map((k) => [k, typeof r[k] === 'bigint' ? r[k].toString() : r[k].toLowerCase()]),
  );
export function validateEmergencyRecordChanges({ recordChecks, targetId, reasonHash, executedAt }) {
  assert.equal(recordChecks.length, 3, 'three credential records required');
  assert.equal(
    new Set(recordChecks.map((r) => r.credentialId.toLowerCase())).size,
    3,
    'duplicate credential id',
  );
  const target = recordChecks.find((r) => r.credentialId.toLowerCase() === targetId.toLowerCase());
  assert(target, 'target credential absent');
  for (const item of recordChecks) {
    if (item !== target) {
      assert.deepEqual(item.after, item.before, 'non-target credential changed');
      continue;
    }
    assert.notEqual(item.before.commitment, ZERO, 'target missing');
    assert.equal(BigInt(item.before.revocationKind), 0n, 'target already revoked');
    assert.equal(BigInt(item.after.revocationKind), 3n, 'emergency revoke kind must be 3');
    assert.equal(BigInt(item.after.revokedAt), BigInt(executedAt), 'revocation timestamp');
    same(item.after.reasonHash, reasonHash, 'revocation reason');
    for (const field of fields.filter(
      (k) => !['revokedAt', 'revocationKind', 'reasonHash'].includes(k),
    ))
      assert.equal(item.after[field], item.before[field], 'target changed ' + field);
  }
}
export async function auditEmergencyRevoke(argv = process.argv.slice(2)) {
  const [executionHash] = argv;
  assert(
    /^0x[0-9a-fA-F]{64}$/.test(executionHash ?? ''),
    'usage: node scripts/audit-upgrade-emergency-revoke.mjs executionTransactionHash',
  );
  const config = JSON.parse(fs.readFileSync('upgrade/config.json', 'utf8')),
    expected = JSON.parse(
      fs.readFileSync('deployment/upgrade-sepolia/emergency-revoke-expected.json', 'utf8'),
    );
  const abi = new Interface(JSON.parse(fs.readFileSync('upgrade/abi.json', 'utf8')));
  assert.equal(config.chainId, 11155111);
  assert.equal(config.mode, 'testnet');
  assert.equal(expected.action, 3);
  let rpcId = 0;
  const requests = [];
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
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: AbortSignal.timeout(20000),
    });
    assert(response.ok);
    const result = await response.json();
    requests.push({ method, params, response: result });
    if (result.error) throw Error(JSON.stringify(result.error));
    return result.result;
  }
  assert.equal(BigInt(await rpc('eth_chainId')), 11155111n);
  const [tx, receipt] = await Promise.all([
    rpc('eth_getTransactionByHash', [executionHash]),
    rpc('eth_getTransactionReceipt', [executionHash]),
  ]);
  assert.equal(receipt?.status, '0x1');
  const tag = receipt.blockNumber,
    beforeTag = toBeHex(BigInt(tag) - 1n),
    [block, beforeBlock] = await Promise.all([
      rpc('eth_getBlockByNumber', [tag, false]),
      rpc('eth_getBlockByNumber', [beforeTag, false]),
    ]);
  validateGovernanceEnvelope({
    hash: executionHash,
    tx,
    receipt,
    block,
    registry: config.registryAddress,
    abi,
    name: 'execute',
    args: [4],
  });
  same(tx.from, expected.executor);
  same(keccak256(await rpc('eth_getCode', [config.registryAddress, tag])), config.runtimeCodeHash);
  async function call(name, args, at = tag) {
    return abi.decodeFunctionResult(
      name,
      await rpc('eth_call', [
        { to: config.registryAddress, data: abi.encodeFunctionData(name, args) },
        at,
      ]),
    );
  }
  const institutionId = expected.institution,
    [beforeOrg, org, proposal] = await Promise.all([
      call('institutions', [institutionId], beforeTag),
      call('institutions', [institutionId]),
      call('proposals', [4]),
    ]);
  assert.equal(beforeOrg.enabled, false);
  assert.equal(org.enabled, false);
  same(org.key, beforeOrg.key);
  assert.equal(org.epoch, 2n);
  assert.equal(org.epoch, beforeOrg.epoch);
  assert.equal(org.revision, beforeOrg.revision + 1n);
  assert.equal(proposal.action, 3n);
  assert.equal(proposal.executed, true);
  assert.equal(proposal.approvals, 2n);
  assert.equal(proposal.revision, beforeOrg.revision);
  same(proposal.institution, institutionId);
  same(proposal.credentialId, expected.credentialId);
  same(proposal.reasonHash, expected.reasonHash);
  const logs = receipt.logs.filter(
    (l) => l.address.toLowerCase() === config.registryAddress.toLowerCase(),
  );
  const event = (name) => {
    const matching = logs.filter(
      (l) => l.topics[0].toLowerCase() === abi.getEvent(name).topicHash.toLowerCase(),
    );
    assert.equal(matching.length, 1, name + ' event count');
    return abi.parseLog(matching[0]).args;
  };
  assert.equal(event('Executed')[0], 4n);
  const changed = event('InstitutionChanged');
  same(changed[0], institutionId);
  same(changed[1], org.key);
  assert.equal(changed[2], 2n);
  assert.equal(changed[3], false);
  const revoked = event('Revoked');
  same(revoked[0], institutionId);
  same(revoked[1], expected.credentialId);
  assert.equal(revoked[2], 3n);
  same(revoked[3], expected.reasonHash);
  const packagePaths = [
    'evidence/upgrade-sepolia-original-package.json',
    'evidence/upgrade-sepolia-corrected-package.json',
    'evidence/upgrade-sepolia-key2-package.json',
  ];
  const recordChecks = [];
  for (const path of packagePaths) {
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
    same(pkg.payload.institution, institutionId);
    const [[before], [after]] = await Promise.all([
      call('getRecord', [institutionId, pkg.payload.credentialId], beforeTag),
      call('getRecord', [institutionId, pkg.payload.credentialId]),
    ]);
    recordChecks.push({
      path,
      credentialId: pkg.payload.credentialId,
      before: plainRecord(before),
      after: plainRecord(after),
    });
  }
  same(recordChecks[1].credentialId, expected.credentialId);
  validateEmergencyRecordChanges({
    recordChecks,
    targetId: expected.credentialId,
    reasonHash: expected.reasonHash,
    executedAt: block.timestamp,
  });
  same(recordChecks[0].after.replacedBy, expected.credentialId);
  same(recordChecks[1].after.previousId, recordChecks[0].credentialId);
  const numericFields = new Set([
    'registeredAt',
    'validUntil',
    'keyEpoch',
    'revokedAt',
    'revocationKind',
  ]);
  const institution = {
    key: org.key.toLowerCase(),
    epoch: Number(org.epoch),
    revision: Number(org.revision),
    enabled: org.enabled,
  };
  const adapter = {
    async snapshot(id, credentialId) {
      same(id, institutionId);
      const record = recordChecks.find((x) => x.credentialId === credentialId)?.after;
      assert(record);
      return {
        record: Object.fromEntries(
          Object.entries(record).map(([k, v]) => [k, numericFields.has(k) ? Number(v) : v]),
        ),
        institution,
        query: {
          mode: 'testnet',
          chainId: 11155111,
          registryAddress: config.registryAddress,
          blockNumber: Number(BigInt(tag)),
          blockHash: block.hash,
          blockTimestamp: Number(BigInt(block.timestamp)),
          at: new Date().toISOString(),
          scope: 'fixed historical emergency-revoke receipt block',
        },
      };
    },
  };
  const packageChecks = [],
    statuses = ['已被更正版替代', '已紧急撤销', '有效'];
  for (let i = 0; i < packagePaths.length; i++) {
    const pkg = JSON.parse(fs.readFileSync(packagePaths[i], 'utf8')),
      report = await verifyPackage(pkg, adapter, config);
    assert.equal(report.integrity, true);
    assert.equal(report.institutionEnabled, false);
    assert.equal(report.status, statuses[i]);
    assert.equal(report.technicalPass, i === 2);
    packageChecks.push({ path: packagePaths[i], report, passed: true });
  }
  for (const b of [beforeBlock, block])
    same(
      (await rpc('eth_getBlockByNumber', [b.number, false])).hash,
      b.hash,
      'canonical block changed',
    );
  const evidence = {
    at: new Date().toISOString(),
    passed: true,
    chainId: 11155111,
    registryAddress: config.registryAddress,
    rpcSource: config.rpcUrl,
    executionTransactionHash: executionHash,
    expected,
    tx,
    receipt,
    block,
    blockTag: tag,
    beforeBlock,
    beforeBlockTag: beforeTag,
    beforeInstitution: {
      key: beforeOrg.key,
      epoch: beforeOrg.epoch,
      revision: beforeOrg.revision,
      enabled: beforeOrg.enabled,
    },
    institution,
    recordChecks,
    packageChecks,
    requests,
    canonicalBlocksRechecked: true,
    finalityNotChecked: true,
    limitations:
      'Read-only validation of a previously user-confirmed transaction. Only the specified corrected credential is emergency-revoked; other credentials remain unchanged. Historical end-of-block snapshot, not current validity or real identity/school approval. Finality is recorded separately in governance execution evidence.',
  };
  const output = 'evidence/upgrade-sepolia-emergency-revoke-audit.json';
  fs.writeFileSync(
    output,
    JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n',
  );
  console.log(
    JSON.stringify({
      passed: true,
      output,
      snapshotBlock: Number(BigInt(tag)),
      enabled: org.enabled,
      epoch: Number(org.epoch),
      revision: Number(org.revision),
      recordChecks: recordChecks.length,
      packageStatuses: packageChecks.map((x) => x.report.status),
    }),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await auditEmergencyRevoke();
