import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDeploymentTransaction,
  classifyFinality,
} from '../scripts/verify-upgrade-deployment.mjs';
const hash = '0x' + 'a'.repeat(64),
  blockHash = '0x' + 'b'.repeat(64),
  address = '0x' + '1'.repeat(40),
  sender = '0x' + '2'.repeat(40);
function sample() {
  return {
    hash,
    address,
    receipt: {
      status: '0x1',
      contractAddress: address,
      transactionHash: hash,
      blockHash,
      blockNumber: '0x10',
      from: sender,
    },
    tx: { hash, to: null, from: sender, blockHash, blockNumber: '0x10', chainId: '0xaa36a7' },
  };
}
test('部署验证绑定交易哈希、区块、网络与可选发送钱包', () => {
  assert.equal(validateDeploymentTransaction(sample()), sender);
  const checked = sample();
  checked.expectedDeployer = sender;
  assert.equal(validateDeploymentTransaction(checked), sender);
  const noChain = sample();
  delete noChain.tx.chainId;
  assert.equal(validateDeploymentTransaction(noChain), sender);
  for (const edit of [
    (x) => {
      x.receipt.transactionHash = blockHash;
    },
    (x) => {
      x.tx.hash = blockHash;
    },
    (x) => {
      x.tx.blockHash = hash;
    },
    (x) => {
      x.tx.blockNumber = '0x11';
    },
    (x) => {
      x.tx.blockNumber = null;
    },
    (x) => {
      x.tx.chainId = '0x1';
    },
    (x) => {
      x.receipt.from = address;
    },
    (x) => {
      x.expectedDeployer = address;
    },
    (x) => {
      x.tx.from = 'invalid';
    },
    (x) => {
      x.tx.to = address;
    },
    (x) => {
      x.receipt.status = '0x0';
    },
  ]) {
    const data = sample();
    edit(data);
    assert.throws(() => validateDeploymentTransaction(data));
  }
});
test('最终性不能由成功回执单独推出，无效 finalized 为 unknown', () => {
  const { receipt } = sample();
  for (const block of [null, {}, { number: '0x10', hash: 'invalid' }])
    assert.equal(classifyFinality(receipt, block), 'unknown');
  assert.equal(classifyFinality(receipt, { number: '0xf', hash: blockHash }), 'pending');
  assert.equal(classifyFinality(receipt, { number: '0x10', hash: blockHash }), 'finalized');
  assert.equal(classifyFinality(receipt, { number: '0x11', hash: blockHash }), 'finalized');
});
