# インド屋台飯100食 — 材料の受け渡しの型（運営が決めた。材料担当と面担当が同じものを読む）

企画書: GitHub issue Ayato-kosaka/live-streaming#1404 の本文（承認済み）。節の並びと見出しは企画書の5章。

## 置き場

| 何 | 置き場 | 書く人 |
| --- | --- | --- |
| 材料（事実と字。出どころつき） | `python/data/legends/india-street-food/book.json` | 材料担当 |
| 絵の注文書 | `python/data/legends/india-street-food/art_order.json` | 材料担当 → 絵担当 |
| 焼いた中身（面が読む） | `site/content/legends/` の下（名前は面担当が決める。頭に「自動生成。手で直さない」） | 面担当の焼く道具 |
| 描いた絵 | `site/public/legends/india-street-food/`（`dishes/<id>.webp`・`cover.webp`・`map.webp`・`manifest.json`） | 絵担当 |
| 食べた100食（スタンプラリー） | `site/content/legends/` の下の別の表（旅の前は0行） | 面担当が型を作る。埋めるのは旅のあいだ |

## book.json の形

```jsonc
{
  "slug": "india-street-food",
  "updated": "YYYY-MM-DD",
  "meta": {
    "title": "インド屋台飯100食、食べるまで出られません【インド・スリランカ2027】", // 面の <title>（25〜45字）
    "description": "…",            // 80〜160字。いつから・どこを・何食
    "h1": "インド屋台飯100食、食べるまで出られません",
    "sub": "100食目はどこで食べる？",
    "start": "2027-01-15",         // 「ごろ」と出す。面は日付だけ言う（あと◯日は言わない）
    "from": "ムンバイ"
  },
  "rules": ["…"],                  // 3〜5行。#1404 本文3章の決まりを、面の字に
  "quote": { "text": "カレーって言葉じゃ足りひんのよ。", "date": "2026-08-02", "at": "0:25:30", "videoId": "…" },
  "words":   [ { "id": "dal", "name": "ダル", "lead": "…", "body": "…", "src": ["https://…"] } ],              // 12
  "regions": [ { "id": "north", "name": "北インド", "staple": "…", "oil": "…", "dishes": ["<dish id>", "…"], "body": "…", "src": ["…"] } ], // north west east south srilanka の5つ
  "compare": [ { "id": "biryani", "title": "…", "lead": "…", "items": [ { "dish": "<dish id>", "note": "…" } ], "src": ["…"] } ],     // 5
  "dishes": [ {
      "id": "vada-pav", "name": "ヴァダパオ", "local": "Vada pav", "region": "west", "city": "ムンバイ",
      "kind": "屋台",               // 屋台 | 食堂 | 朝ごはん | 甘いもの | 飲みもの
      "star": 3,                    // 1〜3（guide-design.md の★）
      "flags": [],                  // "pork" | "alcohol" | "beef"
      "season": null,               // "冬だけ" | "ラマダンのあいだ" | null
      "lead": "…",                  // 25字前後。guide-copy.md 4章
      "what": "…",                  // 2〜3行。どんな味・どう食べる
      "where": "…",                 // 通り・店（出どころつき）
      "price": { "cur": "INR", "min": 13, "max": 25, "yen_min": 22, "yen_max": 43, "rate_date": "2026-11-23" },
      "src": ["https://…"], "wiki": "https://en.wikipedia.org/wiki/…"
  } ],                              // ちょうど100
  "route":  [ { "city": "ムンバイ", "region": "west", "lat": 19.0760, "lon": 72.8777 } ],   // 企画書8章のア の順。日付は持たない
  "sights": [ { "id": "taj-mahal", "name": "タージ・マハル", "lead": "…", "what": "…", "price": "…", "lat": 0, "lon": 0, "src": ["…"] } ], // 5
  "tips":   [ { "id": "…", "title": "…", "body": "…", "src": ["…"] } ],   // 屋台でお腹を壊さないコツ 4〜6。医療の助言はしない
  "faq":    [ { "q": "…", "a": "…", "src": ["…"] } ]                     // 検索の問い 4〜6（マトンとは、など）
}
```

- `dishes` の `id` は英小文字とハイフン。絵のファイル名・面の錨（`#dish-<id>`）・食べ比べ・地域から引く鍵になる。一度決めたら変えない
- 配分: 西15（ムンバイ・ゴア）・南25・東15・北30・スリランカ15。★3 は全部入れる。ビリヤニは6品（ハイデラバード・ラクナウ・コルカタ・タラッセリー・アンブール・スリランカ）
- 肉は土地のものなら何でも（ゴアのポーク・ヴィンダルー、ケーララのビーフ・フライも）。豚・酒・牛は `flags` で知らせる

## art_order.json の形

```jsonc
{
  "style": "…",   // 100枚を同じ絵柄にするための頼み（字は描かせない・布を敷かない）
  "cover": { "draw": "…" },
  "map":   { "draw": "…", "regions": ["north","west","east","south","srilanka"], "labels": "地名はこちらで焼く" },
  "dishes": [ { "id": "<dish id>", "title": "ヴァダパオ", "draw": "何を描くか1行（器・盛りつけ・色）", "ref": "<wiki か写真の URL>" } ]  // 100
}
```
