# ショートの下見を渡す（あやとがスマホで開ける URL）

書き出したショートを、あやとがスマホで開いて見られる URL にする。**7日で見られなくなる。**
1つのページに動画を並べる（題・長さ・`<video playsinline controls>`）。

**なぜこの形か。** 前は EC2 の Chrome からあやとの Google ドライブへ上げていて、作業箱 → EC2 の
転送（SSM の小分け）で3本95MB に約35分かかった。あやと（2026-10-16）「ドライブに置く →
Firebase storage か GCS に置いたら？ パブリックバケット作っても良いし」「動画のレビューは
非公開に無理にする必要ないので issue に書いて良い」。

## 使い方（作業箱で）

```bash
# 置く。ページの URL と、1本ずつの URL を --urls のファイルに書く
python3 tools/shorts/preview/put.py up --name yk-v3b \
  --key <スクラッチパッド>/keys/ref_private.pem \
  --out <スクラッチパッド>/preview --urls <スクラッチパッド>/preview/v3b_urls.txt \
  <書き出した>/B.mp4

# 投稿が済んだら消す（消さなくても7日で見られなくなる）
python3 tools/shorts/preview/put.py delete --name yk-v3b \
  --key <スクラッチパッド>/keys/ref_private.pem --out <スクラッチパッド>/preview
```

- `--name` は英数字と `. _ -`。**同じ名前でもう一度 up すると、新しいチャンネル（新しい URL）になる**
  （前のは7日で消える。急ぐなら delete）
- 題は同じフォルダの `post_<名前>.json`（投稿文）の YouTube の題を拾う。
  無ければ `--label B.mp4=題`。ページの見出しは `--title`
- 結果は `--out/preview/<name>/` に開く（`urls.json`・`run.json`・スマホ幅で撮った `phone.jpg`・`timing.json`）。
  `--out` と `--urls` はリポジトリの外にしか置けない
- URL は **issue（Gate 2 の提出）に貼ってよい**。リポジトリには平文で入れない
- master に入ったあとは `--via dispatch` で workflow_dispatch から起こせる（既定は依頼ファイルを作業枝に積む形）

## 流れ（いまの置き場は Firebase Hosting のプレビューチャンネル）

```
作業箱 put.py                     作業枝 claude/…                     Actions shorts_preview.yml（serve.py → host.py）
 依頼を積む ───────────────→ shorts/preview/<name>.json ─push→ 起きる。RSA 鍵をその場で作る
                               shorts/.work/preview/<name>/inbox.json ←─ 公開鍵を置く（firebase-tools を入れ始める）
 動画＋meta.json を包んで積む ─→ …/<name>/upload/（45MB ずつ）  ──→ 開く・sha256 を依頼と突き合わせる
                                                                       一時の場所に動画と index.html だけ置いて
                                                                       hosting:channel:deploy sp-<乱数> --expires 7d
                                                                       落とし直し sha256・Range 206・スマホ幅で再生
                               …/<name>/manifest.json ほか   ←── URL をこちらの公開鍵で包んで置く
                                                                       （同じ commit で依頼・inbox・upload を下ろす）
 開いて URL を書く・暗号文を下ろす
```

- **本番のサイト（live チャンネル）には触らない。** 配るのは `hosting:channel:deploy` だけで、
  チャンネル名は `sp-` ＋乱数20桁の形しか通さない。本番の `firebase.json`・`public/` は使わず、
  ランナーの一時の場所（リポジトリの外）に置いた設定（noindex・no-referrer の見出しだけ）で配る
- **動画を包む鍵はランナーがその場で作り、ランナーと一緒に消える。** 長く生きる鍵で公開の
  履歴を守らない。作業箱からは Hosting にも artifact にも届かず、届くのは git だけなのでこの形
- 作業箱からは `*.web.app` に届かない（proxy が 403）。だから**落とし直しの sha256・範囲の要求（206）・
  スマホ幅（390px）のヘッドレスの Google Chrome での再生は、配った直後にランナーで見る**
  （`playcheck.mjs`。Playwright の Chromium は H.264 を再生できないので使わない）。
  ランナーには和文の書体が無いので、`phone.jpg` の見出しは豆腐になる（スマホでは出る）
- ログに出すのは名前・数・秒・成否だけ。firebase-tools の出力はファイルにだけ受ける。artifact にはしない

### かかった時間（2026-10-16 の実測。v2 の3本・96MB）

| 段 | 起動からの秒 |
| --- | --- |
| 依頼を積む | 3 |
| ランナーが起きて受け取り口を開く | 26 |
| 包む（3秒）・積む（14秒） | 42 |
| ランナーが受け取る → 配る（7秒）→ 落とし直す（9秒）→ スマホ幅で再生（11秒）→ 結果が戻る | 82 |
| URL を書いて暗号文を下ろす | **85** |

前の道（EC2 経由でドライブ）は約35分。小さな動画1本（1.6MB）で95秒（ランナーが起きるのに49秒）。
ランナーが起きるまでの秒は混み具合で変わる。

## 片づけ

- チャンネルは7日で Hosting が消す。急ぐときは `put.py delete`（依頼にはチャンネル名を書かず、
  sha256 で指す。ランナーが一覧から探して消し、ページが 404 になるまで見る）
- 作業枝の依頼・受け取り口・荷物・結果は、put.py とランナーが使い終わったその場で下ろす。
  途中で止めたときは `shorts/preview/<name>.json` と `shorts/.work/preview/<name>/` を git rm する

## GCS の道（付与待ち）

本命は非公開バケットの署名付き URL（`gcs.py`。PUT 1時間・GET/DELETE 7日、作業箱から直に上げる。
`put.py up --place gcs`）。**2026-10-16 に測ったら、Actions のサービスアカウントは Storage に何もできなかった**:

```
プロジェクト live-streaming-d3cac      storage.buckets.create ✕  storage.buckets.list ✕
live-streaming-d3cac.firebasestorage.app  buckets.get ○  objects.create / get / delete / list ✕
```

あやとが Cloud Shell で次の2行を打てば、コードを変えずに動く（バケットを作り、そのバケットに
だけ管理者を付ける。寿命14日の決まりはサービスアカウントが最初に使うときに足す）:

```bash
gcloud storage buckets create gs://live-streaming-d3cac-shorts-preview --project=live-streaming-d3cac --location=us-central1 --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
gcloud storage buckets add-iam-policy-binding gs://live-streaming-d3cac-shorts-preview --member=serviceAccount:github-action-live-streaming@live-streaming-d3cac.iam.gserviceaccount.com --role=roles/storage.admin
```

付与のあと確かめること: `put.py up --place gcs` で、`gcs.py` が権限を聞いて ○ がそろう・
14日の寿命が付く・作業箱から上げて GET で落とし直した sha256 が一致・**署名なしの道が 403**。
第2段（Actions で並べて書き出す）の素材の受け渡しもこのバケットを使う。

## 落ちたときの見方

1. `put.py` の最後の行（`!! …`）。Actions で落ちたときは暗号化した `run.json` の `error` を開いて出す
2. Actions の「ショートの下見を置く」のログ（何の段で落ちたか・権限の ○/✕）
3. 受け取り口が来ない → ランナーが起きていない（混み具合）か、依頼の形で落ちた（ログの1行目）
4. `firebase hosting:channel:deploy が通らなかった` → ランナーの一時の場所の `deploy.log`
   （ログには出していない。直すときは host.py で中身の要るところだけ出す）
