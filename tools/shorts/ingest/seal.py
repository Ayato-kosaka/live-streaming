"""出来たものを丸ごと暗号化して、平文の manifest.json を添える。

    python3 tools/shorts/ingest/seal.py ITEM.json OUT_DIR DEST_DIR [STAGES.json]

## 形

    DEST_DIR/
      manifest.json      平文。何がいくつ・何バイト・成否だけ（題名も字幕も入れない）
      key.enc            RSA-OAEP(SHA-256) で包んだ 80バイト = AES鍵32 + HMAC鍵32 + IV16
      payload.enc        OUT_DIR を tar.gz にして AES-256-CBC で暗号化したもの
                         （45MB を超えたら payload.enc.000, .001 … に切る）

**なぜ鍵を毎回作るか。** 依頼ファイルに入っている公開鍵は、統括のセッションが
その場で作ったもの。秘密鍵はそのセッションの外に出ない。AES の鍵は1本ごとに
乱数で作り、その公開鍵でだけ包むので、リポジトリが公開でも中身は読めない。

**なぜ HMAC を足すか。** `openssl enc` は CBC しか持たず（GCM が無い）、
暗号文が途中で壊れても黙って壊れた tar を返す。復号する側が最初に
HMAC を確かめて、壊れたものを展開しないようにする。

**鍵の値はどこにも書かない。** openssl へは標準入力で渡し、ファイルに置かない。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import now_iso, read_json, write_json  # noqa: E402

# 1ファイルの上限。GitHub は 100MB を超えるファイルの push を断り、50MB を超えると
# 警告を出す。45MB で切れば、clips のように数百MB になる回でもどのファイルも
# 警告の手前に収まる。切った順につなぐと元の暗号文に戻る（HMAC はつないだ全体に掛ける）
PART = 45 * 1024 * 1024
FORMAT = "shorts-ingest/1"
# mp4 は gzip でほとんど縮まない。clips で圧縮に時間をかけても運ぶ量は変わらない
LEVEL = {"clips": 1}


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def seal(item: dict, out: Path, dest: Path, stages: dict | None = None) -> dict:
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("payload.enc*"):
        old.unlink()
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        pub = td / "pub.pem"
        pub.write_text(item["pubkey"], encoding="utf-8")
        tgz = td / "payload.tar.gz"
        n_files = plain = 0
        with tarfile.open(tgz, "w:gz", compresslevel=LEVEL.get(item.get("mode"), 6)) as tf:
            for p in sorted(out.rglob("*")):
                if p.is_file():
                    tf.add(p, arcname=str(p.relative_to(out)))
                    n_files += 1
                    plain += p.stat().st_size
        key, mkey, iv = os.urandom(32), os.urandom(32), os.urandom(16)
        enc = td / "payload.enc"
        # 鍵は `-K` に渡すしかない（openssl enc の作り）。ランナーは使い捨てで、
        # この行は `set -x` もログにも出さない
        subprocess.run(["openssl", "enc", "-aes-256-cbc", "-K", key.hex(), "-iv", iv.hex(),
                        "-in", str(tgz), "-out", str(enc)], check=True)
        # 1MB ずつ読んで掛ける。clips は暗号文が数百MB になり、丸ごと読むとその分メモリを食う
        hm = hmac.new(mkey, digestmod=hashlib.sha256)
        with open(enc, "rb") as f:
            for b in iter(lambda: f.read(1 << 20), b""):
                hm.update(b)
        mac = hm.hexdigest()
        wrapped = subprocess.run(
            ["openssl", "pkeyutl", "-encrypt", "-pubin", "-inkey", str(pub),
             "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256",
             "-pkeyopt", "rsa_mgf1_md:sha256"],
            input=key + mkey + iv, capture_output=True, check=True).stdout
        (dest / "key.enc").write_bytes(wrapped)
        data_len = enc.stat().st_size
        parts = []
        if data_len <= PART:
            target = dest / "payload.enc"
            enc.replace(target)
            parts.append(target)
        else:
            with open(enc, "rb") as f:
                i = 0
                while True:
                    b = f.read(PART)
                    if not b:
                        break
                    target = dest / f"payload.enc.{i:03d}"
                    target.write_bytes(b)
                    parts.append(target)
                    i += 1
        tgz_len = tgz.stat().st_size
    st = stages or {}
    status_words = list((st.get("stages") or {}).values())
    status = ("failed" if not status_words or all(s == "failed" for s in status_words)
              or (st.get("stages") or {}).get("download") == "failed"
              else "partial" if "failed" in status_words else "ok")
    man = {
        "format": FORMAT,
        "key": item["key"], "mode": item["mode"], "dest": item.get("dest"),
        "video": item.get("video"), "channel": item.get("channel"),
        "request": item.get("req"),
        "status": status,
        "stages": st.get("stages") or {},
        "counts": dict(st.get("counts") or {}, files=n_files),
        "bytes": {"plain": plain, "tar_gz": tgz_len, "encrypted": data_len},
        "encrypted_files": [{"name": p.name, "bytes": p.stat().st_size, "sha256": sha256_file(p)}
                            for p in parts],
        "hmac_sha256": mac,
        "pubkey_sha256": item.get("pubkey_sha256"),
        "cipher": "AES-256-CBC (openssl enc -K/-iv) + HMAC-SHA256 over ciphertext; "
                  "keys (32+32+16 bytes) wrapped with RSA-OAEP(SHA-256, MGF1-SHA-256) in key.enc",
        "run": os.environ.get("RUN_URL"),
        "created_at": now_iso(),
    }
    write_json(dest / "manifest.json", man)
    return man


def main() -> int:
    item = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out, dest = Path(sys.argv[2]), Path(sys.argv[3])
    stages = read_json(Path(sys.argv[4])) if len(sys.argv) > 4 else None
    out.mkdir(parents=True, exist_ok=True)
    man = seal(item, out, dest, stages)
    # ログには manifest の数だけ（平文に置いてよいものと同じ）
    print(json.dumps({k: man[k] for k in ("key", "status", "stages", "counts", "bytes")},
                     ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
