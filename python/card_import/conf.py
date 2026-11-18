"""設定と置き場。

閾値は全部 `config.json`。ここには**読みかたと、値をそう決めた理由**だけを置く。

| 欄 | 意味 | そう決めた理由 |
| --- | --- | --- |
| `read.minSide` | 短辺がこれ未満は「小さすぎる」 | カードは長辺1600で出す。480 未満は3倍以上に伸ばすことになる |
| `read.minFreeGB` | 空きがこれを切ったら scan が止まる（続きから回せる） | 2GB の zip を抱えたまま絵が溜まるので |
| `quality.blurHard` | ラプラシアンの分散（長辺512の灰色）がこれ未満は落とす | 既存のカード写真20枚（12MP に引き伸ばしたもの）は最低 236・中央値 1,500。1600px の写真を半径6でぼかすと 64、JPEG のざらつきだけの真っ平らな絵が 12 前後。512px に縮めて測るので、落ちるのは「ひどいブレ」だけ |
| `quality.blurGood` | ここで「くっきり」の点が満点 | カード写真の中央値の半分ほど（600） |
| `quality.darkHard/Soft` | 明るさの平均（0〜255）。Hard 未満は落とす・Soft までは減点 | 夜景は平均 30〜60 に出る。夜の写真を落としすぎない。明るさを 0.08 倍にした写真は 4.9 |
| `quality.clipHard/Soft` | 白飛び（250以上）の割合 | 雪・曇り空は 0.1〜0.3 に出るので Hard は高め |
| `irrelevant.drop/doubt` | スクショ・書類・レシート・画面の確からしさの和 | drop 以上は落とす・doubt 以上は残して「迷う」に印。カード写真20枚は最大 0.003、画面風・レシート風は 0.99、字の紙は 0.47（迷うに入る。「迷ったら候補に残す」） |
| `group.phash/clip` | 同じ日の中で、pHash の距離が以下か CLIP が以上なら同じ束 | 連写と撮り直しはこの中に入り、構図を変えた写真は入らない |
| `existing.phash/clip` | 既存のカードの写真とこの近さなら落とす | カードの写真はブラウザで webp に縮めてあるので、束より少し緩い |
| `day.good` | 「良い写真」の点 | 1日の枚数はこの数で決まる。カード写真20枚の点は 0.69〜0.99（中央値 0.84）。あやとが選んで貼った写真の下の端に置いた |
| `day.floor` | これ未満の点は、その日に何も無くても出さない | ぼかした写真が 0.55、暗い写真・画面・レシートが 0.31〜0.35 |
| `day.min/sqrtGain/max` | 1日の枚数 = min + floor(sqrtGain × √良い写真の数)、max まで | 良い写真が4倍あっても2倍しか増やさない（緩やかに） |
| `diversity.*` | 同じ日の中で、似た見た目・同じ種類・近い場所を減点 | |
| `ambiguous.margin` | 点が `day.good` の ±margin、または種類が迷う | 一覧画で見るのはここだけ |
| `calib.*` | 認識合わせの答えを、CLIP が `sim` 以上に近い写真へ `gain` まで寄せる | |
"""

from __future__ import annotations

import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ROOT = "/home/ubuntu/cardimport"


def _merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        out[k] = _merge(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return out


def load(override: dict | None = None) -> dict:
    """`config.json` に、渡されたもの（見張りの差し替え）を重ねる。"""
    cfg = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
    extra = os.environ.get("CARD_IMPORT_CONFIG")
    if extra:
        cfg = _merge(cfg, json.loads(Path(extra).read_text(encoding="utf-8")))
    if override:
        cfg = _merge(cfg, override)
    return cfg


def root(path: str | None = None) -> Path:
    r = Path(path or os.environ.get("CARD_IMPORT_ROOT") or DEFAULT_ROOT)
    r.mkdir(parents=True, exist_ok=True)
    return r
