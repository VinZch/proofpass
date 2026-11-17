#!/usr/bin/env python3
"""Create a small, checked static release suitable for GitHub Pages.

Only the explicitly listed workbench browser files are published. Historical
test screenshots, reports, and sample credential packages remain local. Nothing
under node_modules, scripts, local-chain state, or the rest of the workspace is
copied. Run from any directory; no network is used.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import posixpath
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "deployment/public-site"
DIST = OUTPUT / "dist"
ARCHIVE = ROOT / "deployment/ProofPass-public-site.zip"
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_TOTAL_BYTES = 100 * 1024 * 1024

# Keep this allowlist explicit. New public dependencies must be reviewed here.
APP_FILES = (
    "upgrade/index.html",
    "upgrade/app.js",
    "upgrade/adapter.js",
    "upgrade/protocol.js",
    "upgrade/bootstrap.js",
    "upgrade/style.css",
    "upgrade/config.json",
    "upgrade/abi.json",
    "chain/adapters.js",
    "chain/protocol.js",
    "chain/rpc.js",
    "chain/deployment.js",
    "chain/transaction.js",
    "chain/vendor/ethers.js",
    "chain/vendor/ethers-LICENSE.md",
)
FILES = APP_FILES
DOC_FILES = {"deployment/README-public.md": "README.md"}
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
SECRET_KEYS = {"privatekey", "secretkey", "mnemonic", "seedphrase", "password", "accesstoken", "apikey"}

INDEX = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=./upgrade/">
<title>ProofPass · 数字凭证工作台</title>
</head><body><p><a href="./upgrade/">打开 ProofPass 数字凭证工作台</a></p></body></html>
"""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def public_upgrade_html(source: str) -> str:
    """Adapt only the release copy; the original local demo remains intact."""
    source = source.replace('../ProofPass_跨校证书核验实验室.html#demo-evidence', '#evidence')
    source = source.replace('../ProofPass_跨校证书核验实验室.html', '../index.html')
    source, count = re.subn(r'<div class="sidebar-bottom">.*?</div>', '', source, flags=re.S)
    require(count == 1, 'upgrade/index.html: sidebar structure changed; review public-only transformation')
    source, count = re.subn(r'<a class="mobile-base-link"[^>]*>.*?</a>', '', source, flags=re.S)
    require(count == 1, 'upgrade/index.html: footer structure changed; review public-only transformation')
    for tag, element_id in (("a", "startup-local"), ("p", "startup-help"), ("div", "setup")):
        pattern = rf'<{tag}\b(?=[^>]*\bid="{element_id}")[^>]*>.*?</{tag}>'
        placeholder = f'<{tag} id="{element_id}" hidden' + (' href="#"' if tag == 'a' else '') + f'></{tag}>'
        source, count = re.subn(pattern, placeholder, source, flags=re.S)
        require(count == 1, f'upgrade/index.html: missing expected {element_id} placeholder')
    source = source.replace('<noscript>', '<noscript><style>#evidence[hidden]{display:block!important}</style>', 1)
    require('127.0.0.1' not in source and '../chain/' not in source, 'Public HTML still links to a local/legacy entry')
    return source


def check_json_keys(value, source: str) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = re.sub(r"[^a-z]", "", key.lower())
            require(normalized not in SECRET_KEYS, f"{source}: secret-like key {key!r} must not be published")
            check_json_keys(item, source)
    elif isinstance(value, list):
        for item in value:
            check_json_keys(item, source)


def check_config(path: Path) -> dict:
    config = json.loads(path.read_text())
    require(config.get("mode") == "testnet", f"{path.name}: public mode must be testnet")
    require(config.get("chainId") == 11155111, f"{path.name}: public chain must be Sepolia (11155111)")
    require(config.get("deploymentStatus") == "deployed", f"{path.name}: contract must already be deployed")
    require("demo" not in config, f"{path.name}: local demo configuration cannot be published")
    check_json_keys(config, str(path.relative_to(ROOT)))
    for key, digits in (("registryAddress", 40), ("deploymentTxHash", 64), ("runtimeCodeHash", 64)):
        value = config.get(key, "")
        require(isinstance(value, str) and re.fullmatch(rf"0x[0-9a-fA-F]{{{digits}}}", value) is not None
                and int(value[2:], 16) != 0, f"{path.name}: invalid {key}")
    rpc = urlsplit(config.get("rpcUrl", ""))
    require(rpc.scheme == "https" and bool(rpc.hostname), f"{path.name}: RPC must use a public HTTPS URL")
    require(not rpc.username and not rpc.password and not rpc.query and not rpc.fragment,
            f"{path.name}: RPC URL must not contain credentials, query secrets, or a fragment")
    hostname = rpc.hostname.lower()
    require(hostname not in LOCAL_HOSTS and "." in hostname and not hostname.endswith((".local", ".localhost")),
            f"{path.name}: RPC must not point at a local host")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        require(address.is_global, f"{path.name}: RPC address must be public")
    return config


class References(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__()
        self.references = []
        self.ids = []
        self.stack = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        inherited = any(local for _, local in self.stack)
        local_only = inherited or ("data-local-only" in attrs and "hidden" in attrs)
        local_only = local_only or (attrs.get("id") in ("startup-local", "startup-help", "setup") and "hidden" in attrs)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        for key in ("src", "href", "poster"):
            if attrs.get(key):
                self.references.append((attrs[key], local_only))
        if tag not in self.VOID:
            self.stack.append((tag, local_only))

    def handle_startendtag(self, tag, attributes):
        self.handle_starttag(tag, attributes)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                self.stack = self.stack[:index]
                return


def local_target(source: str, url: str, local_only: bool = False) -> str | None:
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        if parts.scheme in ("data", "blob", "mailto", "tel"):
            return None
        if parts.hostname in LOCAL_HOSTS:
            require(local_only, f"{source}: localhost link must be hidden outside local preview: {url}")
            return None
        require(parts.scheme == "https" and parts.hostname and not parts.username and not parts.password,
                f"{source}: external links must be credential-free HTTPS: {url}")
        return None
    if not parts.path:
        return None
    relative = unquote(parts.path)
    require(not relative.startswith("/"), f"{source}: root-relative URL breaks GitHub Pages subpaths: {url}")
    require("\\" not in relative, f"{source}: invalid URL path: {url}")
    target = posixpath.normpath(posixpath.join(posixpath.dirname(source), relative))
    require(target != ".." and not target.startswith("../"), f"{source}: reference escapes the site: {url}")
    if relative.endswith("/") or target == ".":
        target = posixpath.join(target, "index.html")
    return target


def version_assets(name: str, content: str, version: str) -> str:
    """Keep a new entry point from reusing modules cached from an older release."""
    def replace(match):
        url = match.group("url")
        parts = urlsplit(url)
        if parts.scheme or parts.netloc:
            return match.group(0)
        target = local_target(name, url)
        if target not in FILES or Path(target).suffix not in (".js", ".css"):
            return match.group(0)
        query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "v"]
        revised = parts._replace(query=urlencode([*query, ("v", version)])).geturl()
        start, end = match.span("url")
        original = match.group(0)
        return original[:start - match.start()] + revised + original[end - match.start():]

    patterns = []
    if name.endswith(".html"):
        patterns.append(r'\b(?:src|href)=[\'"](?P<url>[^\'"]+)[\'"]')
    if name.endswith(".js") and name != "chain/vendor/ethers.js":
        # 允许 Prettier 产生的多行 import：from 之前可以有换行，但不能跨过分号。
        patterns.extend((
            r'(?m)^\s*(?:import|export)\s+[^;]*?\bfrom\s*[\'"](?P<url>[^\'"]+)[\'"]',
            r'(?m)^\s*import\s*[\'"](?P<url>[^\'"]+)[\'"]',
            r'\bimport\s*\(\s*[\'"](?P<url>[^\'"]+)[\'"]\s*\)',
        ))
    if name.endswith((".css", ".html")):
        patterns.append(r'url\(\s*[\'"]?(?P<url>[^)\'"\s]+)')
    for pattern in patterns:
        content = re.sub(pattern, replace, content)
    return content


def check_references(staging: Path, names: list[str]) -> dict:
    available = set(names)
    require(not any(name.startswith("evidence/") for name in available),
            "Historical test assets must not be included in the public release")
    refs = []
    hidden_local_links = []
    for name in names:
        path = staging / name
        if path.suffix not in (".html", ".css", ".js"):
            continue
        source = path.read_text()
        urls = []
        if path.suffix == ".html":
            parsed = References()
            parsed.feed(source)
            require(len(parsed.ids) == len(set(parsed.ids)), f"{name}: duplicate HTML IDs")
            urls.extend(parsed.references)
        if path.suffix in (".css", ".html"):
            urls.extend((match, False) for match in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", source))
        if path.suffix == ".js" and name != "chain/vendor/ethers.js":
            patterns = (
                r"(?m)^\s*(?:import|export)\s+[^;]*?\bfrom\s*['\"]([^'\"]+)['\"]",
                r"(?m)^\s*import\s*['\"]([^'\"]+)['\"]",
                r"\bimport\s*\(\s*['\"]([^'\"]+)['\"]\s*\)",
                r"\b(?:fetch|readJson)\s*\(\s*['\"]([^'\"]+)['\"]",
            )
            for pattern in patterns:
                urls.extend((match, False) for match in re.findall(pattern, source))
        for url, local_only in urls:
            target = local_target(name, url, local_only)
            if target:
                require(not target.startswith("evidence/"),
                        f"{name}: historical test resource must not be linked publicly: {url}")
                require(target in available, f"{name}: {url} resolves to missing/unapproved file {target}")
                refs.append({"from": name, "to": target})
            elif urlsplit(url).hostname in LOCAL_HOSTS:
                hidden_local_links.append({"from": name, "url": url})
    # Configuration is also fetched via arrays/variables. Keep these explicit.
    for folder in ("upgrade",):
        require(f"{folder}/config.json" in available and f"{folder}/abi.json" in available,
                f"{folder}: missing runtime configuration or ABI")
    return {"checkedReferences": len(refs), "hiddenLocalOnlyLinks": hidden_local_links,
            "subpathCompatible": True}


def build() -> dict:
    configs = {folder: check_config(ROOT / folder / "config.json") for folder in ("upgrade",)}
    require(len(FILES) == len(set(FILES)), "Duplicate allowlist entries")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".stage-", dir=OUTPUT) as temporary:
        staging = Path(temporary)
        manifest_files = []
        for name in FILES:
            source = ROOT / name
            require(source.is_file() and not source.is_symlink(), f"Missing or symbolic source file: {name}")
            require(source.resolve().is_relative_to(ROOT), f"Source escapes workspace: {name}")
            require(source.stat().st_size <= MAX_FILE_BYTES, f"File exceeds 25 MiB: {name}")
            if source.suffix == ".json":
                check_json_keys(json.loads(source.read_text()), name)
            destination = staging / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            if name == "upgrade/index.html":
                destination.write_text(public_upgrade_html(source.read_text()))
            else:
                shutil.copyfile(source, destination)
        (staging / "index.html").write_text(INDEX)
        (staging / ".nojekyll").write_text("")
        names = sorted([*FILES, "index.html", ".nojekyll"])
        # Derive one stable version from the actual release inputs. Unlike a
        # timestamp it stays unchanged on a rebuild, and unlike a hand-edited
        # entry tag it also invalidates nested imports when any dependency changes.
        version_hash = hashlib.sha256(Path(__file__).read_bytes())
        for name in names:
            version_hash.update(name.encode() + b"\0" + (staging / name).read_bytes())
        asset_version = version_hash.hexdigest()[:16]
        for name in names:
            path = staging / name
            if path.suffix in (".html", ".css", ".js"):
                path.write_text(version_assets(name, path.read_text(), asset_version))
        # Keep the public introduction in every release without making prose
        # changes invalidate the application's asset caches.
        for source_name, name in DOC_FILES.items():
            source = ROOT / source_name
            require(source.is_file() and not source.is_symlink(), f"Missing or symbolic document: {source_name}")
            require(source.resolve().is_relative_to(ROOT), f"Document escapes workspace: {source_name}")
            require(source.stat().st_size <= MAX_FILE_BYTES, f"Document exceeds 25 MiB: {source_name}")
            require(name not in names, f"Document conflicts with application asset: {name}")
            shutil.copyfile(source, staging / name)
            names.append(name)
        names.sort()
        checks = check_references(staging, names)
        for name in names:
            content = (staging / name).read_bytes()
            manifest_files.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
        total = sum(item["bytes"] for item in manifest_files)
        require(total <= MAX_TOTAL_BYTES, "Public release exceeds 100 MiB")
        temporary_zip = OUTPUT / ".ProofPass-public-site.zip.tmp"
        with zipfile.ZipFile(temporary_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for name in names:
                archive.write(staging / name, name)
        with zipfile.ZipFile(temporary_zip) as archive:
            require(archive.namelist() == names and archive.testzip() is None, "ZIP contents failed verification")
        if DIST.exists():
            require(DIST.is_dir() and not DIST.is_symlink(), "Refusing to replace an unexpected distribution path")
            shutil.rmtree(DIST)
        shutil.copytree(staging, DIST)
        temporary_zip.replace(ARCHIVE)
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "assetVersion": asset_version,
        "entry": "index.html -> ./upgrade/",
        "target": "HTTPS static hosting, including GitHub Pages repository subpaths",
        "scope": "Upgraded Sepolia workbench only; historical test assets, legacy demos, and local-chain entry points are excluded",
        "fileCount": len(manifest_files),
        "totalBytes": total,
        "archiveBytes": ARCHIVE.stat().st_size,
        "configs": {folder: {key: config[key] for key in ("mode", "chainId", "deploymentStatus", "registryAddress", "rpcUrl")}
                    for folder, config in configs.items()},
        "validation": checks,
        "files": manifest_files,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return {key: manifest[key] for key in ("fileCount", "totalBytes", "archiveBytes", "validation")}


if __name__ == "__main__":
    print(json.dumps(build(), ensure_ascii=False, indent=2))
