"""Install the pinned, verified preview archive without sharing stable browser storage."""
import hashlib
import json
import pathlib
import sys
import zipfile

VERSION = "0.9.0-preview.1"
COMMIT = "863a81e4b4d09f9ce75fb1969c5ac9ba90fa2b65"
DIGEST = "1fffbd0b7f17073c7a1540ee828de988a9ec1187674e6aedd86bbc0cb7a21861"
KEYS = {
    "book3d-studio": "book3d-studio-preview-v09",
    "book3d.config": "book3d.preview-v09.config",
    "book3d.renderProfile": "book3d.preview-v09.renderProfile",
}

archive, output = map(pathlib.Path, sys.argv[1:])
if hashlib.sha256(archive.read_bytes()).hexdigest() != DIGEST:
    raise SystemExit("Preview archive SHA256 mismatch")
if output.exists():
    raise SystemExit("Preview output already exists")
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        path = pathlib.PurePosixPath(entry.filename)
        if path.is_absolute() or ".." in path.parts or "\\" in entry.filename:
            raise SystemExit("Invalid preview archive path")
        if (entry.external_attr >> 16) & 0o170000 == 0o120000:
            raise SystemExit("Symlinks are forbidden in preview archive")
    metadata = json.loads(z.read("version.json"))
    if metadata != {"version": VERSION, "commit": COMMIT, "channel": "preview"}:
        raise SystemExit("Preview source metadata mismatch")
    z.extractall(output)

# The release ZIP is immutable. This narrow deployment transform changes
# only the three verified storage identifiers in the compiled JS.
# Fail closed if the pinned artifact does not match those exact literals.
for old, new in KEYS.items():
    files = list(output.rglob("*.js"))
    count = sum(f.read_text(encoding="utf-8").count(json.dumps(old)) for f in files)
    if count != 1:
        raise SystemExit(f"Unexpected storage literal count for {old}: {count}")
    for f in files:
        source = f.read_text(encoding="utf-8")
        if json.dumps(old) in source:
            f.write_text(source.replace(json.dumps(old), json.dumps(new)), encoding="utf-8")
metadata["storageNamespace"] = "preview-v09"
metadata["releaseArchiveSha256"] = DIGEST
(output / "version.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
if not (output / "index.html").is_file():
    raise SystemExit("Missing preview index")
print(f"Installed {VERSION} at {output}, isolated browser storage")
