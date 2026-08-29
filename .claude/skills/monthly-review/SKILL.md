---
name: monthly-review
description: 月末配信「1ヶ月ふりかえり授賞式」ページを作る手順。YouTube配信のチャット(BigQuery)を集計・通読して、OBSブラウザソース1枚の授賞式画面を public/ に作成し、Firebase Hosting へデプロイする。トリガー語:「月末配信」「月末集計」「ふりかえり授賞式」「monthly review」。
---

# 月末配信ふりかえり授賞式スキル

前月末〜当月末の配信を1枚のOBS画面で表彰式にする。参考実装: `public/202608_monthly_review.html`(2026年8月版・完成形)。新しい月は `public/2026MM_monthly_review.html` として新規作成する(過去ページは上書きしない)。

## 1. ワークフロー

1. **期間確定**: ユーザーと対象期間を確認(例: 7/25〜8/30)。JSTで扱い、BigQueryにはUTCで渡す(JST 0:00 = 前日15:00 UTC)。
2. **データ取得**(§2): 統計・全コメント・出席を最小クエリで取得。
3. **通読・選定**: 全コメントをローカルで通読し、各コーナーの候補(名言・おもしろ・流行語・盛り上がり等)を選ぶ。
4. **企画会議**(毎回必須): AskUserQuestion で **コーナー構成とデザインテーマの案を複数出して決める**。固定3コーナー(§3〜§5)は必ず入れる。過去の採用実績: 今月の軌跡タイムライン / 初見さんいらっしゃい / 常連さん表彰 / どの配信でしょうクイズ / 盛り上がりの瞬間TOP3 / 流行語大賞 / 名言・いい話アワード / おもしろコメント大賞(部門賞+グランプリ) / 投げ銭ありがとう / Claudeからの手紙 / エンディング。
5. **実装**(§6) → **検証**(§7) → **デプロイ**(§8) → view/ctrl のURLを報告。

## 2. BigQuery の知見

- プロジェクト `live-streaming-d3cac`、データセット `youtube_chat`。`chat_messages`(パーティション: published_at、`event_type` は TEXT/PAID等)、`videos`。
- フィルタ: `event_type = 'TEXT'` かつ bot除外 `author_name != '@あやとグルメアプリ'`。
- **課金最小方針**: 1クエリ≒10MB最小課金(1円未満)だが回数を増やさない。コメント本文は一括ダンプしてローカルで分析。MCPは約3000行で切れるので `video_id` 範囲などで分割。
- **正確性が要る集計はBQ集約1発で確定させる**(ローカルダンプは行落ちすることがある)。出席は `STRING_AGG(DISTINCT video_id)` を著者ごとに取るのが確実。
- 表示名は `ARRAY_AGG(author_name ORDER BY published_at DESC LIMIT 1)[OFFSET(0)]`(最新名)。

## 3. 固定コーナー①: 出席リスナー表彰

- **日毎集計**: 同じ日の複数配信はまとめて1日。その日どれかに1コメントでもあれば出席。
- **深夜0時跨ぎ**: 0時過ぎに再開した続き枠は前日の配信日に帰属させる。
- **コメント消失日**(YouTube側バグで全コメントが消えた配信日)は、当時すでに来ていた人(初出席がその日以前)を出席扱いにする。
- 集計後の日(作成日前後)は分母から除外。分母=期間内で配信があった日数。
- 表示: 皆勤賞の表彰台(アイコン大+「出席 N/N日」+ひとこと) → 出席日数リスト(日数のみ)。注記に集計ルールを明記。
- **個人別コメント数は絶対に表示しない**(嫌がる人が多い)。「コメント王」等の賞も作らない。出席も発言も多い人は名言・クイズなどのコーナーで紹介してあげる。極端にコメントが少ない人は無理に扱わない。

## 4. 固定コーナー②: 投げ銭ランキング

- ユーザーから `name / score(円) / avatar URL / unit(絵文字)` のテーブルと背景画像URLをもらう(Doneru等の集計はユーザー側作業)。
- 演出: 4位以下リスト → 3位 → 2位 → ドラムロール → 1位+紙吹雪 → 「合計 N円 ありがとうございました🙏」。金額は表示してよい。同額は同順位タイ。
- 背景画像はこのシーンだけ差し替え(data URI埋め込み・半透明ベールで可読性確保)。

## 5. 固定コーナー③: Claudeからの手紙

- 全コメントを読んだClaudeからの所感を段落ごとにステップ表示。その月の固有名詞・出来事・リスナーの言葉を織り込む。締めの署名は「AIアシスタント Claude より」。

## 6. 実装の技術要件

- `public/2026MM_monthly_review.html` **単一ファイル・実行時の外部依存なし**(オフラインでも開ける。例外はFirestore同期時のgstatic SDKのみ)。
- シーン/ステップ進行機構: `SCENES`配列+`[data-step]`表示制御+進行ドット+紙吹雪+`?auto=秒`の自動進行。クリック/Enterで進む、←で戻る。1920×1080前提、横スクロール禁止。
- **アバター**: YouTubeチャンネルページの og:image をビルド時に取得し `=s176-c-rj`(JPEG)でdata URI埋め込み。取れない人はイニシャルの丸にフォールバック。投げ銭アバターはユーザー提供URLから取得。巨大なdata URIはEditツールでなくnodeスクリプトのプレースホルダ置換で注入する。
- **Firestore同期**: `?role=ctrl`(スマホコントローラ) / `?role=view`(OBS側)。firebaseConfig は焼き込み済みの参考実装からコピー。ドキュメントは `monthlyReview/2026MM-<ランダム>` を月ごとに新規発行。
- **ctrlの教訓(重要)**: ①グローバルの pointerdown/contextmenu ハンドラは ctrl では登録しない(ボタンclickと二重発火し1タップで複数進むバグになる) ②自分の書き込みエコー(`snap.metadata.hasPendingWrites`)と手元より古い `ts` のスナップショットは無視 ③ボタンに `touch-action: manipulation`。
- コンテンツポリシー: 引用はほぼ原文(絵文字コードは実絵文字に)、名前は「〜さん」付け、`escapeHtml` を必ず通す。

## 7. 検証

- Playwright(`playwright-core` + `executablePath: '/opt/pw-browsers/chromium-*/chrome-linux/chrome'`, `args: ['--no-sandbox']`)+ `python3 -m http.server`。
- 確認項目: 全シーンのスクリーンショット / Enter連打で最後まで→Backspaceで先頭まで戻る / 横スクロールなし / **ctrlで5タップ=ちょうど5進む** / 個人コメント数が出ていないことをgrep。
- Firestoreはこの環境のブラウザから外部接続できないため、**RESTで書込/読出スモーク**(`https://firestore.googleapis.com/v1/projects/live-streaming-d3cac/databases/(default)/documents/monthlyReview/<docId>?key=<apiKey>`)。最後に scene:0/step:0 に初期化しておく。

## 8. デプロイ・運用

- GitHub Actions `firebase-hosting-deploy-prod.yml` を workflow_dispatch で起動(`npm run build:web` が public/ を dist にコピーする)。masterマージ後に master で起動するのが基本。
- 反映確認: `https://live-streaming-d3cac.web.app/2026MM_monthly_review.html` が200+新版内容。
- ユーザーへの案内: OBS用 `?role=view` / 操作スマホ用 `?role=ctrl` / 1台運用は無指定。数字キーでコーナー頭出し(リハーサル用)。
