# あやと島のログインを有効にする

サイト側の実装は入っているが、Firebase と Google Cloud の設定はコンソールでしかできないので、
ここに手順を残しておく。設定しないうちは、ログインを押しても「いま準備中です」と出るだけで、
ログインなしの投稿はこれまで通り使える。

## 1. Firebase でログインを有効にする

Firebase コンソール → **Authentication** → **Sign-in method**

- **Google** を有効にする
- プロジェクトのサポートメールを選ぶ

**Settings → 承認済みドメイン** に次があることを確認する（既定で入っているはず）

- `live-streaming-d3cac.web.app`
- `live-streaming-d3cac.firebaseapp.com`
- `localhost`

## 2. YouTube のスコープを同意画面に足す

Google Cloud コンソール → **APIとサービス** → **OAuth 同意画面** → **データアクセス**

- `https://www.googleapis.com/auth/youtube.readonly` を追加する

このスコープは Google の「機密スコープ」なので、審査を通すまで同意画面の前に
**「このアプリは確認されていません」** という警告が出る。
警告が出ることは前提にしていて、サイト側にも押す前に説明を出している。

未確認のままだと **100人まで** しかログインできない。それを超えそうになったら審査を出す。

## 3. YouTube Data API を有効にする

Google Cloud コンソール → **APIとサービス** → **ライブラリ** → **YouTube Data API v3** を有効にする。
（チャンネル名とアイコンを取るのに使う）

## 何が保存されるか

`islandUsers/{uid}` に次だけを持つ。動画の投稿や変更はできない。

| 項目 | 中身 |
|---|---|
| `name` | YouTube のチャンネル名 |
| `channelId` | YouTube のチャンネルID |
| `photo` | チャンネルのアイコンURL |
| `firstSeenAt` / `lastSeenAt` | 初めて来た日時 / 最後に来た日時 |

ログインすると、企画と付箋に `uid` が入る。
投票の「1人1票」は、ログインしていれば端末をまたいで1票になる。
していなければ、これまで通り端末ごとの1票。
