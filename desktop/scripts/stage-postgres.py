"""Stage the Windows server distribution without pgAdmin or development sources."""
import hashlib
import os
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ARCHIVE = "postgresql-16.15-1-windows-x64-binaries.zip"
URL = "https://get.enterprisedb.com/postgresql/" + ARCHIVE
# Cross-checked against ScoopInstaller/Versions' postgresql16 manifest for this release.
SHA256 = "25e6fcdfb8caec38691bf461125e7564508760666f7b8e5dc6a5f0818f58f81e"
BUILD = Path(__file__).resolve().parents[1] / "build"


def verify(path):
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != SHA256:
            raise SystemExit(f"PostgreSQL archive SHA-256 mismatch: {path}")


def main():
    BUILD.mkdir(exist_ok=True)
    archive = Path(sys.argv[1]) if len(sys.argv) == 2 else BUILD / ARCHIVE
    if not archive.exists():
        partial = archive.with_suffix(".part")
        with urllib.request.urlopen(URL, timeout=120) as response, partial.open("wb") as out:
            shutil.copyfileobj(response, out)
        verify(partial)
        os.replace(partial, archive)
    else:
        verify(archive)
    dest = BUILD / "postgres"
    # Only read named runtime directories from the pinned archive. pgAdmin ships Python sources.
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            parts = PurePosixPath(item.filename).parts
            if len(parts) < 2 or parts[0] != "pgsql" or ".." in parts or item.is_dir():
                continue
            file = Path(*parts[1:])
            runtime = parts[1] in {"bin", "lib", "share"}
            notice = len(parts) == 2 and ("license" in parts[1].lower() or "copyright" in parts[1].lower())
            if not (runtime or notice) or file.suffix.lower() in {".py", ".pyc", ".pyo", ".pdb", ".a", ".lib"}:
                continue
            target = dest / file
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(item) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
    for name in ("initdb", "pg_ctl", "postgres", "pg_isready", "pg_dump", "pg_restore", "psql", "createdb"):
        if not (dest / "bin" / (name + ".exe")).is_file():
            raise RuntimeError(f"Missing PostgreSQL tool: {name}")
    print(f"Staged verified PostgreSQL 16.15-1 at {dest}")


if __name__ == "__main__":
    main()
