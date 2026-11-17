import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Interface, ZeroHash, ZeroAddress } from 'ethers';
import {
  validateGovernanceTransition,
  validateGovernanceEnvelope,
  validateGovernanceExpectations,
  mayOmitProposalHistory,
} from '../scripts/verify-upgrade-governance.mjs';
const abi = new Interface(
  JSON.parse(fs.readFileSync(new URL('../upgrade/abi.json', import.meta.url), 'utf8')),
);
const institution = '0x' + '11'.repeat(32),
  oldKey = '0x' + '22'.repeat(20),
  newKey = '0x' + '33'.repeat(20),
  reasonHash = '0x' + '44'.repeat(32);
const before = { key: oldKey, epoch: 1n, revision: 1n, enabled: false };
test('Only executed proposal creation-history unavailability may be recorded as omitted', () => {
  const error = Error('{"code":-32000,"message":"historical state deadbeef is not available"}');
  assert.equal(mayOmitProposalHistory(error, true), true);
  assert.equal(mayOmitProposalHistory(error, false), false);
  assert.equal(mayOmitProposalHistory(Error('RPC timeout'), true), false);
  assert.equal(mayOmitProposalHistory(Error('proposal revision snapshot mismatch'), true), false);
});
test('Pending executor is future intent; executed proposal must match expected executor', () => {
  const data = {
    expected: {
      proposalId: 2,
      action: 'Rotate',
      institution,
      key: newKey,
      executor: newKey,
      proposer: oldKey,
    },
    proposal: { action: 1n, institution, key: newKey, executed: false },
    proposalId: 2n,
    proposer: oldKey,
  };
  validateGovernanceExpectations(data);
  validateGovernanceExpectations({
    ...data,
    proposal: { ...data.proposal, executed: true },
    executor: newKey,
  });
  assert.throws(
    () =>
      validateGovernanceExpectations({
        ...data,
        proposal: { ...data.proposal, executed: true },
        executor: oldKey,
      }),
    /executor/,
  );
  assert.throws(
    () => validateGovernanceExpectations({ ...data, proposal: { ...data.proposal, key: oldKey } }),
    /expected key/,
  );
});
function fixture(action) {
  return {
    proposal: {
      action,
      institution,
      key: newKey,
      enabled: false,
      revision: 1n,
      executed: true,
      reasonHash,
    },
    before: { ...before },
    after: { ...before, revision: 2n },
    previousKeyMapping: institution,
    newKeyMapping: institution,
  };
}
test('Rotate preserves suspension, increments epoch/revision, reserves retired key; pending stage remains unchanged', () => {
  const data = fixture(1n);
  Object.assign(data.after, { key: newKey, epoch: 2n });
  validateGovernanceTransition(data);
  assert.throws(
    () => validateGovernanceTransition({ ...data, after: { ...data.after, enabled: true } }),
    /preserve/,
  );
  assert.throws(
    () => validateGovernanceTransition({ ...data, previousKeyMapping: ZeroHash }),
    /retired/,
  );
  assert.throws(() =>
    validateGovernanceTransition({ ...data, after: { ...data.after, epoch: 1n } }),
  );
  assert.throws(
    () => validateGovernanceTransition({ ...data, after: { ...data.after, revision: 3n } }),
    /increment/,
  );
  const pending = {
    ...data,
    proposal: { ...data.proposal, executed: false },
    after: { ...before },
    newKeyMapping: ZeroHash,
  };
  validateGovernanceTransition(pending);
  assert.throws(
    () => validateGovernanceTransition({ ...pending, newKeyMapping: institution }),
    /already used/,
  );
});
test('SetEnabled changes only enabled and revision', () => {
  const data = fixture(2n);
  data.proposal.enabled = true;
  data.after.enabled = true;
  validateGovernanceTransition(data);
  assert.throws(() =>
    validateGovernanceTransition({ ...data, after: { ...data.after, key: newKey } }),
  );
  assert.throws(() =>
    validateGovernanceTransition({ ...data, after: { ...data.after, epoch: 2n } }),
  );
  assert.throws(() =>
    validateGovernanceTransition({ ...data, after: { ...data.after, enabled: false } }),
  );
});
test('EmergencyRevoke keeps credential content and institution state; requires kind3, reason and timestamp', () => {
  const data = fixture(3n);
  data.executedAt = '0x64';
  data.previousRecord = {
    commitment: reasonHash,
    registeredAt: 50n,
    validUntil: 80n,
    issuedBy: oldKey,
    keyEpoch: 1n,
    previousId: ZeroHash,
    replacedBy: ZeroHash,
    revokedAt: 0n,
    revocationKind: 0n,
    reasonHash: ZeroHash,
  };
  data.record = { ...data.previousRecord, revokedAt: 100n, revocationKind: 3n, reasonHash };
  validateGovernanceTransition(data); // Expired records and suspended institutions may be emergency-revoked.
  for (const change of [
    { revocationKind: 1n },
    { reasonHash: ZeroHash },
    { revokedAt: 101n },
    { commitment: ZeroHash },
    { issuedBy: newKey },
    { replacedBy: reasonHash },
  ])
    assert.throws(() =>
      validateGovernanceTransition({ ...data, record: { ...data.record, ...change } }),
    );
  assert.throws(() =>
    validateGovernanceTransition({
      ...data,
      previousRecord: { ...data.previousRecord, revocationKind: 2n },
    }),
  );
});
test('Governance transaction envelope binds hash, sender, target, canonical block, network, value and exact calldata', () => {
  const hash = '0x' + '55'.repeat(32),
    blockHash = '0x' + '66'.repeat(32),
    registry = '0x' + '77'.repeat(20);
  const tx = {
    hash,
    from: oldKey,
    to: registry,
    blockHash,
    blockNumber: '0x10',
    chainId: '0xaa36a7',
    value: '0x0',
    input: abi.encodeFunctionData('execute', [2]),
  };
  const receipt = {
    status: '0x1',
    transactionHash: hash,
    from: oldKey,
    to: registry,
    blockHash,
    blockNumber: '0x10',
  };
  const data = {
    hash,
    tx,
    receipt,
    block: { hash: blockHash, number: '0x10' },
    registry,
    abi,
    name: 'execute',
    args: [2],
  };
  validateGovernanceEnvelope(data);
  for (const change of [
    { hash: ZeroHash },
    { from: newKey },
    { to: ZeroAddress },
    { blockHash: ZeroHash },
    { blockNumber: '0x11' },
    { chainId: '0x1' },
    { value: '0x1' },
    { input: abi.encodeFunctionData('approve', [2]) },
  ])
    assert.throws(() => validateGovernanceEnvelope({ ...data, tx: { ...tx, ...change } }));
  assert.throws(() =>
    validateGovernanceEnvelope({ ...data, receipt: { ...receipt, status: '0x0' } }),
  );
});
