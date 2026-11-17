"""Rebuild the course handoff without changing historical source evidence."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "course-closeout/package-manifest.json"
OUTPUT = ROOT / "ProofPass_课程结项材料包.zip"
PREFIX = "ProofPass_课程结项"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


historical = json.loads((ROOT / "evidence/delivery-manifest.json").read_text())["files"]
for name, expected in historical.items():
    if sha256(ROOT / name) != expected:
        raise SystemExit(f"Historical file changed: {name}; review before packaging")

paths = {ROOT / name for name in historical}
paths.add(ROOT / "evidence/delivery-manifest.json")
paths.update(ROOT / name for name in (
    "学期项目指导书-区块链与智慧校园.docx", "选题申报书.docx", "三类对象访谈提纲.docx"
))
paths.update(p for p in (ROOT / "course-closeout").rglob("*")
             if p.is_file() and p != MANIFEST and p.name != ".DS_Store"
             and "__pycache__" not in p.parts)
files = {p.relative_to(ROOT).as_posix(): sha256(p) for p in sorted(paths)}
manifest = {
    "builtAt": datetime.now(timezone.utc).isoformat(),
    "archiveRoot": PREFIX,
    "entry": "course-closeout/index.html",
    "scope": "Course handoff; no new on-chain transactions or fieldwork collected.",
    "teamFields": "Members, actual contributions, real interviews and independent student evidence remain for the team to complete.",
    "historicalFilesVerifiedUnchanged": len(historical),
    "selfExcludedFromHashes": "course-closeout/package-manifest.json",
    "files": files,
}
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
with ZipFile(OUTPUT, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted([*files, "course-closeout/package-manifest.json"]):
        archive.write(ROOT / name, f"{PREFIX}/{name}")
with ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None, "ZIP CRC check failed"
    assert len(archive.namelist()) == len(files) + 1
    for name, expected in files.items():
        assert hashlib.sha256(archive.read(f"{PREFIX}/{name}")).hexdigest() == expected, name
print(json.dumps({"path": str(OUTPUT), "files": len(files) + 1,
                  "bytes": OUTPUT.stat().st_size, "sha256": sha256(OUTPUT),
                  "crcAndHashesVerified": True}, ensure_ascii=False, indent=2))
