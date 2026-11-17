import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Public release uses stable content versions throughout the module graph and keeps legacy files private', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync('python3', ['-B', '-c', String.raw`
import importlib.util, json, pathlib, re, shutil, sys, tempfile, zipfile
from urllib.parse import parse_qs, urlsplit

project = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('public_build', project / 'scripts/build-public-site.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

with tempfile.TemporaryDirectory(prefix='proofpass-public-build-') as directory:
    root = pathlib.Path(directory).resolve()
    for name in (*builder.FILES, *builder.DOC_FILES):
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(project / name, target)
    # These should never enter the release even though they exist in the source tree.
    (root / 'evidence').mkdir()
    (root / 'evidence/private-test.json').write_text('{"test": true}')
    (root / 'chain/index.html').write_text('legacy demo')
    builder.ROOT = root
    builder.OUTPUT = root / 'deployment/public-site'
    builder.DIST = builder.OUTPUT / 'dist'
    builder.ARCHIVE = root / 'deployment/public-site.zip'

    def build():
        builder.build()
        return json.loads((builder.OUTPUT / 'manifest.json').read_text())

    def versions(manifest):
        version = manifest['assetVersion']
        checks = {
            'upgrade/index.html': ('style.css', 'bootstrap.js'),
            'upgrade/bootstrap.js': ('./app.js', '../chain/vendor/ethers.js'),
            'upgrade/app.js': ('./adapter.js', './protocol.js', '../chain/protocol.js'),
            'upgrade/adapter.js': ('../chain/adapters.js', '../chain/protocol.js', './protocol.js'),
            'chain/adapters.js': ('./vendor/ethers.js', './protocol.js'),
        }
        for name, imports in checks.items():
            text = (builder.DIST / name).read_text()
            for path in imports:
                matches = re.findall(re.escape(path) + r'\?[^\s\x22\x27]+', text)
                assert matches, (name, path, 'missing cache version')
                assert all(parse_qs(urlsplit(url).query).get('v') == [version] for url in matches), (name, path)
        names = {entry['path'] for entry in manifest['files']}
        assert names == set(builder.FILES) | set(builder.DOC_FILES.values()) | {'index.html', '.nojekyll'}
        assert (builder.DIST / 'README.md').read_bytes() == (root / 'deployment/README-public.md').read_bytes()
        assert manifest['validation']['subpathCompatible']
        html = (builder.DIST / 'upgrade/index.html').read_text()
        assert '../chain/' not in html and '127.0.0.1' not in html
        assert 'evidence/' not in html and '../index.html' in html
        assert 'startup-local' in html and 'id="evidence"' in html
        with zipfile.ZipFile(builder.ARCHIVE) as archive:
            assert set(archive.namelist()) == names

    first = build()
    versions(first)
    repeated = build()
    assert repeated['assetVersion'] == first['assetVersion'], 'unchanged rebuild must keep caches valid'
    assert repeated['files'] == first['files'], 'unchanged rebuild changed release bytes'

    introduction = root / 'deployment/README-public.md'
    introduction.write_text(introduction.read_text() + '\nUpdated project introduction.\n')
    docs_changed = build()
    versions(docs_changed)
    assert docs_changed['assetVersion'] == first['assetVersion'], 'documentation must not invalidate app caches'
    assert [f for f in docs_changed['files'] if f['path'] != 'README.md'] == [f for f in first['files'] if f['path'] != 'README.md']

    # A dependency-only fix must refresh entry URLs as well as every nested import.
    dependency = root / 'upgrade/protocol.js'
    dependency.write_text(dependency.read_text() + '\n// changed dependency\n')
    changed = build()
    assert changed['assetVersion'] != first['assetVersion']
    versions(changed)
`, root], {encoding: 'utf8', timeout: 20000});
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});
