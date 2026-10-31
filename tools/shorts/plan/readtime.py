"""原稿が尺に収まるかを、実際に読ませて測る。

    python3 tools/shorts/plan/readtime.py <原稿.txt>   # 1行1文。空行と # の行は飛ばす

## なぜ字数で見積もらないか

字数÷速さで見積もると、漢字の多い文ほど短く出る。2026-10-15 に同じ原稿で比べたら、
「7.5字/秒」の見積もり 24秒に対して、読ませた長さは 43秒だった。だから**読ませて測る。**

## 物差し（Open JTalk の速さ）

本番の声（Fish Audio、#908）が決まるまでは、無料の Open JTalk で測る。
参考にした西園寺さんのショート（`_IhNSDR6eVk`）のナレーションは、話した時間が 56.6秒で、
同じ文を Open JTalk の 1.0倍で読ませると 75.1秒だった。つまり **あの速さは約1.33倍。**
30〜50代向けに少し落として、**1.15倍を想定の速さ**にしている。1.0倍は「遅めに読まれた場合」の上限。

要るもの（Ubuntu）: `apt-get install open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001`
"""
import os
import re
import subprocess
import sys
import tempfile
import wave

VOICE = "/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice"
DIC = "/var/lib/mecab/dic/open-jtalk/naist-jdic"
EXPECTED = 1.15   # 想定の速さ（上の説明）


def jtalk(text: str, speed: float = 1.0) -> float:
    """text を Open JTalk で読ませた秒。"""
    with tempfile.TemporaryDirectory() as d:
        i, o = os.path.join(d, "i.txt"), os.path.join(d, "o.wav")
        with open(i, "w") as f:
            f.write(text)
        subprocess.run(["open_jtalk", "-x", DIC, "-m", VOICE, "-r", str(speed), "-ow", o, i],
                       check=True, capture_output=True)
        with wave.open(o) as w:
            return w.getnframes() / w.getframerate()


def chars(text: str) -> int:
    """記号を除いた字数（原稿の量を比べるためだけに使う）。"""
    return len(re.sub(r"[\s「」『』（）()…、。！？!?・ー〜]", "", text))


def lines(path: str) -> list[str]:
    return [l.strip() for l in open(path) if l.strip() and not l.lstrip().startswith("#")]


def main() -> int:
    ls = lines(sys.argv[1])
    tot = {1.0: 0.0, EXPECTED: 0.0}
    for l in ls:
        a, b = jtalk(l, EXPECTED), jtalk(l, 1.0)
        tot[EXPECTED] += a
        tot[1.0] += b
        print(f"{chars(l):3d}字  想定 {a:4.1f}s / 遅め {b:4.1f}s  {l}")
    print(f"計 {len(ls)}文 {sum(chars(l) for l in ls)}字  "
          f"想定({EXPECTED}倍) {tot[EXPECTED]:.1f}秒 / 遅め(1.0倍) {tot[1.0]:.1f}秒")
    return 0


if __name__ == "__main__":
    sys.exit(main())
