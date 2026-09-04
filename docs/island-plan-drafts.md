# 企画ページを、視聴者さんと一緒に作る

これからの企画のページ（`/nordic` のようなもの）を、あやと1人で作らなくてよくするための仕組み。

## 流れ

1. 認可された視聴者さんが `/next/new` で骨組みを書く
2. 「保存する」で Firestore の `islandDrafts` に入る
3. 「Claude Code に渡す形で書き出す」で、`site/content/plans.ts` にそのまま貼れる
   TypeScript が出る
4. あやとがそれを Claude Code に渡して、文章と見た目を仕上げる
5. 大きい企画なら `/nordic` のように専用ページを足し、`plan.href` でつなぐ

下書きはそのままでは公開されない。必ず 4 を通る。

## 誰が書けるか

Firestore の `islandUsers/{uid}` に `canDraft: true` が立っている人だけ。
`admin: true` の人は全員ぶんの下書きが読める。

`islandUsers` のドキュメントは、その人が初めてログインしたときに作られる。
`name`（YouTube のチャンネル名）が入っているので、そこから探せる。
`canDraft` はコンソールからしか立たない。API 側には、この値を書き換える口を持たせていない。

## API

| メソッド | パス | 誰が | 何をする |
| --- | --- | --- | --- |
| `GET` | `/island-api/drafts` | canDraft の人 | 自分の下書き一覧（admin は全員ぶん） |
| `POST` | `/island-api/drafts` | canDraft の人 | 下書きを保存する。`id` を送ると上書き |

1日12件まで。1件12KBまで。

## データ

`islandDrafts/{id}`

| 項目 | 中身 |
| --- | --- |
| `uid` | 書いた人 |
| `by` | 書いた人の表示名 |
| `title` `when` `date` `note` `tags` | 企画の基本 |
| `place` | `{ name, area, map }` |
| `about[]` | どんなものかの説明。段落ごと |
| `links[]` | `{ label, href }` 公式サイトなど |
| `photos[]` | `{ src, alt, credit, creditHref }` 借りた写真は出どころ必須 |
| `embeds[]` | `{ kind, id, note }` Instagram / YouTube |
| `createdAt` `updatedAt` | 時刻(ミリ秒) |
