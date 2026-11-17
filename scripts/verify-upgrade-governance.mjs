// Read-only Sepolia governance audit. No wallet, signing, or transaction submission.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  Interface,
  AbiCoder,
  keccak256,
  toBeHex,
  zeroPadValue,
  ZeroAddress,
  ZeroHash,
} from 'ethers';
const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : v);
const same = (a, b, message) => assert.equal(lower(a), lower(b), message);
const actions = ['Register', 'Rotate', 'SetEnabled', 'EmergencyRevoke'];
const proposalFields = [
  'action',
  'institution',
  'key',
  'enabled',
  'credentialId',
  'reasonHash',
  'revision',
  'deadline',
  'approvals',
  'executed',
  'cancelled',
];
const institutionFields = ['key', 'epoch', 'revision', 'enabled'];
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
const plain = (value, fields) => Object.fromEntries(fields.map((k) => [k, value[k]]));
const equalInstitution = (a, b) =>
  institutionFields.forEach((k) => same(a[k], b[k], 'institution ' + k));
export function validateGovernanceTransition({
  proposal: p,
  before,
  after,
  previousKeyMapping,
  newKeyMapping,
  previousRecord,
  record,
  executedAt,
}) {
  assert(p.action >= 0n && p.action <= 3n, 'unknown governance action');
  assert.equal(
    before.revision,
    p.revision,
    'proposal revision differs from pre-execution institution',
  );
  if (!p.executed) {
    equalInstitution(after, before);
    if (p.action <= 1n) same(newKeyMapping, ZeroHash, 'pending key already used');
    if (lower(before.key) !== lower(ZeroAddress))
      same(previousKeyMapping, p.institution, 'current key mapping');
    return;
  }
  assert.equal(after.revision, before.revision + 1n, 'execution must increment revision once');
  if (p.action <= 1n) {
    same(after.key, p.key);
    assert.equal(after.epoch, before.epoch + 1n);
    assert.equal(
      after.enabled,
      p.action === 0n ? true : before.enabled,
      'rotation must preserve enabled status',
    );
    same(newKeyMapping, p.institution, 'new key mapping');
    if (p.action === 1n)
      same(previousKeyMapping, p.institution, 'retired key mapping must remain reserved');
  } else {
    same(after.key, before.key);
    assert.equal(after.epoch, before.epoch);
    assert.equal(after.enabled, p.action === 2n ? p.enabled : before.enabled);
    same(previousKeyMapping, p.institution, 'current key mapping');
  }
  if (p.action === 3n) {
    assert(previousRecord && record, 'emergency revoke records missing');
    assert.notEqual(previousRecord.commitment, ZeroHash);
    assert.equal(previousRecord.revocationKind, 0n);
    assert.equal(record.revocationKind, 3n);
    same(record.reasonHash, p.reasonHash);
    assert.equal(record.revokedAt, BigInt(executedAt));
    for (const field of recordFields.filter(
      (f) => !['revocationKind', 'revokedAt', 'reasonHash'].includes(f),
    ))
      same(record[field], previousRecord[field], 'emergency revoke changed ' + field);
  }
}
export function validateGovernanceEnvelope({
  hash,
  tx,
  receipt,
  block,
  registry,
  abi,
  name,
  args,
}) {
  assert.equal(receipt?.status, '0x1', 'transaction failed or missing');
  same(tx?.hash, hash);
  same(receipt.transactionHash, hash);
  same(tx.to, registry);
  same(receipt.to, registry);
  same(tx.from, receipt.from);
  assert.equal(BigInt(tx.value), 0n);
  if (tx.chainId != null) assert.equal(BigInt(tx.chainId), 11155111n);
  same(tx.blockHash, receipt.blockHash);
  same(block.hash, receipt.blockHash);
  assert.equal(BigInt(tx.blockNumber), BigInt(receipt.blockNumber));
  assert.equal(BigInt(block.number), BigInt(receipt.blockNumber));
  same(tx.input, abi.encodeFunctionData(name, args), 'governance calldata mismatch');
}
export function validateGovernanceExpectations({
  expected,
  proposal: p,
  proposalId,
  proposer,
  executor,
}) {
  if (!expected) return;
  for (const k of ['institution', 'key', 'enabled', 'credentialId', 'reasonHash'])
    if (k in expected) same(p[k], expected[k], 'expected ' + k);
  if ('action' in expected)
    assert.equal(
      p.action,
      typeof expected.action === 'string' && actions.includes(expected.action)
        ? BigInt(actions.indexOf(expected.action))
        : BigInt(expected.action),
    );
  if ('proposalId' in expected) assert.equal(proposalId, BigInt(expected.proposalId));
  if ('proposer' in expected) same(proposer, expected.proposer);
  if (p.executed && 'executor' in expected) same(executor, expected.executor, 'expected executor');
}
export function mayOmitProposalHistory(error, executed) {
  return executed === true && /historical state .* is not available/i.test(error?.message ?? '');
}
export async function verifyGovernance(argv = process.argv.slice(2)) {
  const [idText, snapshotRef, outputPath, expectationPath] = argv;
  assert(
    /^\d+$/.test(idText ?? '') && BigInt(idText) > 0n && snapshotRef,
    'usage: node scripts/verify-upgrade-governance.mjs proposalId txHash|fixedBlock [output.json] [expected.json]',
  );
  const proposalId = BigInt(idText),
    config = JSON.parse(fs.readFileSync('upgrade/config.json', 'utf8'));
  assert.equal(config.chainId, 11155111);
  assert.equal(config.mode, 'testnet');
  assert.equal(config.deploymentStatus, 'deployed');
  const abi = new Interface(JSON.parse(fs.readFileSync('upgrade/abi.json', 'utf8'))),
    expected = expectationPath ? JSON.parse(fs.readFileSync(expectationPath, 'utf8')) : null;
  let rpcId = 0;
  const calls = [];
  async function raw(method, params = []) {
    assert(
      [
        'eth_chainId',
        'eth_getTransactionByHash',
        'eth_getTransactionReceipt',
        'eth_getBlockByNumber',
        'eth_getLogs',
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
    assert(response.ok, 'RPC HTTP ' + response.status);
    return response.json();
  }
  async function rpc(method, params = []) {
    const r = await raw(method, params);
    if (r.error) throw Error(JSON.stringify(r.error));
    return r.result;
  }
  assert.equal(BigInt(await rpc('eth_chainId')), 11155111n);
  let anchorReceipt = null;
  if (/^0x[0-9a-fA-F]{64}$/.test(snapshotRef)) {
    anchorReceipt = await rpc('eth_getTransactionReceipt', [snapshotRef]);
    assert(anchorReceipt, 'anchor transaction not mined');
    same(anchorReceipt.transactionHash, snapshotRef);
    assert.equal(anchorReceipt.status, '0x1');
    same(anchorReceipt.to, config.registryAddress);
  } else
    assert(
      /^(?:0x[0-9a-fA-F]+|\d+)$/.test(snapshotRef),
      'use fixed block or transaction hash; latest is not accepted',
    );
  const block = await rpc('eth_getBlockByNumber', [
    anchorReceipt?.blockNumber ?? toBeHex(BigInt(snapshotRef)),
    false,
  ]);
  assert(block, 'snapshot block missing');
  if (anchorReceipt) same(block.hash, anchorReceipt.blockHash, 'anchor block not canonical');
  const tag = block.number,
    checkedBlocks = new Map([[tag, block.hash]]),
    deploymentReceipt = await rpc('eth_getTransactionReceipt', [config.deploymentTxHash]);
  assert.equal(deploymentReceipt?.status, '0x1');
  assert(BigInt(tag) >= BigInt(deploymentReceipt.blockNumber), 'snapshot predates deployment');
  same(
    keccak256(await rpc('eth_getCode', [config.registryAddress, tag])),
    config.runtimeCodeHash,
    'runtime code mismatch',
  );
  async function call(name, args = [], at = tag) {
    if (!checkedBlocks.has(at)) {
      const historical = await rpc('eth_getBlockByNumber', [at, false]);
      assert(historical, 'historical block missing');
      checkedBlocks.set(at, historical.hash);
    }
    const request = { to: config.registryAddress, data: abi.encodeFunctionData(name, args) };
    const result = await rpc('eth_call', [request, at]);
    calls.push({ method: 'eth_call', ...request, blockTag: at, result });
    return abi.decodeFunctionResult(name, result);
  }
  const p = await call('proposals', [proposalId]);
  const [org, thresholdResult, logs] = await Promise.all([
    call('institutions', [p.institution]),
    call('threshold'),
    rpc('eth_getLogs', [
      {
        address: config.registryAddress,
        fromBlock: deploymentReceipt.blockNumber,
        toBlock: tag,
        topics: [
          ['Proposed', 'Approved', 'Executed', 'Cancelled'].map(
            (name) => abi.getEvent(name).topicHash,
          ),
          zeroPadValue(toBeHex(proposalId), 32),
        ],
      },
    ]),
  ]);
  const threshold = thresholdResult[0];
  assert.equal(threshold, 2n);
  assert.notEqual(p.institution, ZeroHash, 'proposal absent');
  const grouped = Object.fromEntries(
    ['Proposed', 'Approved', 'Executed', 'Cancelled'].map((name) => [
      name,
      logs.filter((log) => sameTopic(log.topics[0], abi.getEvent(name).topicHash)),
    ]),
  );
  assert.equal(grouped.Proposed.length, 1);
  assert(grouped.Approved.length >= 1 && grouped.Approved.length <= 3);
  assert.equal(grouped.Executed.length, p.executed ? 1 : 0);
  assert.equal(grouped.Cancelled.length, p.cancelled ? 1 : 0);
  assert(!(p.executed && p.cancelled));
  const transactions = [],
    cache = new Map();
  async function transaction(log, name, args) {
    assert.equal(log.removed, false);
    same(log.address, config.registryAddress);
    assert(BigInt(log.blockNumber) <= BigInt(tag));
    const hash = log.transactionHash;
    let entry = cache.get(hash);
    if (!entry) {
      const [tx, receipt, canonical] = await Promise.all([
        rpc('eth_getTransactionByHash', [hash]),
        rpc('eth_getTransactionReceipt', [hash]),
        rpc('eth_getBlockByNumber', [log.blockNumber, false]),
      ]);
      entry = { tx, receipt, block: canonical };
      cache.set(hash, entry);
      transactions.push(entry);
    }
    validateGovernanceEnvelope({
      hash,
      ...entry,
      registry: config.registryAddress,
      abi,
      name,
      args,
    });
    same(log.blockHash, entry.block.hash);
    same(log.blockNumber, entry.receipt.blockNumber);
    const matching = entry.receipt.logs.filter((x) => x.logIndex === log.logIndex);
    assert.equal(matching.length, 1);
    const found = matching[0];
    same(found.address, log.address);
    same(found.data, log.data);
    assert.deepEqual(found.topics.map(lower), log.topics.map(lower));
    same(found.transactionHash, hash);
    same(found.blockHash, log.blockHash);
    assert.equal((await call('governors', [entry.tx.from]))[0], true, 'sender is not governor');
    return entry;
  }
  const proposed = grouped.Proposed[0],
    proposeArgs = [
      p.action,
      p.institution,
      p.key,
      p.enabled,
      p.credentialId,
      p.reasonHash,
      p.deadline,
    ];
  const proposalTx = await transaction(proposed, 'propose', proposeArgs),
    proposedEvent = abi.parseLog(proposed).args;
  assert.equal(proposedEvent[0], proposalId);
  same(proposedEvent[1], p.institution);
  assert.equal(proposedEvent[2], p.action);
  same(proposedEvent[3], proposalTx.tx.from);
  const beforeProposalTag = toBeHex(BigInt(proposed.blockNumber) - 1n),
    historicalReadUnavailable = [];
  let beforeProposal = null;
  try {
    beforeProposal = await call('institutions', [p.institution], beforeProposalTag);
    assert.equal(beforeProposal.revision, p.revision, 'proposal revision snapshot mismatch');
  } catch (error) {
    if (!mayOmitProposalHistory(error, p.executed)) throw error;
    historicalReadUnavailable.push({
      method: 'eth_call',
      to: config.registryAddress,
      data: abi.encodeFunctionData('institutions', [p.institution]),
      blockTag: beforeProposalTag,
      rpcSource: config.rpcUrl,
      error: error.message,
      scope:
        'Additional proposal-creation prior state could not be re-read. Execution prior-state validation remains mandatory.',
    });
  }
  const approvers = [];
  for (const log of grouped.Approved) {
    const isInitial = lower(log.transactionHash) === lower(proposed.transactionHash);
    const entry = await transaction(
        log,
        isInitial ? 'propose' : 'approve',
        isInitial ? proposeArgs : [proposalId],
      ),
      event = abi.parseLog(log).args;
    assert.equal(event[0], proposalId);
    same(event[1], entry.tx.from);
    if (isInitial) same(event[1], proposalTx.tx.from);
    assert(!approvers.includes(lower(event[1])), 'duplicate governor approval');
    approvers.push(lower(event[1]));
    assert.equal((await call('approved', [proposalId, event[1]]))[0], true);
  }
  assert.equal(BigInt(approvers.length), p.approvals);
  assert.equal(
    grouped.Approved.filter((l) => lower(l.transactionHash) === lower(proposed.transactionHash))
      .length,
    1,
  );
  if (grouped.Cancelled.length) await transaction(grouped.Cancelled[0], 'cancel', [proposalId]);
  let executionTx = null,
    before = beforeProposal,
    previousRecord = null,
    record = null;
  if (p.executed) {
    assert(p.approvals >= threshold);
    const log = grouped.Executed[0];
    executionTx = await transaction(log, 'execute', [proposalId]);
    assert.equal(abi.parseLog(log).args[0], proposalId);
    assert(p.deadline > BigInt(executionTx.block.timestamp), 'execution past deadline');
    for (const approved of grouped.Approved)
      assert(
        BigInt(approved.blockNumber) < BigInt(log.blockNumber) ||
          (approved.blockNumber === log.blockNumber &&
            BigInt(approved.logIndex) < BigInt(log.logIndex)),
        'approval appeared after execution',
      );
    const beforeTag = toBeHex(BigInt(log.blockNumber) - 1n);
    before = await call('institutions', [p.institution], beforeTag);
    if (p.action <= 1n)
      same(
        (await call('keyInstitution', [p.key], beforeTag))[0],
        ZeroHash,
        'new key was already reserved',
      );
    if (p.action === 3n) {
      [previousRecord] = await call('getRecord', [p.institution, p.credentialId], beforeTag);
      [record] = await call('getRecord', [p.institution, p.credentialId]);
    }
    const executionLogs = executionTx.receipt.logs.filter(
      (l) => lower(l.address) === lower(config.registryAddress),
    );
    const changed = executionLogs.filter((l) =>
      sameTopic(l.topics[0], abi.getEvent('InstitutionChanged').topicHash),
    );
    assert.ok(changed.length <= 1);
    if (changed.length === 0)
      assert.equal(p.action, 3n, 'only emergency revoke may omit InstitutionChanged');
    else {
      const e = abi.parseLog(changed[0]).args;
      same(e[0], p.institution);
      same(e[1], org.key);
      assert.equal(e[2], org.epoch);
      assert.equal(e[3], org.enabled);
    }
    if (p.action === 3n) {
      const revoked = executionLogs.filter((l) =>
        sameTopic(l.topics[0], abi.getEvent('Revoked').topicHash),
      );
      assert.equal(revoked.length, 1);
      const e = abi.parseLog(revoked[0]).args;
      same(e[0], p.institution);
      same(e[1], p.credentialId);
      assert.equal(e[2], 3n);
      same(e[3], p.reasonHash);
    }
  }
  const previousKeyMapping =
    lower(before.key) === lower(ZeroAddress)
      ? ZeroHash
      : (await call('keyInstitution', [before.key]))[0];
  const newKeyMapping = p.action <= 1n ? (await call('keyInstitution', [p.key]))[0] : null;
  validateGovernanceTransition({
    proposal: p,
    before,
    after: org,
    previousKeyMapping,
    newKeyMapping,
    previousRecord,
    record,
    executedAt: executionTx?.block.timestamp,
  });
  let executionSimulation = null;
  if (!p.executed && !p.cancelled) {
    assert(p.deadline > BigInt(block.timestamp), 'proposal expired at snapshot');
    const request = {
      to: config.registryAddress,
      from: proposalTx.tx.from,
      data: abi.encodeFunctionData('execute', [proposalId]),
    };
    const response = await raw('eth_call', [request, tag]);
    const expectedReason = p.approvals < threshold ? 'threshold' : null;
    const decodedReason = decodeReason(response.error);
    if (expectedReason) {
      assert(response.error);
      assert.equal(decodedReason, expectedReason);
    } else {
      assert(!response.error);
      assert.equal(response.result, '0x');
    }
    executionSimulation = {
      method: 'eth_call',
      ...request,
      blockTag: tag,
      response,
      decodedReason,
      expectedReason,
      note: 'simulation only; no transaction submitted',
    };
  }
  validateGovernanceExpectations({
    expected,
    proposal: p,
    proposalId,
    proposer: proposalTx.tx.from,
    executor: executionTx?.tx.from,
  });
  if (anchorReceipt)
    assert(
      cache.has(anchorReceipt.transactionHash),
      'anchor transaction does not belong to this proposal',
    );
  for (const entry of transactions) {
    if (checkedBlocks.has(entry.block.number))
      same(checkedBlocks.get(entry.block.number), entry.block.hash, 'transaction block changed');
    checkedBlocks.set(entry.block.number, entry.block.hash);
  }
  for (const [number, hash] of checkedBlocks)
    same(
      (await rpc('eth_getBlockByNumber', [number, false])).hash,
      hash,
      'canonical block changed',
    );
  let finality;
  try {
    const finalized = await rpc('eth_getBlockByNumber', ['finalized', false]);
    finality = {
      status: finalized?.number
        ? BigInt(finalized.number) >= BigInt(tag)
          ? 'finalized'
          : 'pending'
        : 'unknown',
      checkedAt: new Date().toISOString(),
      block: finalized,
    };
  } catch (error) {
    finality = { status: 'unknown', checkedAt: new Date().toISOString(), reason: error.message };
  }
  const stage = p.executed
    ? 'executed'
    : p.cancelled
      ? 'cancelled'
      : p.approvals >= threshold
        ? 'approved-awaiting-execution'
        : 'proposed-awaiting-vote';
  const evidence = {
    at: new Date().toISOString(),
    passed: true,
    mode: 'read-only RPC; all transaction signing and submission occurred outside this script',
    chainId: 11155111,
    registryAddress: config.registryAddress,
    rpcSource: config.rpcUrl,
    proposalId,
    action: actions[Number(p.action)],
    stage,
    block,
    blockTag: tag,
    snapshotScope: 'historical end-of-block state; not current governance status',
    proposal: plain(p, proposalFields),
    institution: plain(org, institutionFields),
    beforeInstitution: plain(before, institutionFields),
    beforeProposalInstitution: beforeProposal ? plain(beforeProposal, institutionFields) : null,
    proposalCreationPriorStateRevalidated: !!beforeProposal,
    historicalReadUnavailable,
    verificationScope: historicalReadUnavailable.length
      ? 'Successful governance transactions, events, approvals, mandatory execution prior-state and post-state validated; proposal-creation prior-state was unavailable and is not claimed revalidated.'
      : 'Governance transactions, events, approvals, prior-state and post-state validated.',
    keyInstitution: { previousKey: before.key, previousKeyMapping, newKey: p.key, newKeyMapping },
    record: record ? plain(record, recordFields) : null,
    previousRecord: previousRecord ? plain(previousRecord, recordFields) : null,
    threshold,
    approvers,
    proposedLogs: grouped.Proposed,
    approvedLogs: grouped.Approved,
    executedLogs: grouped.Executed,
    cancelledLogs: grouped.Cancelled,
    transactions,
    calls,
    executionSimulation,
    expected,
    expectedExecutorChecked: !!(p.executed && expected && 'executor' in expected),
    expectedExecutorNote:
      !p.executed && expected && 'executor' in expected
        ? 'Future intent only; proposal has not executed at this snapshot.'
        : null,
    canonicalBlocksRechecked: true,
    finality,
    limitations:
      'Three local test-wallet accounts are not independent real institutions. Expected business intent is checked only for fields supplied in expected.json. Snapshots are end-of-block state and reject later institution revisions.',
  };
  const output =
    outputPath ??
    `evidence/upgrade-sepolia-governance-${proposalId}-${stage}-${Number(BigInt(tag))}.json`;
  fs.writeFileSync(
    output,
    JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n',
  );
  console.log(
    JSON.stringify({
      passed: true,
      proposalId: Number(proposalId),
      action: evidence.action,
      stage,
      snapshotBlock: Number(BigInt(tag)),
      approvals: Number(p.approvals),
      epoch: Number(org.epoch),
      revision: Number(org.revision),
      key: org.key,
      enabled: org.enabled,
      finality: finality.status,
      output,
    }),
  );
}
const sameTopic = (a, b) => lower(a) === lower(b);
function decodeReason(error) {
  if (typeof error === 'string' && error.startsWith('0x08c379a0')) {
    try {
      return AbiCoder.defaultAbiCoder().decode(['string'], '0x' + error.slice(10))[0];
    } catch {}
  }
  if (error && typeof error === 'object')
    for (const value of Object.values(error)) {
      const r = decodeReason(value);
      if (r) return r;
    }
  return null;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyGovernance();
