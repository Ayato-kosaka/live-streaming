# ナレーションの声を作る（Fish Audio の画面から）

ショートのナレーションを、Fish Audio の声（いまは **Holiday Twist**、#908）で1文ずつ作り、
聞き取り直して原稿どおりに読めているかを確かめ、書き出し（`tools/shorts/render/`）に渡せる形に揃える。

| ファイル | どこで動く | 何をするか |
| --- | --- | --- |
| `fish_web.py` | EC2（`/home/ubuntu/cdp/` に `cdp.py` と並べる） | ログイン済みの Chrome（`~/cdp-fish`）で1文ずつ作り、mp3 と記録（`attempts.jsonl`）を書く |
| `asr_check.py` | EC2（venv の faster-whisper） | 作った声を全部聞き取り直して `asr.json` を書く |
| `collect.py` | 手元 | 1文1ファイルに揃え、48kHz モノラル wav・長さ・音量を出し、原稿と聞き取りを比べて `lines.json` を書く |

API の鍵は使わない（あやとの決定、#908）。画面が自分で送る要求の**返事を CDP で読む**だけで、
Cookie や `authorization` の値には触らない。

## 1. 先に知っておく数（2026-10-15 に実測）

| 項目 | 値 | どう確かめたか |
| --- | --- | --- |
| 無料プランの量 | 毎月 8,000 クレジット（料金ページは「最大 7 分」） | 料金ページ・`wallet/<team>/package` の `balance` |
| **1回に送れる量** | **UTF-8 で 500 バイト**（日本語だけなら約166字） | 入力欄の右下「63 / 500 文字」が UTF-8 のバイト数と一致 |
| **1回に使うクレジット** | **送った字の UTF-8 バイト数そのもの**（秒数ではない） | タスクの `credit_count`: 63バイト→63、132バイト→132、234バイト→234 |
| 1回で何本できるか | **2本**（「追加料金なしで2パターン」）。クレジットが付くのは片方だけ | `POST /task` が2本出て、片方の `credit_count` が 0 |
| 1本にかかる時間 | 3〜10秒 | タスクの `created_at` → `finished_at` |

8,000 クレジットで「7分」は、日本語のナレーションが**1秒あたり約18バイト**（速度 1.1）だから。
**秒数で予算を立てると読み違える。** 予算は `--budget-credits` で、クレジット（＝バイト）で決める。
2026-10-15 の3本（北マケドニアの回）は、A 690（38.4秒）・B 771（40.5秒）・C 561（32.9秒）、合わせて 2,022 クレジット。
かなに直すとバイトは増える（「280」は3バイト、「にひゃくはちじゅう」は27バイト）。

## 2. かなに直す決まり（`caption` と `tts_text`）

1文ごとに字を2つ持つ。

- `caption`: 原稿の字そのまま。字幕に出す
- `tts_text`: 声に渡す字。**読み違えそうなところだけ**かなに直す。**言う中身は `caption` と同じ。語を足さない**

| 直すもの | 例 | なぜ |
| --- | --- | --- |
| 数と単位・助数詞 | 280レク→にひゃくはちじゅうレク、約550円→約ごひゃくごじゅうえん、1席→いっせき、4時間→よじかん、20分→にじゅっぷん | 数字は中国語読み・英語読み・桁の取り違えが起きやすい |
| 「あと」＋かなの数 | あと25分→**あと、**にじゅうごふん | かなだけ続けると「あとに・じゅうごふん」と切られうる。足してよいのは読点だけ |
| 英字・記号 | 1A→いちエー、2番→にばん | 英字は英語読みになる |
| 読みが割れる漢字 | 空いてる→あいてる（すいてる）、鶏→とり（にわとり）、入り→いり（はいり）、行き→ゆき、中→なか、屋→や、車内→しゃない | 文脈で決まる読みは外れることがある |
| そのままでよいもの | プーレ・スタバ・マクド・ケバブ・ミニバン（カタカナ） | カタカナはそのまま読まれる |

迷ったら直す。直したかどうかは聞き取り（4）で確かめる。
実際に使った組（27文）は `lines/yk-by7R7iPA_p1.json`。次の動画もこの形（`key`・`plan`・`n`・`caption`・`tts_text`・`bytes`）で作る。

2026-10-15 の27文は、この決まりで直した字のまま、**1回目で全部が聞き取りと合った**（数・1A・プーレ・スタバ・マクドも）。
ただし Holiday Twist は「1A」「プーレ」をそのままでも読めたかは試していない（直さずに作った文が無い）。

## 3. 作る（EC2）

前提: あやとが EC2 の**既定のプロファイル**で fish.audio にログインしている。
複製は `up("fish", reseed=True)`（`ec2-chrome` スキル 3）。**あやとがリモートデスクトップで操作中は複製しない**
（`xprintidle` が5分以上になってから）。

```bash
E=.claude/skills/ec2-chrome/ec2.py
python3 $E put tools/shorts/voice/fish_web.py /home/ubuntu/cdp/fish_web.py
python3 $E put lines_in.json /home/ubuntu/voice/<動画>-lines_in.json      # [{"key": "A/01", "tts_text": "…"}, …]
```

EC2 で（長いので `nohup` で裏に回す。鍵 `/home/ubuntu/locks/fish-voice` は道具が1文ごとに触る）:

```sh
cd /home/ubuntu/cdp && python3 fish_web.py state --model <声のID>          # ログイン・モデル・速度だけ見る（作らない）
nohup python3 fish_web.py gen --model <声のID> --lines /home/ubuntu/voice/<動画>-lines_in.json \
  --out /home/ubuntu/voice/out/<動画> --budget-credits 4500 > /home/ubuntu/voice/gen.log 2>&1 &
```

- 済んだ文は飛ばすので、止まっても同じ指示をもう一度流せば続きから
- 押しても要求が出なかったとき（窓が邪魔をしたなど）は、タブを作り直して1回だけ押し直す。
  そのときの画面は `err_<文>_<時刻>.jpg` に残る
- **設定は触らない。** 2026-10-15 のアカウントは「Fish Audio S2.1 Pro・速度 1.1・ボリューム 0・ラウドネス正規化 オン・
  テキスト正規化 オフ」（あやとの下書きに入っていたまま）。各テイクの `settings`・`task_params` に残る
- **入力欄はあやとの下書きと同じもの**（`GET/PUT api.fish.audio/tts-draft` でサーバーに保存される）。
  作る前に下書きの返事（`GET /tts-draft`）を写しておき（EC2 の `/home/ubuntu/voice/private/`、git に入れない）、
  終わったら `fish_web.py restore --backup <写し>` で戻す（下書きの話者の ID で開き直してから字を入れるので、声も字も戻る）。
  戻し終えた写しは消す（アカウントの情報が入っている）
- `state` と `gen` の最初に出る `credits_balance` が残りのクレジット（画面が読む `wallet/<team>/package` の返事）

## 4. 聞き取り直す（EC2）

数・名前の読み違いは、聞いてみないと分からない。faster-whisper で聞き取り直す。

```sh
python3 -m venv /home/ubuntu/voice/asr-venv          # 要るなら apt-get install python3.12-venv
/home/ubuntu/voice/asr-venv/bin/pip install faster-whisper
/home/ubuntu/voice/asr-venv/bin/python /home/ubuntu/cdp/asr_check.py /home/ubuntu/voice/out/<動画> \
  /home/ubuntu/voice/out/<動画>/asr.json --model <int8 の large-v3-turbo の置き場>
```

- **t3.medium（メモリ 4GB）では `large-v3-turbo`（float16 の 1.6GB）を int8 で読み込む途中で落ちる**（Killed。
  あやとの Chrome が開いていると空きが 1.3GB しか無い）。int8 に変換済みの ct2
  （`Zoont/faster-whisper-large-v3-turbo-int8-ct2`、0.8GB）なら 12秒で読み込めた
- int8 でも、**`~/cdp-fish` の Chrome を開いたままだと読み込みで落ちる**（Killed）。聞き取りの前に `down("fish")` で閉じる
- faster-whisper 1.2.1 の音声の読み込みは、PyAV 19 では `metadata_errors` の引数で落ちる（`av<15` は wheel が無くビルドで落ちた）。
  `asr_check.py` は PyAV で自分で開いて配列を渡している（EC2 に ffmpeg は無い）
- 2 vCPU で1本あたり約30秒（数秒の音声でも 30秒の窓ぶん計算する）。27文×2テイクで約27分。`nohup` で裏に回す
- **原稿を手がかり（`initial_prompt`）に渡さない。** 聞き取りが原稿に寄って、読み違いが「合っている」に化ける

## 5. 揃える（手元）

```bash
# 音声と記録を1つに固めて持ち帰る（1ファイルずつ get するより速い）
python3 $E run <(echo 'cd /home/ubuntu/voice/out && tar czf /home/ubuntu/voice/<動画>.tgz <動画>') 120
python3 $E get /home/ubuntu/voice/<動画>.tgz <手元>/raw.tgz
python3 tools/shorts/voice/collect.py --lines lines_in.json --attempts raw/attempts.jsonl --asr raw/asr.json \
  --raw raw --out <書き出し先>
```

- 1文に2本（以上）あるテイクのうち、**聞き取りが原稿と合うもの**を選ぶ（同じなら新しい試し・テイク1）。
  人が聞いて選び直すときは `--pick A/04=2.1`（試し2のテイク1）
- 比べるのは字ではなく**読み**（Open JTalk でカタカナにして比べる）。「鶏／とり」「25分／にじゅうごふん」を同じとみなすため。
  同音の書き分け（「鳥」と「とり」）は読みで一致するが、辞書の癖で外れることがある（「1A」はイチアンペア）ので、
  最後の合否は `match` の中身を読んで決める。誤検出と確かめたものは `--accept A/09=理由` で合格にする
  （自動の判定は `match_auto` に残る）
- `lines.json` に、字幕・声に渡した字・ファイル・長さ（ffprobe）・試した回数・聞き取り・合否・音量（EBU R128）が入る
- **音量は測るだけで揃えない。** 揃えるのは書き出しの仕事（ここで触ると二重に掛かる）

## 6. 直す

`match` が `no` の文だけ、`tts_text` を直して作り直す。**1文2回まで**（2回目もまだ違うときだけ3回目）。

```sh
python3 fish_web.py gen ... --only A/04,B/03 --attempt-limit 2
```

`--only` を付けると、済んでいても作り直す。予算（`--budget-credits`）は同じ出力先の記録ぜんぶで数える。
