// 证据工作流：把「测试产物」和「公开证据」分开。
//
// 约定（由 tests/evidence.test.mjs 守护）：
//   1. 测试与浏览器脚本只能写 artifacts/test-output/，不得写 evidence/。
//   2. evidence/ 只允许 `node scripts/evidence.mjs record` 写入，并同步登记
//      evidence/manifest.json（sha256 + 大小 + 时间 + 提交号）。
//   3. `node scripts/evidence.mjs verify` 重新计算哈希，发现被改动或未登记的文件。
//
// 这样任何一次 `npm test` 都不会改写证据，审计时可用 manifest 证明证据未被篡改。
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const TEST_OUTPUT_DIR = 'artifacts/test-output';
export const EVIDENCE_DIR = 'evidence';
export const MANIFEST_NAME = 'manifest.json';

export const MANIFEST_POLICY =
  'evidence/ 只允许 scripts/evidence.mjs record 写入；测试产物写入 artifacts/test-output/。verify 会重算 sha256 并报告改动。';

const rootOf = options => path.resolve(options?.root ?? process.cwd());

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const isInside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export function testOutputPath(name, options = {}) {
  const root = rootOf(options);
  const target = path.resolve(root, TEST_OUTPUT_DIR, name);
  if (!isInside(path.resolve(root, TEST_OUTPUT_DIR), target)) throw new Error(`测试产物文件名越界：${name}`);
  return target;
}

/** 写测试产物。返回相对工作区根目录的 POSIX 路径，便于日志引用。 */
export function writeTestOutput(name, data, options = {}) {
  const root = rootOf(options);
  const target = testOutputPath(name, options);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(target, text);
  return path.relative(root, target).split(path.sep).join('/');
}

export function manifestPath(options = {}) {
  return path.resolve(rootOf(options), EVIDENCE_DIR, MANIFEST_NAME);
}

export function readManifest(options = {}) {
  const file = manifestPath(options);
  if (!fs.existsSync(file)) {
    return {schemaVersion: 1, generatedAt: null, policy: MANIFEST_POLICY, files: {}};
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
    throw new Error('evidence/manifest.json 格式错误：缺少 files 对象');
  }
  return {schemaVersion: 1, policy: MANIFEST_POLICY, generatedAt: null, ...parsed, files: {...parsed.files}};
}

function writeManifest(manifest, options = {}) {
  const file = manifestPath(options);
  const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({...manifest, policy: MANIFEST_POLICY, files}, null, 2) + '\n');
}

function gitCommit(options = {}) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: rootOf(options), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function walkFiles(directory) {
  const found = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) found.push(absolute);
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  return found.sort();
}

function manifestKey(absolute, options = {}) {
  return path.relative(path.resolve(rootOf(options), EVIDENCE_DIR), absolute).split(path.sep).join('/');
}

function assertEvidenceName(name) {
  const normalized = String(name);
  if (!normalized || path.isAbsolute(normalized) || normalized.includes('..') || normalized.includes('\\')) {
    throw new Error(`证据文件名必须是 evidence/ 下的相对路径：${name}`);
  }
  if (normalized.split('/')[0] === MANIFEST_NAME) throw new Error('不能把 manifest.json 本身登记为证据');
  return normalized;
}

/**
 * 选择证据文件名：默认不覆盖历史。
 * 目标已存在时（且未 force）追加 -recheck-<时间戳>，避免审计脚本冲掉旧快照。
 */
export function uniqueEvidenceName(name, options = {}) {
  const root = rootOf(options);
  const target = path.resolve(root, EVIDENCE_DIR, name);
  if (!fs.existsSync(target) || options.force) return name;
  const extension = path.extname(name);
  const base = name.slice(0, name.length - extension.length);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base}-recheck-${stamp}${extension}`;
}

/**
 * 把一份已核验的文件登记为证据。
 * 默认拒绝覆盖同名证据；确需替换时用 force，manifest 会记录新哈希。
 */
export function recordEvidence(source, options = {}) {
  const root = rootOf(options);
  const sourcePath = path.resolve(root, source);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`待登记文件不存在：${source}`);
  const bytes = fs.readFileSync(sourcePath);
  const name = assertEvidenceName(options.as ?? path.basename(sourcePath));
  const target = path.resolve(root, EVIDENCE_DIR, name);
  if (!isInside(path.resolve(root, EVIDENCE_DIR), target)) throw new Error(`证据路径越界：${name}`);
  if (fs.existsSync(target) && !options.force) throw new Error(`证据已存在：evidence/${name}（确需替换请加 --force）`);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, bytes);
  const manifest = readManifest({root});
  manifest.files[name] = {
    sha256: sha256(bytes),
    size: bytes.length,
    recordedAt: new Date().toISOString(),
    note: options.note ?? '',
    commit: gitCommit({root}),
  };
  manifest.generatedAt = new Date().toISOString();
  writeManifest(manifest, {root});
  return {name, sha256: manifest.files[name].sha256, size: bytes.length};
}

/** 校验 manifest：哈希不符、文件缺失、未登记文件都算问题。 */
export function verifyManifest(options = {}) {
  const root = rootOf(options);
  const manifest = readManifest({root});
  const evidenceRoot = path.resolve(root, EVIDENCE_DIR);
  const problems = [];
  const seen = new Set();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!entry || typeof entry.sha256 !== 'string') {
      problems.push({kind: 'entry-invalid', name});
      continue;
    }
    const absolute = path.resolve(evidenceRoot, name);
    seen.add(name);
    if (!isInside(evidenceRoot, absolute) || !fs.existsSync(absolute)) {
      problems.push({kind: 'missing', name});
      continue;
    }
    const bytes = fs.readFileSync(absolute);
    const digest = sha256(bytes);
    if (digest !== entry.sha256) problems.push({kind: 'modified', name, expected: entry.sha256, actual: digest});
    if (Number.isFinite(entry.size) && bytes.length !== entry.size) {
      problems.push({kind: 'size-changed', name, expected: entry.size, actual: bytes.length});
    }
  }
  const untracked = walkFiles(evidenceRoot)
    .map(absolute => manifestKey(absolute, {root}))
    .filter(name => name !== MANIFEST_NAME && !seen.has(name));
  return {ok: problems.length === 0 && untracked.length === 0, checked: seen.size, problems, untracked};
}

/** 首次建立 manifest：把 evidence/ 现有文件按其内容登记，时间取文件 mtime。 */
export function backfillManifest(options = {}) {
  const root = rootOf(options);
  const manifest = readManifest({root});
  if (Object.keys(manifest.files).length && !options.force) {
    throw new Error('manifest 已有内容；如确需重建请加 --force');
  }
  const evidenceRoot = path.resolve(root, EVIDENCE_DIR);
  const files = {};
  for (const absolute of walkFiles(evidenceRoot)) {
    const name = manifestKey(absolute, {root});
    if (name === MANIFEST_NAME) continue;
    const bytes = fs.readFileSync(absolute);
    files[name] = {
      sha256: sha256(bytes),
      size: bytes.length,
      recordedAt: fs.statSync(absolute).mtime.toISOString(),
      note: 'backfill',
      commit: null,
    };
  }
  writeManifest({schemaVersion: 1, generatedAt: new Date().toISOString(), files}, {root});
  return {count: Object.keys(files).length};
}

function main(argv) {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter(argument => argument.startsWith('--')));
  const positionals = rest.filter(argument => !argument.startsWith('--'));
  const value = flag => {
    const index = rest.indexOf(flag);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  if (command === 'verify') {
    const result = verifyManifest();
    for (const problem of result.problems) {
      const detail = problem.kind === 'modified' ? `${problem.expected} -> ${problem.actual}` : problem.kind;
      console.error(`问题证据：${problem.name}（${detail}）`);
    }
    for (const name of result.untracked) console.error(`未登记证据：${name}`);
    console.log(`已校验 ${result.checked} 份证据；${result.ok ? '全部与 manifest 一致。' : '存在需要处理的问题。'}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (command === 'record') {
    const [source] = positionals;
    if (!source) throw new Error('用法：node scripts/evidence.mjs record <文件> [--as 名称] [--note 说明] [--force]');
    const saved = recordEvidence(source, {
      as: value('--as'),
      note: value('--note'),
      force: flags.has('--force'),
    });
    console.log(`已登记 evidence/${saved.name}（${saved.size} 字节，sha256 ${saved.sha256.slice(0, 16)}…）`);
    return;
  }
  if (command === 'backfill') {
    const result = backfillManifest({force: flags.has('--force')});
    console.log(`已回填 manifest：${result.count} 份证据。`);
    return;
  }
  console.log([
    '证据工作流：',
    '  node scripts/evidence.mjs verify                      重新计算 evidence/ 哈希并核对 manifest',
    '  node scripts/evidence.mjs record <文件> [--as 名称]     登记一份证据（默认拒绝覆盖）',
    '  node scripts/evidence.mjs backfill                     首次建立 manifest',
  ].join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
