# 本編集の担当への頼む文（雛形）

`tools/shorts/script/brief.py edit --episode <回の置き場> --pattern <案> --about "…" --scratch <スクラッチパッド> -o <scratch>/brief_edit.md`
が、下の線より後ろの `{{…}}` を埋めて1枚にする。まとめ役は**この1枚のパスだけ**を本編集の担当に渡す。
**手引き（`SKILL.md`・`production.md`・`render/README.md`・`voice/README.md`・`ec2-chrome`）の全文と、道具のソースは渡さない**
（呼び出しの形・帳面の画・音・投稿の項目・企画の節のどこを読むかは、1枚に入っている）。

## なぜこの形か（#1011）

フランス周遊 A の本編集の担当（2026-10-21、213回の呼び出し）は、最初の5分で手引きと道具のソース（`remote.py`・`build_edit.py`・
企画の道具）を読み、文脈が 7万 → 21万トークンに膨らんだ。以後の約200回の呼び出しが毎回それを読み直し、キャッシュ読み 0.66億の
約4割がこの「最初に読んだもの」だった。ソースを読んだのは、使いかたが1か所にまとまっていなかったから。原稿の段
（`writer_prompt.md`・`critic_prompt.md`）と同じく、本編集の段もこの1枚に寄せる。

**道具の引数を変えたら、この雛形の呼び出しも同じコミットで直す。** `brief.py edit` は、雛形に書いた道具（`*.py`）が在るか・
同じ行の `--引数` がその道具に在るかを見て、無ければ1枚を作らずに 2 で止まる（古い呼び出しを渡さない）。

<!-- ここから下が、担当に渡る字 -->
あなたは、縦型ショート（60秒未満）の**本編集の担当**です。決まった原稿から、声 → 編集の spec → Actions で書き出し → 結果を読む →
直す → 下見、まで進めます。**読むのはこの1枚と、下の「企画の節」で名指した小節だけ。** 手引きの全文・道具のソースは読まない
（呼び出しの形はここにある。足りなければその道具の `--help`）。

## 何を作るか

{{about}}

{{where}}

## 原稿（声に読む字。秒は{{secs_from}}）

{{table}}

## 素材（どの配信のどの区間か）

{{material}}

## あやとの指摘の帳面（画・音・字幕・投稿に効く項目）

{{ledger}}

## 進めかた（呼び出しの形だけ）

置き場: `S={{scratch}}`（作業の置き場。リポジトリの外）・`K=$S/keys/ref_private.pem`（取り込みの秘密鍵）・`V={{ep}}`（この回）・
`E=.claude/skills/ec2-chrome/ec2.py`。
**素材の取り出しと声は互いに待たない。** 声は EC2 の札（下）を取ってから。待つあいだは「札を待つあいだに」を先にやる。

1. **素材を開く**（上の「素材」の配信ごとの状態で分かれる。手元に開いた置き場があればそれを使う。開く先は `$S`）:
   - **コマ一覧から見る（mp4 は開かない）**: 「作業枝に在る・コマ一覧の封あり」の配信は
     `python3 tools/shorts/ingest/decrypt.py --key $K --out $S/ingest --sheets --branch claude/serene-darwin-sf09tt`
     （git fetch は要らない。約1MB・5秒。1か所だけなら末尾に `shorts/.work/<videoId>/clips`）→ `$S/ingest/<videoId>/clips/sheets/NN_PP.jpg` を Read。
     区間ごと・2秒に1コマ。帯は「配信の時刻＋mp4 の中の秒」（例 `0:04:15 +0s`）。縦長は 6×5（1枚60秒）・横長は 5×6。同じ所に `sheets.csv`・`index.json`。
     **この形で取れるのは 62c63c0e より後に頼んだ clips だけ。** 「古い形」の配信は、下の mp4 を開いて手元で作る
     （`mkdir -p $S/sheets && ffmpeg -loglevel error -i <窓の mp4> -vf "fps=0.5,scale=240:-1,tile=6x5" $S/sheets/<番号>_%02d.jpg`。1枚 60秒ぶん）
   - **mp4**（指示書を組む・書き出す・カクつきを測るのに要る）: `git fetch origin claude/serene-darwin-sf09tt && git merge --ff-only FETCH_HEAD` →
     `python3 tools/shorts/ingest/decrypt.py --key $K --out $S/ingest shorts/.work/<videoId>/clips`（鍵違いは開かない）
   - **「下ろしてある」配信**: 書いてあるコミットの木から戻して開く。`git restore --source <コミット> -- shorts/.work/<videoId>/clips`
     （コマ一覧だけなら `…/clips/manifest.json` と `'…/clips/sheets.*'` だけ戻し、`--branch` を付けずに `--sheets`）→ 開いたら
     `rm -rf shorts/.work/<videoId>/clips`（`git add` しない）
   - `index.json` の `clips[]` が窓（`start`/`end` は配信の秒・`file` は mp4）
   - **配信が2本以上**なら、`build_edit.py` は時刻を1本の時間軸で引くので、spec の時刻の頭の時間 k で配信を分ける（上の時間軸）。
     k 本目の一覧を k×3600 秒ずらした写しを隣に作り（`index_k.json`）、それを `--clips` に渡す:
     `python3 -c 'import json,sys;p,k=sys.argv[1],int(sys.argv[2]);d=json.load(open(p));[c.update(start=c["start"]+k*3600,end=c["end"]+k*3600) for c in d["clips"]];json.dump(d,open(p.replace("index.json",f"index_{k}.json"),"w"))' <index.json> <k>`
   - **カクつき**: 使う区間は先に `python3 tools/shorts/qa/stutter.py <窓の mp4> --from <秒> --to <秒>` で測り、✕（繰り返し 60% 越え）の秒を避ける
   - **0秒目**: `python3 tools/shorts/plan/hook.py {{spec}} --material $S/ingest/<videoId> --clips <index.json> --out $S/hook`
     （配信1本の回だけ。つないだ回は、0秒目の候補の時刻を行ごとの帯で見て、題の札（y 380〜580）の下に本体が来る時刻を選ぶ）
2. **声**（Fish Audio・Holiday Twist。EC2 の Chrome）: 声に渡す字は `{{vl}}`（`key`・`plan`・`n`・`caption`・`tts_text`・`bytes`）。
   無ければ `python3 tools/shorts/script/brief.py edit --episode $V{{pat_arg}} --voice-lines {{vl}}` が spec の `tts_text` から作る。
   直すのは読み違えそうな所だけ（数・英字・読みが割れる漢字）。**言う中身は字幕と同じ。** かなの数が助詞と紛れるときは漢数字
   （「とおか」「二千年」。「人生初」をかなにしたら「は」を「わ」と読んだ）。札を取ったら（下）:
   - 道具と字を置く: `python3 $E put tools/shorts/voice/fish_web.py /home/ubuntu/cdp/fish_web.py`（`asr_check.py` も同じ）・
     `python3 $E put {{vl}} /home/ubuntu/voice/{{name}}-lines_in.json`
   - `python3 $E run <(echo 'cd /home/ubuntu/cdp && python3 fish_web.py backup && python3 fish_web.py state --model <声のID>') 300`
     （声のID は `grep -ho '"model_id": "[^"]*"' /home/ubuntu/voice/out/*/attempts.jsonl | sort | uniq -c` の Holiday Twist。`state` の残りのクレジットを控える）
   - `python3 $E run <(echo 'cd /home/ubuntu/cdp && nohup python3 fish_web.py gen --model <声のID> --lines /home/ubuntu/voice/{{name}}-lines_in.json --out /home/ubuntu/voice/out/{{name}} --budget-credits 2000 > /home/ubuntu/voice/{{name}}.log 2>&1 &') 60`
     （1文2本・課金は送った字のバイト数。済んだ文は飛ばすので、止まったら同じ指示で続き）
   - 聞き取り: `python3 $E run <(echo 'cd /home/ubuntu/cdp && /home/ubuntu/voice/asr-venv/bin/python asr_check.py /home/ubuntu/voice/out/{{name}} /home/ubuntu/voice/out/{{name}}/asr.json --model <int8 の large-v3-turbo の置き場> --pack 26') 1800`
     （模型は `find /home/ubuntu -maxdepth 4 -type d -name '*int8*'`。その前に fish の Chrome を閉じる。開いたままだと読み込みで落ちる）
   - 持ち帰って揃える: EC2 で `tar czf /home/ubuntu/voice/{{name}}.tgz -C /home/ubuntu/voice/out {{name}}` → `python3 $E get /home/ubuntu/voice/{{name}}.tgz $S/voice/raw.tgz` →
     `python3 tools/shorts/voice/collect.py --lines {{vl}} --attempts <raw>/attempts.jsonl --asr <raw>/asr.json --raw <raw> --out $S/voice/{{name}}`。
     合わない文だけ `tts_text` を直して `fish_web.py gen … --only {{sid}}/04 --attempt-limit 2`。誤検出と確かめた文は `collect.py … --accept {{sid}}/09=理由`
   - 終わったら `python3 fish_web.py restore --backup <写し>` で下書きを戻し、写しを消す（札は道具が終われば消える）
3. **spec と overrides**: 行ごとの画は `{{spec}}`（`rows[].src` は配信の時刻。`visual`・`looks` は狙い）。無ければ企画の原稿の表の画から作る:
   `{"id": "{{sid}}", "title_card": "🇫🇷 …", "title_card_seconds": 4.0, "narration_cps_target": 9.0, "rows": [{"line", "src": ["H:MM:SS.s"], "visual", "why", "tts_text", "card": true（1行目）, "mood", "big": true, "corner_note"}]}`。
   `mood` は感情が動く行だけ（`tense_shake` 不安・`tense_tilt` 困惑・`tense_still` 落胆・`up_pop` 喜び。ほかは `plain`）。spec に書けない割りかたは
   `{{ov}}` に `{"rows": {"<0始まりの行>": {"cuts": [{"t": "H:MM:SS.s", "share": 0.6, "until": "…", "note": "なぜこの画か"}, …]}}}`。
   `share`（行の中の割合。全カットに書いたときだけ効く）か `len`（秒で固定）。ほかに `zoom`（`{"to": 1.1, "x": 0.5, "y": 0.75}`）・`hold`（行の後ろに足す秒）・
   `telop`（`""` で出さない）・`highlight`（字幕で黄色にする語）・`bgm_db`（全体の BGM の上げ下げ。行の外に書く）。
   **書かなければ** 2カットは声の文の切れ目、3カット以上は等分（`split_row`）。題の札（spec の `title_card`。国旗の絵文字つき）は
   `title_card_seconds`（4.0まで）で消え、札が1行目と別の字なら1行目の字幕は札の下に出る
4. **指示書を組む**: `python3 tools/shorts/plan/build_edit.py {{spec}} --clips <index.json>（配信ごとに --clips を重ねる） --voice $S/voice/{{name}}/lines.json --plan {{sid}} --bgm {{bgm}} --overrides {{ov}} --out {{edit}}`。
   声がまだなら `--voice` と `--plan` を外す（Open JTalk の仮の声で尺を組む）。**止まって「字を何%減らす」と出たら、原稿の字の話なのでまとめ役へ返す**（声の倍率は 1.4 が上限）
5. **書き出す（Actions）**: `python3 tools/shorts/render/remote.py up --detach --name {{name}} --key $K --out $S/render {{edit}}`（素材を上げたら手を離す。約10分）→
   `python3 tools/shorts/render/remote.py fetch --name {{name}} --key $K --out $S/render`（封を開いて要約と絵だけ落とす。暗号文は作業枝から下ろす）。
   直しの途中は `up --draft`（縦横半分・下見なし・検査10項目。カットの長さ・似た見た目・止め絵・カクつき・使い回しは見られる）。
   **書き出すのは作業枝に push してある道具。** 名前は版ごとに変える（F-010）
6. **結果を読む**: `$S/render/{{name}}/summary.json` の品目ごとに `qa.checks`（20項目の合否と測った値）・`bgm`（飛ばした頭の秒・0コマ目の音量）・
   `end_notes`（終わりの札が最後のコマに描かれているか）・`moved`（顔を避けて動いた字）・`preview`。目で見るのは `$S/render/{{name}}/{{sid}}/` の:
   - `{{sid}}.sheet1s.jpg`（1秒1コマ・字つき）: 0秒目の画・場面の流れ・ぼかし忘れ・透かしの残り
   - `{{sid}}.texts.jpg`（字の切り抜き）: 語の途中の割れ・はみ出し・題の札の国旗が題の国か・終わりの札
   - `{{sid}}.faces.jpg`（顔の切り抜き）: 本人以外の顔・映さないと決めた人が写っていないか（決めるのは人）
   - `{{sid}}_strips.jpg`（行ごとの1秒刻みの帯・弱い画に赤い枠）: **行ごとに、言った物がその行の画に写っているか**（F-014）・弱い画が2秒以上続かないか
7. **直す**（落ちた検査 → 直しかた）:

   | 検査 | 直しかた |
   | --- | --- |
   | `text_on_face` | そのカットを、顔が画面の上半分にある時刻か顔の無い画に替える（字は鼻の下へ。上へは逃がさない） |
   | `cut_length`・`similar_run` | 行を overrides の `cuts` で割る（3.0秒ちょうども落ちる）／間に見た目の違う画を挟む |
   | `still_image` | 写真・画面の写し・止めたコマを、動く画に替える（寄せて動かしても止め絵） |
   | `source_stutter` | `stutter.py` で同じ物の写る別の区間を探す。無ければそのまま使い、探した範囲を記録に書く。カクつく素材に寄せを掛けない |
   | `shot_reuse` | 同じ画（同じ素材の別の時刻も）は尺の 25%・3回まで。2回目より後を別の画に |
   | `text_dup` | テロップを消す（`"telop": ""`）か、その語を `highlight` に |
   | `voice_vs_bgm` | overrides の `bgm_db` を下げる（話している間、声との差 9dB 以上） |
   | `faces`（人が見る） | 本人・誤検出なら記録に書いて通す。第三者の顔が大きければ、その画を使わない（大きくぼかさない） |

   直したら 4 → 5 → 6。前の版と変えたカット（行・前 → 後・なぜ）を控える
8. **下見と記録**: 下見は本番の書き出しが Hosting に置く（`put.py` は回さない）。URL は `summary.json` の `preview.page`（7日で消える）。
   **報告に書く。** 制作 issue に出すのはまとめ役。記録は `{{qa}}`（版ごとの sha256・秒・カット数・検査の数／帳面の画・音の項目の ○△／
   行ごとの画と、写せなかった物と代わりの画／声に渡した字と聞き取り／前の版から直したこと／投稿の文に入れるもの: 元のアーカイブ・
   `BGM：ポケットサウンド – https://pocket-se.info/`）と、spec・上書き・指示書・声の字。コミットのしかたは、まとめ役の頼む文に従う

## EC2 の札（列 `fish`）

fish の Chrome（`/home/ubuntu/cdp-fish`）は、声を作る担当と TikTok に出す担当が使い回す。同時に触ると、あやとの下書きと入力欄を取り合い、
片方の `fresh_tab` がもう片方のタブを閉じる（10-24 01:01 UTC に実際に起きた）。**列 `fish` の札で1人ずつ使う**（`ec2-chrome` の 2.5）。

- 見る: `python3 $E queue`（誰が何のために持ち、誰が待っているか。止まっていれば「止まっている」）
- 取る: `fish_web.py` と `tt_post.py`（`post.py tt-post`）は、どちらも札を自分で取る。ほかの人が持っていれば、何番目で誰かを出して空くまで待つ。
  手元で何手にも分けて触るなら `python3 $E hold fish --who <名前> --purpose '<何のため>' -- <コマンド>`（終われば返す）
- **鍵（`~/locks/fish-voice`）はもう置かない・見ない。** 札は持ち主のプロセスが死ねば消えるので、消し忘れも起きない
- `backup` → `state` → `gen` のあいだにほかの人に下書きを触られたくなければ、3つを `&&` でつないだ1本の sh にして、
  `nohup /usr/local/sbin/ec2-queue hold fish --who <名前> --purpose '声 <回>' -- sh -c '<つないだもの>' > <ログ> 2>&1 &` で流す
  （中のプロセスは札を受け継ぐ。`ec2-chrome` 2.5）
- 止める: 自分の札を返してから `python3 $E stop`。ほかの人の札があれば断られるので、そのまま置いておく（誰も使わなくなって30分で見張りが止める）

**札を待つあいだに**（声が無くても進む所）: 素材を開く・コマ一覧と `stutter.py` で区間を選ぶ・0秒目を選ぶ → spec と overrides を書く →
`build_edit.py` を `--voice` 無しで回して指示書を組み → `remote.py up --draft --detach` で下書きを回して、カットの長さ・似た見た目・止め絵・カクつき・使い回しを先に直す。
声が来たら `--voice` を付けて組み直し、本番で書く。

## やってはいけないこと

- 原稿の字・題の札の字を変えない（変えたいときは止めてまとめ役へ）。声の倍率を 1.4 より上げない
- 動画・声・BGM・素材・顔の切り抜き・下見の URL をリポジトリに入れない（開く先・書き出す先は `$S`）
- 視聴者さんの名前・チャットの本文をどこにも書かない。島の画面（視聴者さんのキャラクター）が重なる配信の画は使わない
- 投稿しない（あやとが「出して」と言ってから、投稿の担当が出す）。あやとの Fish の下書きを戻さずに終えない
- 手元で直した道具のまま Actions に回さない（Actions は作業枝に push してある版で書く）

## 報告の型（25行以内）

1. 版の名前・sha256 の頭12字・秒・カット数（双子の一致）
2. 検査: 合格 / 人が見る / 落ち の数。合格以外の項目と、どう処分したか
3. 下見の URL（`preview.page`。7日）
4. 帳面の画・音・投稿の項目: ○ / △（△は何が写せず、代わりに何を当てたか）
5. 声: 取り直した行と理由・使ったクレジットと残り・下書きを戻し鍵を外したか
6. 前の版から変えたカット（行・前 → 後・なぜ）
7. 投稿の文に入れるもの（元のアーカイブの videoId・BGM のクレジット）
8. コミットの SHA と変えたファイル（まとめ役がコミットを頼んだときだけ）
9. 頼まれていないが直したもの・気づいた地雷
