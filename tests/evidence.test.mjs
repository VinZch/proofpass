// 守护「证据不可被测试改写」这条约束，并验证 evidence.mjs 的登记/校验逻辑。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TEST_OUTPUT_DIR,
  backfillManifest,
  recordEvidence,
  sha256,
  verifyManifest,
  writeTestOutput,
} from '../scripts/evidence.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'proofpass-evidence-'));
}

test('测试产物只写入 artifacts/test-output，不落 evidence/', () => {
  const root = tempRoot();
  const saved = writeTestOutput('probe.json', { ok: true }, { root });
  assert.equal(saved, `${TEST_OUTPUT_DIR}/probe.json`);
  assert.ok(fs.existsSync(path.join(root, saved)));
  assert.equal(fs.existsSync(path.join(root, 'evidence/probe.json')), false);
  assert.match(fs.readFileSync(path.join(root, saved), 'utf8'), /"ok": true/);
});

test('登记证据会写入 manifest，并拒绝静默覆盖', () => {
  const root = tempRoot();
  const draft = writeTestOutput('draft.json', { verified: true }, { root });
  const first = recordEvidence(draft, { root, as: 'result.json', note: '测试登记' });
  assert.equal(first.size, fs.statSync(path.join(root, 'evidence/result.json')).size);
  assert.equal(first.sha256, sha256(fs.readFileSync(path.join(root, 'evidence/result.json'))));

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'evidence/manifest.json'), 'utf8'));
  assert.equal(manifest.files['result.json'].note, '测试登记');
  assert.equal(manifest.files['result.json'].sha256, first.sha256);
  assert.throws(() => recordEvidence(draft, { root, as: 'result.json' }), /已存在/);
  assert.doesNotThrow(() => recordEvidence(draft, { root, as: 'result.json', force: true }));
});

test('verify 能发现被改动、缺失和未登记的证据', () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(root, 'evidence/a.json'), '{"a":1}\n');
  fs.writeFileSync(path.join(root, 'evidence/b.json'), '{"b":1}\n');
  assert.equal(backfillManifest({ root }).count, 2);
  assert.deepEqual(verifyManifest({ root }), { ok: true, checked: 2, problems: [], untracked: [] });

  fs.writeFileSync(path.join(root, 'evidence/a.json'), '{"a":2}\n');
  const modified = verifyManifest({ root });
  assert.equal(modified.ok, false);
  assert.deepEqual(
    modified.problems.map((problem) => problem.kind),
    ['modified'],
  );

  fs.rmSync(path.join(root, 'evidence/b.json'));
  fs.writeFileSync(path.join(root, 'evidence/c.json'), '{"c":1}\n');
  const missing = verifyManifest({ root });
  assert.ok(
    missing.problems.some((problem) => problem.kind === 'missing' && problem.name === 'b.json'),
  );
  assert.deepEqual(missing.untracked, ['c.json']);
});

test('测试与浏览器脚本不得出现直接写 evidence/ 的调用', () => {
  // 只扫描测试与浏览器脚本；scripts/evidence.mjs 和 verify-deployment.mjs 通过 recordEvidence 写入。
  const targets = [
    ...fs
      .readdirSync(path.join(projectRoot, 'tests'))
      .filter((name) => name.endsWith('.mjs') && name !== 'evidence.test.mjs')
      .map((name) => path.join(projectRoot, 'tests', name)),
    ...fs
      .readdirSync(path.join(projectRoot, 'scripts'))
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => path.join(projectRoot, 'scripts', name)),
  ];
  const forbidden = [
    /writeFileSync\(\s*['"`]evidence\//,
    /appendFileSync\(\s*['"`]evidence\//,
    /createWriteStream\(\s*['"`]evidence\//,
    /saveAs\([^)]*['"`]evidence\//,
    /screenshot\(\{[^}]*path:\s*['"`]evidence\//,
  ];
  for (const file of targets) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `${path.relative(projectRoot, file)} 仍直接写 evidence/：${pattern}`,
      );
    }
  }
});
