"""月ごとのふりかえりが、**出してはいけないものを出していない**ことを守る。

    python3 python/months_safe_selftest.py
    # 0=通った / 1=出てはいけないものが出ている / 2=数えるものが無い

## 何を守っているのか

この面には2つ、外すと取り返しのつかない決めがある。

| 決め | 出どころ | 外すとどうなるか |
| --- | --- | --- |
| **個人別のコメント数を出さない** | `/monthly-review` 3章 | 嫌がる人が多い。出てしまったら消しても読まれたあと |
| **額つきの順位は、この面だけ** | `docs/island-money.md` 2.1 | 例外が島じゅうに広がる |

どちらも「気をつける」では守れない。**焼き込みに欄が1つ増えるか、
別の面が `content/months.ts` を1行読むだけ**で破れるので、数で見る。

## 見るもの

1. `site/content/months.ts` の `attend` が持つ欄が `n` `d` `i` の3つだけ
   （コメント数の欄が増えていない）
2. 焼くほう（`python/build_monthly.py`）が、コメント数を1つも選んでいない
3. **`@/content/months` を読んでいるのは `app/months/` と
   `components/months/` と `content/directory.ts` だけ。**
   ほかの面が読んだら、そこに額が出せてしまう
4. 焼き込みに実額の欄が無い（持っているのは貢献額だけ）

## 対照（`docs/island-standards.md` §15）

偽の焼き込みと偽の import をこしらえて、**挙げるべきものを挙げ、
挙げてはいけないものを挙げない**ことを先に見る。外れたら、本物を1行も
見ずに 2 で帰る。
"""

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

from ts_read import code_only, objects  # noqa: E402

MONTHS_TS = REPO / "site" / "content" / "months.ts"
BAKER = REPO / "python" / "build_monthly.py"
SITE = REPO / "site"

# `attend` の中に在ってよい欄。**ここに無いものが1つでも増えたら落とす。**
# `d` は「来た日数」で、コメントの数ではない
ATTEND_KEYS = {"n", "d", "i"}

# `content/months.ts` を読んでよいところ。**ここだけ額を出してよい**
# （`docs/island-money.md` 2.1）。
ALLOWED_READERS = ("app/months/", "components/months/", "content/directory.ts", "app/sitemap.ts")

# このうち **額を出さないと約束しているもの**。索引に月を並べるだけで、
# 読むのは `key` だけ。**約束を字で持つのではなく、下で機械に確かめさせる**
# （`app/months/` と `components/months/` は額を出してよい面なので、ここには入れない）。
#
# `sitemap.ts` を足した日（2026-10-14、#872）:
# `/months` の10面が索引から漏れて、配ったあとの見回りが赤くなった。
# 索引に出すには月の `key` が要る。`directory.ts` が同じ形で先に許されていたが、
# **「額を読まない」が人の目でしか見られていなかった。** 機械で見るようにした。
INDEX_ONLY = ("content/directory.ts", "app/sitemap.ts")

# **額と順位の欄。索引に並べるだけの面が触ってはいけないもの。**
#
# 人の数（`people` `newcomers` `once` `taps`）は**入れない**。あれは額ではなく、
# もとから `/months` の索引に「◯本・◯人」と出している（`directory.ts`）。
# 禁じているのは**実額と順位**で、`docs/island-money.md` 2章の表がそれ。
#
# 当てかたは「**何かの点のあと**にこの名前が来る」。`...top.map(` の `...top` を
# `.top` として拾ってしまい、索引を1つ誤って止めた（書いている途中に出た）。
MONEY_KEYS = ("tipTotal", "tips", "rank", "amount", "yen", "prize", "top")
MONEY_RE = re.compile(r"(?<![.\w$])[A-Za-z_$][\w$]*\.(" + "|".join(MONEY_KEYS) + r")\b")

IMPORT_RE = re.compile(r'from\s+"@/content/months"')

# コメント数らしい欄の名前。**焼くほうにも、焼き込みにも出てはいけない**
COUNT_WORDS = re.compile(r"\b(msgs|comments?|commentCount|msgCount)\b")


def attend_keys(src: str) -> set:
    """焼き込みの `attend` に出てくる欄の名前をぜんぶ集める。

    Args:
        src: `months.ts` の中身

    Returns:
        欄の名前
    """
    out = set()
    code = code_only(src)
    for m in re.finditer(r"attend:\s*\[", code):
        i = code.index("[", m.start())
        depth, j = 0, i
        while j < len(code):
            if code[j] == "[":
                depth += 1
            elif code[j] == "]":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        for obj in objects(code[i + 1 : j]):
            out |= {k for k in re.findall(r"([A-Za-z_][\w]*)\s*:", obj)}
    return out


def readers() -> list:
    """`@/content/months` を読んでいる、許していない場所。

    Returns:
        リポジトリからの相対パスの並び
    """
    out = []
    for p in SITE.rglob("*.ts*"):
        if "node_modules" in p.parts or ".next" in str(p):
            continue
        rel = str(p.relative_to(SITE))
        if any(rel.startswith(a) or rel == a for a in ALLOWED_READERS):
            continue
        try:
            if IMPORT_RE.search(p.read_text(encoding="utf-8")):
                out.append(rel)
        except (OSError, UnicodeDecodeError):
            continue
    return sorted(out)


def drill() -> list:
    """偽の字で、数えるほうが挙げる／挙げないを確かめる。"""
    bads = []
    good = 'const X = [{ attend: [{n:"a",d:3,i:"x"}, {n:"b",d:1}] }];'
    if attend_keys(good) != {"n", "d", "i"}:
        bads.append("まともな attend から欄を取れない: %s" % attend_keys(good))
    bad_src = 'const X = [{ attend: [{n:"a",d:3,msgs:120}] }];'
    if "msgs" not in attend_keys(bad_src):
        bads.append("コメント数の欄を見つけられない")
    # 別の欄（streams）の中身を attend として拾っていないか
    mix = 'const X = [{ streams: [{title:"t",p:9}], attend: [{n:"a",d:2}] }];'
    if attend_keys(mix) != {"n", "d"}:
        bads.append("attend の外の欄まで拾っている: %s" % attend_keys(mix))
    if not COUNT_WORDS.search("msgs: 12"):
        bads.append("コメント数らしい名前を見つけられない")
    if COUNT_WORDS.search("denominator: 1"):
        bads.append("関係のない名前を拾っている")
    return bads


def main() -> int:
    bads = drill()
    if bads:
        for b in bads:
            print("NG 対照: %s" % b)
        return 2
    print("対照 OK")

    if not MONTHS_TS.exists():
        print("NG 焼き込みがありません: site/content/months.ts")
        return 2
    src = MONTHS_TS.read_text(encoding="utf-8")
    ng = 0

    keys = attend_keys(src)
    if not keys:
        print("NG attend を1つも読めませんでした（焼き込みの形が変わった？）")
        return 2
    extra = keys - ATTEND_KEYS
    if extra:
        print("NG 出席に、来た日数いがいの欄が増えています: %s" % "・".join(sorted(extra)))
        print("   個人別のコメント数は絶対に出さない（/monthly-review 3章）")
        ng += 1

    # 焼くほうが、コメント数を選んでいないか。SQL も含めて字で見る
    baker = BAKER.read_text(encoding="utf-8")
    picked = [ln.strip() for ln in baker.splitlines()
              if COUNT_WORDS.search(ln) and not ln.lstrip().startswith(("#", "*", '"""'))]
    if picked:
        print("NG 焼くほうがコメント数を選んでいます: %s" % picked[0][:60])
        ng += 1

    bad_readers = readers()
    for r in bad_readers:
        print("NG %s が content/months.ts を読んでいます" % r)
        print("   額つきの順位を出してよいのは月ごとの面だけ（docs/island-money.md 2.1）")
        ng += 1

    # **「索引に並べるだけ」を、字の約束で終わらせない。**
    # `INDEX_ONLY` は月の `key` しか読まないはずなので、額や人数の欄に
    # 触っていないことを機械で見る。触っていたら、そこは索引ではなく面。
    for rel in INDEX_ONLY:
        f = SITE / rel
        if not f.exists():
            print("NG 索引だけのはずの %s が無い（表が古い）" % rel)
            ng += 1
            continue
        body = code_only(f.read_text(encoding="utf-8"))
        touched = sorted(set(MONEY_RE.findall(body)))
        if touched:
            print("NG %s が額・人数の欄に触っています: %s" % (rel, "・".join(touched)))
            print("   索引に月を並べるだけの面は、key のほかを読まない（docs/island-money.md 2.1）")
            ng += 1

    print("出席の欄 %s / months.ts を読んでいる面 %d（許した場所のみ）"
          % ("・".join(sorted(keys)), len(ALLOWED_READERS)))
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
