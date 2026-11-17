import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = fs
  .readFileSync('ProofPass_跨校证书核验实验室.html', 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/\ninit\(\);\s*$/, '\n');
function context() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id))
      els.set(id, {
        innerHTML: '',
        textContent: '',
        value: 10,
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        parentElement: { classList: { toggle() {} } },
        addEventListener() {},
      });
    return els.get(id);
  };
  const ctx = vm.createContext({
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    structuredClone,
    console,
    btoa,
    atob,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
    document: { getElementById: el, querySelectorAll: () => [] },
  });
  vm.runInContext(source, ctx);
  return ctx;
}
test('离线修复：并发、规范化、摘要长度、未知状态、独立身份及八种教学案例', async () => {
  const c = context(),
    run = (s) => vm.runInContext(s, c);
  await run('init()');
  assert.equal(
    await run(
      'verifySignature({...current(),data:Object.fromEntries(Object.entries(current().data).reverse())},state.issuers[current().data.issuerId].keys.publicKey)',
    ),
    true,
  );
  assert.equal(
    await run(
      '(async()=>{await Promise.all(Array.from({length:20},(_,i)=>appendEvent("test",String(i))));return (await audit()).ok})()',
    ),
    true,
  );
  assert.equal(run('state.ledger[0].meta.digest.length'), 64);
  assert.equal(
    await run('(async()=>{await mainVerify();return state.lastResult.holderMatch})()'),
    null,
  );
  for (const status of ['unknown', 'unexpected-status', 'offline']) {
    c.testStatus = status;
    assert.equal(
      await run(
        '(async()=>{state.statuses.set(state.selected,testStatus);const r=await assess(current(),{expectedHolder:"学生甲",authOverride:true});renderChecks(r,"checkGrid");return r.verdict})()',
      ),
      'wait',
    );
    assert.ok(!run('$("checkGrid").innerHTML').includes('<b>有效</b>'));
  }
  await run('init(true)');
  const expected = ['good', 'bad', 'bad', 'bad', 'bad', 'wait', 'wait', 'wait'];
  for (let i = 0; i < 8; i++) {
    await run(`runCase(${i})`);
    assert.ok(run('$("caseResult").className').endsWith(expected[i]));
  }
});
