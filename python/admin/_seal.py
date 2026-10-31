"""手元と Actions のあいだで、**公開の場を通しても読まれないもの**を渡す。

Actions のログも注記も**誰でも読める**。それでも渡したいものがあるとき
（オーナーの表の実額・口の札）は、**手元で作った使い捨ての鍵の公開鍵だけ**を
入力で渡し、返りはそれで封をしてもらう。ほどける秘密鍵は実行のどこにも行かない。

包み方は `tips_sealed` が 2026-10-11 から本番で使っているものと同じ
（openssl はランナーにも手元にも最初から入っている）:

    中身        … AES-256-CBC（pbkdf2・salt あり）
    その合言葉  … RSA-OAEP（SHA-256）で、渡された公開鍵に向けて

## 返りは**注記**（`::notice::`）で受ける

ログそのものは置き場（Azure Blob）から配られるので、**この箱の gh は
口から読めない**（`refusing a redirect to results-receiver…`）。
注記だけは `check-runs/{id}/annotations` から読めるので、封をしたものは
`chunks()` で切って1行ずつ注記に出す。

**1行の長さは控えめにする。** 注記は1行で切れるし、GitHub は1つの step に
出た注記を種類ごとに10件までしか見せない。700字 × 10 = 7,000字が上限、
という前提で作る（札2枚なら4〜5行で収まる）。
"""

import base64
import os
import re
import subprocess
import tempfile

#: 注記の頭に付ける目印。`join()` はこれが付いた行だけを拾う
MARK = "SEALED-PART"

#: 1行に載せる字数。注記1件ぶん
CHUNK = 700


def keypair() -> tuple[bytes, str]:
    """使い捨ての鍵を手元で1組作る。

    Returns:
        (秘密鍵の PEM, 公開鍵 SPKI DER の base64)。
        公開鍵のほうだけを入力に載せる
    """
    with tempfile.TemporaryDirectory() as t:
        priv = os.path.join(t, "priv.pem")
        subprocess.run(
            ["openssl", "genpkey", "-algorithm", "RSA",
             "-pkeyopt", "rsa_keygen_bits:3072", "-out", priv],
            check=True, capture_output=True,
        )
        der = subprocess.run(
            ["openssl", "pkey", "-in", priv, "-pubout", "-outform", "DER"],
            check=True, capture_output=True,
        ).stdout
        with open(priv, "rb") as f:
            pem = f.read()
    return pem, base64.b64encode(der).decode()


def seal(plain: bytes, pubkey_b64: str) -> dict:
    """公開鍵で包む。**秘密鍵はここに無い。**"""
    with tempfile.TemporaryDirectory() as t:
        pub = os.path.join(t, "pub.der")
        with open(pub, "wb") as f:
            f.write(base64.b64decode(pubkey_b64))
        secret = os.urandom(32).hex().encode()
        pw = os.path.join(t, "pw")
        with open(pw, "wb") as f:
            f.write(secret)
        body = subprocess.run(
            ["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-salt",
             "-pass", "file:" + pw],
            input=plain, capture_output=True, check=True,
        ).stdout
        key = subprocess.run(
            ["openssl", "pkeyutl", "-encrypt", "-pubin", "-keyform", "DER",
             "-inkey", pub, "-pkeyopt", "rsa_padding_mode:oaep",
             "-pkeyopt", "rsa_oaep_md:sha256"],
            input=secret, capture_output=True, check=True,
        ).stdout
    return {"key": base64.b64encode(key).decode(),
            "body": base64.b64encode(body).decode()}


def unseal(env: dict, priv_pem: bytes) -> bytes:
    """`seal()` が作ったものを、手元の秘密鍵でほどく。"""
    with tempfile.TemporaryDirectory() as t:
        priv = os.path.join(t, "priv.pem")
        with open(priv, "wb") as f:
            f.write(priv_pem)
        os.chmod(priv, 0o600)
        secret = subprocess.run(
            ["openssl", "pkeyutl", "-decrypt", "-inkey", priv,
             "-pkeyopt", "rsa_padding_mode:oaep",
             "-pkeyopt", "rsa_oaep_md:sha256"],
            input=base64.b64decode(env["key"]), capture_output=True, check=True,
        ).stdout
        pw = os.path.join(t, "pw")
        with open(pw, "wb") as f:
            f.write(secret)
        return subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2",
             "-pass", "file:" + pw],
            input=base64.b64decode(env["body"]), capture_output=True, check=True,
        ).stdout


def pack(env: dict) -> str:
    """封を**空白を1つも含まない1本の字**にする。

    JSON で載せない。理由は2つあって、どちらも実測で踏んでいる。

    - 注記は `_fs.notice()` が空白を畳む。`{"key": "…"` のような
      空白混じりは、戻したときに元と1バイト違う
    - 伏せ字に1文字の `{` `}` が混ざっていると、GitHub がそこを `***` に
      する（`tips_sealed` の docstring。2026-10-11 の実測）

    base64 は `.` を使わないので、区切りに使っても中身とぶつからない。
    """
    return env["key"] + "." + env["body"]


def unpack(text: str) -> dict:
    """`pack()` の逆。"""
    if text.count(".") != 1:
        raise SystemExit("封の形が違います（区切りの . が1つではない）")
    key, body = text.split(".")
    return {"key": key, "body": body}


def chunks(text: str, size: int = CHUNK) -> list:
    """注記1行ぶんに切る。**何分の何かを自分で名乗る。**

    注記は並び順を約束していないし、10件で打ち切られることもある。
    番号を振っておけば、`join()` が「足りない」と言える。
    """
    parts = [text[i:i + size] for i in range(0, len(text), size)] or [""]
    n = len(parts)
    return [f"{MARK} {i}/{n} {p}" for i, p in enumerate(parts, 1)]


def join(lines) -> str:
    """`chunks()` で切ったものを、注記の山から拾って戻す。

    Args:
        lines: 注記の本文（目印の付いていない行が混ざっていてよい）

    Returns:
        元の字

    Raises:
        SystemExit: 1行も無い／番号が欠けている／総数が食い違う
    """
    got = {}
    total = None
    pat = re.compile(rf"{MARK}\s+(\d+)/(\d+)\s+(\S*)")
    for line in lines:
        m = pat.search(line or "")
        if not m:
            continue
        i, n, body = int(m.group(1)), int(m.group(2)), m.group(3)
        if total is not None and n != total:
            raise SystemExit(f"封の総数が食い違います（{total} と {n}）")
        total = n
        got[i] = body
    if total is None:
        raise SystemExit("封が1行も見つかりませんでした")
    missing = [i for i in range(1, total + 1) if i not in got]
    if missing:
        # **足りないまま繋がない。** 繋ぐとほどけずに落ちるが、
        # 落ちた理由が「鍵が違う」に見えて、注記の打ち切りに気づけない
        raise SystemExit(f"封の {total} 行のうち {len(missing)} 行が足りません")
    return "".join(got[i] for i in range(1, total + 1))
