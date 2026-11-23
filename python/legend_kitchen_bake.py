"""ノマドキッチンカーの面（`/legends/nomad-kitchen-car`）の中身を、材料（book.json）から焼く。

    python3 python/legend_kitchen_bake.py                # 焼く（site/content/legends/nomad-kitchen-car.ts）
    python3 python/legend_kitchen_bake.py --check        # 焼かずに、焼いてあるものが今の材料と同じかだけ（違えば 1）
    python3 python/legend_kitchen_bake.py --say-table    # 案内鳥のひとこと7つが、つまみの格子のどこで出るかの表
    python3 python/legend_kitchen_bake.py --src <置き場> --out y.ts   # 置き場を差し替える（見張りが壊した写しを当てる）

終了コード 0=焼いた（同じだった）/ 1=材料が型に合わない・2つのシミュレーションの最初の値が合わない（何も書かない）・焼き直しが要る / 2=材料が無い。

## 何をするか

面の印の付いた企画（M-8・`docs/adr/0018-upcoming-project-page.md`）のうち、ノマドキッチンカー（#1418）の材料を、
材料担当の確かめ（`python/legend_kitchen_check.py` の `check_dir`）に通してから、面がそのまま並べられる形に焼く。
**確かめが1つでも落ちたら1字も書かない。** 事実の字は足さない。足すのは、面に要るが材料の型に欄の無い字だけで、
どれも企画書と受け渡しの型（`python/data/legends/nomad-kitchen-car/README.md` の「焼く道具が持つ字」）から取る:

- 節の名前と、言い方の決まった添える字（`SECTIONS`・`SUBS`・`SIDE`）。押しどころと表の頭の字（`UI`）
- 本人の言葉の場面（「2026年11月21日の配信 4:01:00」と、その秒）。場面を持たない言葉は日付だけ
- 出どころの名前（URL から読む。**作らない**。インドの道具の `src_of`）と、見た日
- 食べ物ごとの比較の 1個の利益・利益率（値段と材料の幅の真ん中、税抜の値段から）
- 2つのシミュレーション（メニュー開発・1日の収益）の**最初の値**。どちらも同じ1匹（`sim`）から組み、つまみの刻みに丸めた
  同じ値から始める。円は焼かない（`rate.jpy_per_eur` を渡し、つまみで変わるので面が計算する）

## 焼くときに確かめること（落ちたら書かない）

1. 最初の値を、つまみの刻み（売る数 1・材料 0.01・定額 1・割合 1・ガス 0.1）に丸めた同じ値から組む。材料に書いてある
   最初の値（走る距離）も刻みの上に在る
2. 組んだ最初の値が、つまみの min〜max に入る（値段・売る数・材料・出店料・ガス・走る距離）
3. 2つのシミュレーションの最初の結果（1日に残るお金）が同じ
4. `--say-table` で、つまみの格子（生地×中身×値段×場所）を全部回し、7つのひとことがどこで出るかを数えて出す。
   ひとことの分かれ目（`RULE` の crowd・thin）は仮の値で、この表を見てから運営が決める

式は面の部品（メニュー開発・1日の収益）が同じものを TypeScript で持つ。**ここが式の手本**で、部品を作る担当は
`menu()`・`day()`・`say()` と同じ値になるように書く（最初の値は焼いた中身の `sim.start`・`money.start` と突き合わせられる）。
式そのものは面に出さない（`docs/island-standards.md` 6章）。

## インドの道具から借りるもの

小道具（`Bad` `src_of` `jp_date` `seconds` `const_of` `BEGIN` `END` `COUNTDOWN` `ROOT`）は
`python/legend_book_bake.py` から import する（写さない。同じ型を2か所に持たない）。インドの `build()` は100品・地域5・
用語12の形を決め打ちしているので使わない。

材料を直したら焼き直す（毎晩の `rebake.yml` には入れない。人の判断の材料）。焼いたもの
（`site/content/legends/nomad-kitchen-car.ts`）は**手で直さない**。見張りは `python/legend_kitchen_bake_selftest.py`。
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from legend_book_bake import BEGIN, COUNTDOWN, END, ROOT, Bad, const_of, jp_date, seconds, src_of  # noqa: E402
from legend_kitchen_check import check_dir  # noqa: E402

SLUG = "nomad-kitchen-car"
DATA = ROOT / "python" / "data" / "legends" / SLUG
OUT = ROOT / "site" / "content" / "legends" / f"{SLUG}.ts"

#: 節の名前と並び（README「焼く道具が持つ字」・#1418 本文2章の並び・あやとの答え）。目次の札と節の見出しが読む
SECTIONS = {
    "route": "ルートと景色",
    "menu": "売るもの",
    "look": "外装と内装",
    "money": "収益構造",
    "issues": "課題一覧",
    "shorts": "30日後にキッチンカーでヨーロッパを一周する人",
}
#: 下のほうに畳む3つ（あやとの言葉の「判断ログ」をそのまま。運営の決め 2026-11-23 の7）
FOLDS = {"progress": "ここまでの進み具合", "log": "判断ログ", "facts": "確かめた事実"}
#: 節の中の見出し（README の表。依頼の言葉のまま。作った呼び名を付けない）
SUBS = {
    "menuSim": "メニュー開発のシミュレーション",
    "foodCompare": "食べ物ごとの比較",
    "dress": "キッチンカーの着せ替え",
    "vehicles": "車の候補の比較",
    "photos": "キッチンカーの実際の様子",
    "daySim": "1日の収益のシミュレーション",
    "big": "特大課題",
    "life": "暮らしの課題",
}
#: 添える字（README の表）。課題の日付は材料の `issues.as_of` から組む
SIDE = {
    "route": "イメージ。まだ決まっていない",
    "shorts": "こんな形でやりたいと思っている（2026年11月）",
    "money": "目安",
}
#: 押しどころ・表の頭・小さな印の字（#1418 本文2章とあやとの答えの言葉から）。面の .tsx には字を書かない
UI = {
    "updated": "最終更新",
    "back": "島へ戻る",
    "sources": "出どころ",
    "drew": "写真ではない絵は、あやと島案内鳥が AI で描いたもの。",
    "more": "もっと見る",
    "est": "見立て",
    "picks": ["", "第1", "第2", "第3"],
    "why": "なぜたい焼きか",
    "ideas": "メニューの候補",
    "viewer": "視聴者さんの案",
    "compare": {
        "food": "品",
        "perHour": "1時間に焼ける数",
        "price": "値段",
        "cost": "1個の材料",
        "profit": "1個の利益",
        "rate": "利益率",
        "machine": "機材",
        "energy": "電気・ガス",
    },
    "interior": "内装",
    "vehicle": {"price": "値段の幅", "license": "免許", "good": "よいところ", "weak": "弱いところ"},
    "place": {"hours": "売る時間", "fee": "出店料", "buyers": "1日に来て買う人"},
    "star": "★",
    "buyOrRent": "買うか借りるか",
    "premise": "前提と出どころ",
    "notIn": "車・保険・泊まる所は入っていない",
    "fixed": {
        "lpg_eur_kg": "ガス（LPG）",
        "diesel_eur_l": "軽油",
        "l_per_100km": "燃費",
        "power_eur_kwh": "電気",
        "vat_pct": "付加価値税",
    },
    "yen": "円に直す率",
    "work": "ヨーロッパで働くための手続き",
    "permit": "食べ物を売る許可",
    "japan": "日本",
    "europe": "ヨーロッパ",
    "stars": "難しさ",
    "who": {"ayato": "あやと", "guide": "あやと島案内鳥"},
    "log": {"date": "日付", "what": "何を", "why": "なぜ", "by": "決めた人"},
}
#: 固定の値の単位（面は「€0.34/kWh」の形で出す）
UNITS = {"lpg_eur_kg": "€/kg", "diesel_eur_l": "€/L", "l_per_100km": "L/100km", "power_eur_kwh": "€/kWh", "vat_pct": "%"}
#: 許可の重さ（README: 面は「軽い・中・重い・いちばん重い」と出す）
WEIGHT = {"light": "軽い", "mid": "中", "heavy": "重い", "heaviest": "いちばん重い"}
#: 暮らしの課題のグループの並び（材料の型の10）
GROUPS = ["トイレ", "水", "電気", "ガス", "寝床", "車", "免許", "道", "暮らし", "店"]
#: 確かめた事実のグループ（README の型の字）
FACT_GROUPS = {"permit": "食べ物を売る許可", "japan": "日本の許可", "vehicle": "車と免許", "gear": "機材",
               "market": "場所と値段", "life": "暮らし"}
#: 初めての人が買いたくなるか（3段。build-plan ⑤。字は guide-copy 6・7章を当てた）
BUY = ["買いたくなる", "迷う人もいる", "手に取りにくい"]

#: つまみの刻み（README の `money.inputs`。組んだ最初の値はこの上に乗る）
STEP_OF = {"price": "price", "sold": "sold", "cost": "cost", "fee-fixed": "fee-fixed", "fee-share": "fee-share",
           "gas-kg": "gas-kg", "drive-km": "drive-km"}

#: 式の決め（build-plan ⑤。**crowd と thin は仮**。`--say-table` を見てから運営が決める）
RULE = {
    "known": {"1": 0.55, "2": 0.8, "3": 1.0},  # 中身の分かりやすさ（known の平均）→ 係数。あいだは線で結ぶ
    "power": 1.5,                              # （値段の真ん中 ÷ 値段）の何乗か
    "appeal": [0.3, 1.3],                      # 買いたくなる係数の下と上
    "buy": [0.9, 0.7],                         # 3段の分かれ目（これ以上で1段目・2段目）
    "crowd": 0.5,                              # 需要が焼ける上限のこれ未満なら「人が足りない」
    "thin": 0.6,                               # 利益率がこれ未満なら「利益が薄い」
}
#: ひとことの順（先に当たったもの1つ。build-plan ⑤）
SAY_ORDER = ["loss", "bake", "crowd", "pricey", "unknown", "thin", "good"]

LICENSE = re.compile(r"^(CC0|Public domain|PD[- ].*|CC BY(-SA)? \d\.\d)$")


# ---------------------------------------------------------------------------- 小道具


def mid(r) -> float:
    return (r[0] + r[1]) / 2


def places_of(step: float) -> int:
    t = repr(float(step))
    return len(t.split(".")[1].rstrip("0")) if "." in t else 0


def snap(x: float, step: float) -> float:
    """刻みに丸める（四捨五入。0.5 は上へ）。字の誤差を残さないよう、刻みの桁で切る"""
    n = math.floor(x / step + 0.5 + 1e-9)
    return round(n * step, places_of(step))


def on_grid(x: float, step: float) -> bool:
    return abs(snap(x, step) - x) < 1e-9


def num(x: float, d: int) -> str:
    return f"{x:,.{d}f}"


def rng_text(r, pre: str = "", post: str = "") -> str:
    """幅の字（「€2.0〜3.6」「40〜60匹」）。桁は2つの数の細かいほうにそろえる。同じ数なら1つ"""
    d = max(places_of(r[0]), places_of(r[1]))
    a, b = num(r[0], d), num(r[1], d)
    return f"{pre}{a}{post}" if a == b else f"{pre}{a}〜{b}{post}"


def value_text(v: float, unit: str) -> str:
    """固定の値の字（「€0.34/kWh」「10L/100km」「7%」）"""
    t = num(v, places_of(v))
    if unit.startswith("€"):
        return f"€{t}{unit[1:]}"
    return f"{t}{unit}"


def srcs_of(xs, seen: str, where: str) -> list[dict]:
    """出どころの並び（空でよい。数の出どころは材料の確かめが `src` か `est` で見ている）。名前は URL から読む"""
    if not isinstance(xs, list):
        raise Bad(f"{where}: src が配列でない")
    out, got = [], set()
    for x in xs:
        if x in got:
            continue
        got.add(x)
        out.append({**src_of(x), "seen": seen})
    return out


def scene(s: dict | None, where: str, date: str | None = None) -> dict:
    """本人の言葉の場面。場面（videoId・at）が在れば「◯年◯月◯日の配信 H:MM:SS」とその秒、無ければ日付だけ"""
    s = s or {}
    day = s.get("date") or date
    if not isinstance(day, str):
        raise Bad(f"{where}: 日付が無い")
    out = {"date": day, "cite": f"{jp_date(day)}の配信"}
    if s.get("videoId") or s.get("at"):
        out.update(v=s["videoId"], t=seconds(s["at"]), cite=f"{jp_date(day)}の配信 {s['at']}")
    return out


# ---------------------------------------------------------------------------- 式（面の部品の手本）


class Model:
    """材料から引く表（食べ物・中身・場所・固定の値・つまみ）"""

    def __init__(self, b: dict):
        self.foods = {f["id"]: f for f in b["foods"]}
        self.fills = {f["id"]: f for f in b["fillings"]}
        self.places = {p["id"]: p for p in b["places"]}
        self.fixed = {k: v["value"] for k, v in b["money"]["fixed"].items()}
        self.inputs = {x["id"]: x for x in b["money"]["inputs"]}
        self.drive_km = self.inputs["drive-km"]["default"]

    def step(self, key: str) -> float:
        return self.inputs[STEP_OF[key]]["step"]


def known_factor(ks: list[int]) -> float:
    k = sum(ks) / len(ks)
    lo = max(1, min(2, math.floor(k)))
    a, b = RULE["known"][str(lo)], RULE["known"][str(lo + 1)]
    return a + (b - a) * (k - lo)


def menu(m: Model, food: str, fills: list[str], price: float, place: str) -> dict:
    """メニュー開発のシミュレーション1回。値は面に出す丸めの前（面は表示のときに丸める）"""
    f, pl, fx = m.foods[food], m.places[place], m.fixed
    cost = snap(mid(f["dough"]) + sum(mid(m.fills[i]["cost"]) for i in fills) + mid(f["pack"]), m.step("cost"))
    net = price / (1 + fx["vat_pct"] / 100)
    margin = net - cost
    per_hour = mid(f["per_hour"])
    cap = math.floor(per_hour * pl["hours"] + 1e-9)
    ks = [m.fills[i]["known"] for i in fills]
    lo, hi = RULE["appeal"]
    appeal = min(hi, max(lo, known_factor(ks) * (mid(f["price"]) / price) ** RULE["power"]))
    demand = math.floor(mid(pl["buyers"]) * appeal + 0.5)
    sold = min(cap, demand)
    fee = pl["fee"]
    if fee["kind"] == "fixed":
        fee_fixed, fee_share = snap(mid(fee["eur"]), m.step("fee-fixed")), 0
    else:
        fee_fixed, fee_share = 0, snap(mid(fee["pct"]), m.step("fee-share"))
    gas_kg = snap(f["energy"]["gas_kg_h"] * pl["hours"], m.step("gas-kg"))
    elec = f["energy"]["elec_kw"] * pl["hours"] * fx["power_eur_kwh"]
    fuel = m.drive_km * fx["l_per_100km"] / 100 * fx["diesel_eur_l"]
    left = sold * margin - fee_fixed - sold * price * fee_share / 100 - gas_kg * fx["lpg_eur_kg"] - elec - fuel
    b1, b2 = RULE["buy"]
    return {
        "cost": cost, "net": net, "margin": margin, "rate": margin / net if net else 0.0,
        "perHour": per_hour, "cap": cap, "appeal": appeal, "demand": demand, "sold": sold,
        "feeFixed": fee_fixed, "feeShare": fee_share, "gasKg": gas_kg, "elec": elec, "fuel": fuel, "left": left,
        "buy": 0 if appeal >= b1 else 1 if appeal >= b2 else 2,
        "unknown": min(ks) == 1, "pricey": price > f["price"][1] + 1e-9,
    }


def say(r: dict) -> str:
    """案内鳥のひとこと（先に当たったもの1つ）"""
    if r["left"] < 0:
        return "loss"
    if r["sold"] == r["cap"] and r["cap"] < r["demand"]:
        return "bake"
    if r["demand"] < r["cap"] * RULE["crowd"]:
        return "crowd"
    if r["pricey"]:
        return "pricey"
    if r["unknown"]:
        return "unknown"
    if r["rate"] < RULE["thin"]:
        return "thin"
    return "good"


def day(m: Model, v: dict, elec: float) -> float:
    """1日の収益のシミュレーション1回（つまみ7つと、最初の1匹の電気）。**1日まで**（日数を掛けない）"""
    fx = m.fixed
    net = v["price"] / (1 + fx["vat_pct"] / 100)
    return (net * v["sold"] - v["cost"] * v["sold"] - v["fee-fixed"] - v["price"] * v["sold"] * v["fee-share"] / 100
            - v["gas-kg"] * fx["lpg_eur_kg"] - elec - v["drive-km"] * fx["l_per_100km"] / 100 * fx["diesel_eur_l"])


def starts(b: dict) -> tuple[dict, dict, dict]:
    """2つのシミュレーションの最初の値を、同じ1匹（`sim`）から組む。合わなければ Bad（何も書かない）"""
    m = Model(b)
    s = b["sim"]
    r = menu(m, s["food"], s["fillings"], s["price"], s["place"])
    v = {"price": s["price"], "sold": r["sold"], "cost": r["cost"], "fee-fixed": r["feeFixed"],
         "fee-share": r["feeShare"], "gas-kg": r["gasKg"], "drive-km": m.drive_km}
    bad = []
    for k, x in v.items():
        i = m.inputs[k]
        if not on_grid(x, i["step"]):
            bad.append(f"{k} の最初の値 {x} が刻み {i['step']} の上に無い")
        if not i["min"] - 1e-9 <= x <= i["max"] + 1e-9:
            bad.append(f"{k} の最初の値 {x} がつまみの幅（{i['min']}〜{i['max']}）に入らない")
    left = day(m, v, r["elec"])
    if abs(left - r["left"]) > 1e-6:
        bad.append(f"2つの最初の結果が違う（メニュー開発 {r['left']:.4f}・1日の収益 {left:.4f}）")
    if bad:
        raise Bad("2つのシミュレーションの最初の値: " + "／".join(bad))
    return r, v, {"elec": r["elec"], "left": left}


def same_left(a: float, b: float) -> bool:
    """2つの最初の結果が同じか（見張りが対照に当てる）"""
    return abs(a - b) <= 1e-6


# ---------------------------------------------------------------------------- 焼く


def photos_of(base: Path) -> list[dict]:
    """本物のキッチンカーの写真（絵担当の `photos.json`。無ければ空＝面は節ごと出さない）"""
    p = base / "photos.json"
    if not p.exists():
        return []
    try:
        rows = json.loads(p.read_text(encoding="utf-8"))
    except ValueError as e:
        raise Bad(f"photos.json: 読めない（{e}）") from None
    if not isinstance(rows, list) or not 4 <= len(rows) <= 8:
        raise Bad(f"photos.json: 4〜8枚の並びでない（{len(rows) if isinstance(rows, list) else '並びでない'}）")
    out = []
    for k, x in enumerate(rows):
        w = f"photos.json[{k}]"
        need = {"id", "img", "thumb", "page", "by", "lic", "alt", "w", "h", "checked"}
        if not isinstance(x, dict) or need - x.keys():
            raise Bad(f"{w}: 欄が足りない（{sorted(need - (x.keys() if isinstance(x, dict) else set()))}）")
        for u in ("img", "thumb"):
            if not str(x[u]).startswith("https://upload.wikimedia.org/"):
                raise Bad(f"{w}: {u} が Commons の縮尺の URL でない")
        if not str(x["page"]).startswith("https://commons.wikimedia.org/wiki/File:"):
            raise Bad(f"{w}: page が Commons の File: の頁でない")
        if not LICENSE.match(str(x["lic"])):
            raise Bad(f"{w}: 許諾が public domain・CC0・CC BY・CC BY-SA でない（{x['lic']!r}）")
        if not (isinstance(x["w"], int) and isinstance(x["h"], int) and x["w"] > 0 and x["h"] > 0):
            raise Bad(f"{w}: w・h が正の整数でない")
        out.append({"id": x["id"], "img": x["img"], "thumb": x["thumb"], "page": x["page"], "by": x["by"], "lic": x["lic"],
                    "alt": x["alt"], "w": x["w"], "h": x["h"]})
    return out


def build(b: dict, photos: list[dict]) -> dict:
    seen = b["seen"]
    S = lambda xs, where, day=None: srcs_of(xs, day or seen, where)  # noqa: E731
    m = b["meta"]
    r_start, v_start, d_start = starts(b)
    vat = b["money"]["fixed"]["vat_pct"]["value"]

    foods, compare = [], []
    for f in b["foods"]:
        net = mid(f["price"]) / (1 + vat / 100)
        profit = net - mid(f["cost"])
        e = f["energy"]
        est = set(f["est"])
        compare.append({"id": f["id"], "name": f["name"], "cells": [
            {"text": rng_text(f["per_hour"], post=f["unit"]), "est": "per_hour" in est},
            {"text": rng_text(f["price"], pre="€"), "est": "price" in est},
            {"text": rng_text(f["cost"], pre="€"), "est": "cost" in est},
            {"text": f"€{profit:.2f}", "est": False},
            {"text": f"{round(profit / net * 100)}%", "est": False},
            {"text": f["machine"], "est": False},
            {"text": e["text"] if e["text"].startswith(e["kind"]) else f"{e['kind']} {e['text']}", "est": "gas_kg_h" in est},
        ]})
        foods.append({
            "id": f["id"], "name": f["name"], "unit": f["unit"], "sim": f["sim"],
            "perHour": f["per_hour"], "price": f["price"], "cost": f["cost"], "dough": f["dough"], "pack": f["pack"],
            "machine": f["machine"],
            "energy": {"kind": e["kind"], "text": e["text"], "gasKgH": e["gas_kg_h"], "elecKw": e["elec_kw"]},
            "profit": round(profit, 2), "rate": round(profit / net, 2),
            "src": S(f["src"], f"foods[{f['id']}]", f.get("seen")), "est": f["est"],
        })
    fills = [{
        "id": x["id"], "name": x["name"], "foods": x["foods"], "cost": x["cost"], "known": x["known"],
        "allergens": x["allergens"], "flags": x["flags"], "from": x["from"],
        **({"sprite": x["sprite"]} if x.get("sprite") else {}),
        "src": S(x["src"], f"fillings[{x['id']}]", x.get("seen")), "est": x["est"],
    } for x in b["fillings"]]
    places = [{
        "id": x["id"], "name": x["name"], "fee": x["fee"], "hours": x["hours"], "buyers": x["buyers"],
        "rows": [
            {"label": UI["place"]["hours"], "text": f"{num(x['hours'], places_of(x['hours']))}時間", "est": "hours" in x["est"]},
            {"label": UI["place"]["fee"], "est": "fee" in x["est"],
             "text": rng_text(x["fee"]["eur"], pre="€", post="/日") if x["fee"]["kind"] == "fixed" else f"売上の{rng_text(x['fee']['pct'], post='%')}"},
            {"label": UI["place"]["buyers"], "text": rng_text(x["buyers"], post="人"), "est": "buyers" in x["est"]},
        ],
        "src": S(x["src"], f"places[{x['id']}]", x.get("seen")), "est": x["est"],
    } for x in b["places"]]
    sim = b["sim"]
    inputs = [{
        "id": x["id"], "min": x["min"], "max": x["max"], "step": x["step"], "default": v_start[x["id"]],
        "src": S(x["src"], f"money.inputs[{x['id']}]", x.get("seen")), "est": x["est"],
    } for x in b["money"]["inputs"]]
    fixed = {k: {"value": v["value"], "unit": UNITS[k], "src": S(v["src"], f"money.fixed.{k}", v.get("seen")),
                 "est": "value" in (v.get("est") or [])} for k, v in b["money"]["fixed"].items()}
    premise = [{"label": UI["fixed"][k], "text": value_text(v["value"], v["unit"]), "est": v["est"]} for k, v in fixed.items()]
    rt = b["rate"]
    premise.append({"label": UI["yen"], "text": f"{num(rt['jpy_per_eur'], places_of(rt['jpy_per_eur']))}円/€（{jp_date(rt['date'])}）",
                    "est": False})

    iss = b["issues"]
    pm = iss["permit"]
    life = [{"name": g, "items": [{
        "n": x["n"], "id": x["id"], "title": x["title"], "plan": x["plan"], "stars": x["stars"],
        "src": S(x.get("src") or [], f"issues.life[{x['id']}]", x.get("seen")),
    } for x in iss["life"] if x["group"] == g]} for g in GROUPS]
    if sum(len(g["items"]) for g in life) != len(iss["life"]):
        raise Bad("issues.life: グループの外の行がある")

    looks = [{
        "id": x["id"], "name": x["name"], "lead": x["lead"],
        "interior": {"name": x["interior"]["name"], "lead": x["interior"]["lead"],
                     "src": S(x["interior"].get("src") or [], f"looks[{x['id']}].interior", x["interior"].get("seen"))},
    } for x in b["looks"]]
    vehicles = []
    for x in b["vehicles"]:
        said = x.get("said")
        vehicles.append({
            "id": x["id"], "name": x["name"],
            **({"said": {"text": said["text"], **scene(said, f"vehicles[{x['id']}].said")}} if said else {}),
            "price": x["price"], "priceText": rng_text(x["price"]["eur"], pre="€"),
            "license": x["license"], "good": x["good"], "weak": x["weak"], "first": x["first"],
            "src": S(x["src"], f"vehicles[{x['id']}]", x.get("seen")),
        })
    buy_or_rent = [{"id": x["id"], "name": x["name"], "price": x["price"], "good": x["good"], "weak": x["weak"],
                    "src": S(x["src"], f"buy_or_rent[{x['id']}]", x.get("seen"))} for x in b["buy_or_rent"]]

    facts = []
    for g, name in FACT_GROUPS.items():
        items = [{"id": x["id"], "text": x["text"], "src": S(x["src"], f"facts[{x['id']}]", x.get("seen")),
                  **({"grade": x["grade"]} if x.get("grade") else {})} for x in b["facts"] if x["group"] == g]
        if items:
            facts.append({"id": g, "name": name, "items": items})

    route = b["route"]
    as_of = f"{jp_date(iss['as_of'])}時点の考え"
    out = {
        "slug": SLUG,
        "updated": b["updated"],
        "meta": {k: m[k] for k in ("title", "description", "h1", "sub", "goal")},
        "sections": SECTIONS,
        "folds": FOLDS,
        "subs": SUBS,
        "side": {**SIDE, "issues": as_of},
        "ui": UI,
        "toc": [
            {"id": "route", "label": SECTIONS["route"], "note": f"{len(b['views'])}か所"},
            {"id": "menu", "label": SECTIONS["menu"], "note": f"{len(b['foods'])}品"},
            {"id": "look", "label": SECTIONS["look"], "note": f"{len(b['looks'])}組"},
            {"id": "money", "label": SECTIONS["money"], "note": SIDE["money"]},
            {"id": "issues", "label": SECTIONS["issues"], "note": f"{len(iss['life'])}件"},
            {"id": "shorts", "label": SECTIONS["shorts"], "note": f"{len(b['shorts']['titles'])}本"},
        ],
        "cover": {
            "quotes": [{"id": q["id"], "text": q["text"], **scene(q, f"cover.quotes[{q['id']}]")} for q in b["cover"]["quotes"]],
            "note": b["cover"]["note"],
        },
        "route": {
            "plan": {"text": route["plan"]["text"], "date": route["plan"]["date"]},
            "line": route["line"],
            "labels": route["labels"],
            "countries": route["countries"],
        },
        "views": [{"id": v["id"], "title": v["title"], "lead": v["lead"], "scene": scene(v["said"], f"views[{v['id']}]")}
                  for v in b["views"]],
        "menu": {
            "picks": [{"rank": p["rank"], "food": p["food"]} for p in b["menu"]["picks"]],
            "decided": scene(b["menu"]["decided"], "menu.decided"),
            "why": [{"id": x["id"], "text": x["text"]} for x in b["menu"]["why"]],
            "ideas": [{"id": x["id"], "name": x["name"], "food": x["food"], "from": x["from"], "date": x["date"]}
                      for x in b["menu"]["ideas"]],
        },
        "foods": foods,
        "compare": {"head": [UI["compare"][k] for k in ("food", "perHour", "price", "cost", "profit", "rate", "machine", "energy")],
                    "rows": compare},
        "fillings": fills,
        "places": places,
        "sim": {
            "food": sim["food"], "fillings": sim["fillings"], "price": sim["price"], "place": sim["place"],
            "say": sim["say"], "sayOrder": SAY_ORDER, "buy": BUY, "rule": RULE, "driveKm": Model(b).drive_km,
            "start": {k: round(r_start[k], 4) if isinstance(r_start[k], float) else r_start[k]
                      for k in ("cost", "net", "margin", "rate", "perHour", "cap", "appeal", "demand", "sold",
                                "feeFixed", "feeShare", "gasKg", "elec", "fuel", "left", "buy")}
                     | {"say": say(r_start)},
        },
        "looks": looks,
        "vehicles": vehicles,
        "buyOrRent": buy_or_rent,
        "photos": photos,
        "money": {
            "inputs": inputs,
            "fixed": fixed,
            "premise": premise,
            "start": {"elec": round(d_start["elec"], 4), "left": round(d_start["left"], 4)},
        },
        "rate": {"jpyPerEur": b["rate"]["jpy_per_eur"], "date": b["rate"]["date"], "src": S(b["rate"]["src"], "rate")},
        "issues": {
            "asOf": iss["as_of"],
            "work": {"title": UI["work"], "text": iss["work"]["text"]},
            "permit": {
                "title": UI["permit"],
                "plan": {"text": pm["plan"]["text"], "date": pm["plan"]["date"]},
                "layers": [{"id": x["id"], "title": x["title"], "text": x["text"], "weight": x["weight"],
                            "weightLabel": WEIGHT[x["weight"]], "src": S(x["src"], f"issues.permit.layers[{x['id']}]", x.get("seen"))}
                           for x in pm["layers"]],
                "compare": [{"id": x["id"], "label": x["label"], "japan": x["japan"], "europe": x["europe"],
                             "src": S(x["src"], f"issues.permit.compare[{x['id']}]", x.get("seen"))} for x in pm["compare"]],
            },
            "life": life,
        },
        "shorts": list(b["shorts"]["titles"]),
        "progress": [{"date": x["date"], "title": x["title"], "body": x["body"],
                      **({"scene": scene(x["said"], f"progress[{x['date']}]", x["date"])} if x.get("said") else {})}
                     for x in b["progress"]],
        "log": [{"date": x["date"], "what": x["what"], "why": x["why"], "by": x["by"]} for x in b["log"]],
        "facts": facts,
    }
    blob = json.dumps(out, ensure_ascii=False)
    hit = COUNTDOWN.search(blob)
    if hit:
        raise Bad(f"「{hit.group(0)}」がある。面は「あと◯日」を言わない")
    out["hash"] = hashlib.sha1(blob.encode("utf-8")).hexdigest()[:12]
    return out


def render(g: dict) -> str:
    return (
        "/**\n"
        f" * ノマドキッチンカーの面（`/legends/{SLUG}`）の中身。**自動生成。手で直さない。元は book.json**\n"
        " *\n"
        f" * 元は `python/data/legends/{SLUG}/book.json`（材料担当）と `photos.json`（絵担当）。直すならそちらを直して、\n"
        " * `python3 python/legend_kitchen_bake.py` で焼き直す。節の名前・添える字・押しどころの字・2つのシミュレーションの\n"
        " * 最初の値は焼く道具が持つ（式の手本も焼く道具の `menu()`・`day()`・`say()`）。\n"
        " */\n"
        'import type { KitchenCarBook } from "./kitchenCarTypes";\n\n'
        f"export const {const_of(SLUG)}: KitchenCarBook = {BEGIN}\n"
        + json.dumps(g, ensure_ascii=False, indent=1)
        + f"\n{END};\n"
    )


def report(g: dict) -> str:
    s = g["sim"]["start"]
    return (f"  最初の1匹: 原価 €{s['cost']}・税抜 €{s['net']:.2f}・係数 {s['appeal']:.2f}・売れる {s['sold']}/{s['cap']}"
            f"・1日に残る €{s['left']:.2f}（ひとこと {s['say']}）\n"
            f"  景色 {len(g['views'])}・食べ物 {len(g['foods'])}・中身 {len(g['fillings'])}・場所 {len(g['places'])}・"
            f"外装 {len(g['looks'])}組・車 {len(g['vehicles'])}・課題 {sum(len(x['items']) for x in g['issues']['life'])}件・"
            f"題 {len(g['shorts'])}本・事実 {sum(len(x['items']) for x in g['facts'])}・写真 {len(g['photos'])}")


def say_table(b: dict) -> tuple[str, dict]:
    """つまみの格子（生地×中身×値段×場所）を全部回し、ひとこと7つがどこで出るか。表の字と数を返す"""
    m = Model(b)
    pr = m.inputs["price"]
    n = round((pr["max"] - pr["min"]) / pr["step"])
    prices = [round(pr["min"] + i * pr["step"], places_of(pr["step"])) for i in range(n + 1)]
    count = {k: 0 for k in SAY_ORDER}
    by_place = {k: {p: 0 for p in m.places} for k in SAY_ORDER}
    by_food = {k: {f: 0 for f in m.foods if m.foods[f]["sim"]} for k in SAY_ORDER}
    span = {k: [math.inf, -math.inf] for k in SAY_ORDER}
    total = 0
    for food, f in m.foods.items():
        if not f["sim"]:
            continue
        ok = [i for i, x in m.fills.items() if food in x["foods"]]
        combos = [c for k in (1, 2, 3) for c in itertools.combinations(ok, k)]
        for c in combos:
            for p in prices:
                for pl in m.places:
                    k = say(menu(m, food, list(c), p, pl))
                    count[k] += 1
                    by_place[k][pl] += 1
                    by_food[k][food] += 1
                    span[k] = [min(span[k][0], p), max(span[k][1], p)]
                    total += 1
    names = {p: m.places[p]["name"] for p in m.places}
    fnames = {f: m.foods[f]["name"] for f in by_food["good"]}
    head = ["ひとこと", "出た数", "割合", *[names[p] for p in m.places], *[fnames[f] for f in fnames], "値段の幅（€）"]
    lines = ["| " + " | ".join(head) + " |", "| " + " | ".join("---" for _ in head) + " |"]
    for k in SAY_ORDER:
        lo, hi = span[k]
        lines.append("| " + " | ".join([
            k, f"{count[k]:,}", f"{count[k] / total:.1%}" if total else "0",
            *[f"{by_place[k][p]:,}" for p in m.places], *[f"{by_food[k][f]:,}" for f in fnames],
            f"{lo}〜{hi}" if count[k] else "—",
        ]) + " |")
    note = (f"格子 {total:,}（生地 {len(fnames)}×中身1〜3の組×値段 {len(prices)}×場所 {len(m.places)}）。"
            f"分かれ目は仮: crowd={RULE['crowd']}（需要 < 焼ける上限×これ）・thin={RULE['thin']}（利益率 < これ）")
    return "\n".join(lines) + "\n\n" + note, count


# ---------------------------------------------------------------------------- 口


def load(base: Path) -> dict:
    """材料を確かめて読む。確かめが落ちたら Bad（字は確かめの道具の落ちた所）"""
    c, book = check_dir(base)
    if book is None:
        raise Bad(c.errors[0] if c.errors else "book.json が読めない")
    if c.errors:
        raise Bad(f"材料の確かめ（legend_kitchen_check.py）が {len(c.errors)}件 落ちた: " + "／".join(c.errors[:5]))
    return book


def bake(*, src: Path | None = None, out: Path | None = None, check: bool = False, table: bool = False) -> int:
    base = src or DATA
    if base.is_file():
        base = base.parent
    out = out or OUT
    if not (base / "book.json").exists():
        print(f"::error::材料が無い: {base / 'book.json'}")
        return 2
    try:
        b = load(base)
        g = build(b, photos_of(base))
    except Bad as e:
        print(f"::error::{base.name}: {e}")
        print("止めた。何も書いていない")
        return 1
    if table:
        text_, _ = say_table(b)
        print(text_)
    text_ = render(g)
    rel = out.relative_to(ROOT) if out.is_relative_to(ROOT) else out
    if check:
        same = out.exists() and out.read_text(encoding="utf-8") == text_
        print(("同じ" if same else "焼き直しが要る") + f": {rel}")
        print(report(g))
        return 0 if same else 1
    if table:
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text_, encoding="utf-8")
    print(f"焼いた: {rel}（指紋 {g['hash']}・材料の日付 {g['updated']}）")
    print(report(g))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが同じかだけ見る")
    ap.add_argument("--say-table", action="store_true", help="ひとこと7つが、つまみの格子のどこで出るかの表を出す（焼かない）")
    ap.add_argument("--src", type=Path, help="材料の置き場（既定は python/data/legends/nomad-kitchen-car/）")
    ap.add_argument("--out", type=Path, help="焼く先（既定は site/content/legends/nomad-kitchen-car.ts）")
    a = ap.parse_args(argv)
    return bake(src=a.src, out=a.out, check=a.check, table=a.say_table)


if __name__ == "__main__":
    sys.exit(main())
