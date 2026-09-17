#!/usr/bin/env bash
# 分かち合う1枚（`site/public/og.png`）を撮り直して、**写っている字が変わっていたら
# 差し替える**ところまで。毎晩 `.github/workflows/rebake.yml` から呼ぶ。
#
#   DIST=site/.next-3220 PORT=4220 tools/sprites/ognight.sh
#
# ## なぜ要るか
#
# あの絵の中の言葉は、もう全部「画面が出しているもの」を撮っただけになっている
# （`docs/island-misses.md` #134）。**撮り直せば正しくなる**形にはなったが、
# **誰も撮り直さない。** 旅のしるべ（何日目・どこ）は開いた日で決まるので、
# 置いておけば**翌日には嘘になる。** #134 は、繋ぐまでは半分しか直っていない。
#
# ## なぜバイト列で見ないか
#
# 同じ入力で2回撮っても、絵のバイト列は毎回ちがう。住人が歩き、波が動くので、
# **756,000画素のうち 3.8〜4.6% が入れ替わる**（実測。md5 は3回とも別物）。
# 「バイトが変わったら差し替える」で繋ぐと、**毎晩 540KB のコミットが、
# 中身は同じまま積まる。** だから見るのは絵ではなく、**絵に写るべき字**
# （島・看板・帯・旅のしるべ・島の札）。`og.mjs` が `STAMP=` で書き出し、
# いま配ってあるぶんが `tools/sprites/og-stamp.json` に入れてある。
# 字は同じ入力なら2回とも1バイトも違わない（実測）。
#
# ## 落ちたら、絵は据え置いて 1 を返す
#
# **その晩の焼き直しは道連れにしない。** 絵が古いままなのと、島の数字が
# 古いままなのは別の話で、撮れなかったからといって数字まで止めると、
# 直せるものまで止まる。ただし**黙りもしない**——1 を返して、呼んだ側
# （rebake.yml）が deploy のあとで run を赤くする。#134 が起きたのは
# 「誰も見に行かなかった」からで、静かに諦めるのは同じ穴。
#
# 終了コード: 0＝差し替えた／据え置いた（どちらも正常） / 1＝撮れなかった
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# 配る先（`next build` の書き出し）。既定はワークフローのビルドと同じ `.next`
DIST="${DIST:-site/.next}"
case "$DIST" in /*) dist="$DIST" ;; *) dist="$root/$DIST" ;; esac
PORT="${PORT:-4519}"
PNG="$root/site/public/og.png"
STAMP="$root/tools/sprites/og-stamp.json"
# キャラクターの絵の一覧。`chars.py` が読む `/tmp/ch.json` の出どころ
API="${OG_API:-https://live-streaming-d3cac.web.app/island-api/characters}"

work="$(mktemp -d)"
srv=""
cleanup() {
  [ -n "$srv" ] && kill "$srv" 2>/dev/null
  rm -rf "$work"
}
trap cleanup EXIT

die() {
  echo "共有の絵: $*" >&2
  exit 1
}

# **「そこに何か在る」では足りない。** `output: "export"` の書き出しは distDir の
# 中に面がそのまま置かれる。置き場所が変わった日に、空の箱を配って
# 「島が出ない」と読むことになるので、表紙そのものを見る
[ -f "$dist/index.html" ] || die "配るものがありません（$dist/index.html）。先に next build を通す"

# ---- 道具 ---------------------------------------------------------------
# `playwright-core` は版を止めてある（`tools/sprites/package.json`）。上げない
if [ ! -d "$root/tools/sprites/node_modules/playwright-core" ]; then
  (cd "$root/tools/sprites" && npm ci) || die "tools/sprites の依存を入れられませんでした"
fi
# ブラウザ。この箱は `/opt/pw-browsers` に在るが、**ランナーには無い。**
# 置き場の版番号はここに書かない（`og.mjs` が playwright-core に聞く）
if [ ! -d /opt/pw-browsers ] && [ -z "${CHROME:-}" ]; then
  node "$root/tools/sprites/node_modules/playwright-core/cli.js" install --with-deps chromium \
    || die "ブラウザを入れられませんでした"
fi

# ---- 顔 -----------------------------------------------------------------
# 1枚でも落ちていると、島の12人が全員そっくり同じ顔で焼かれる（#134 の2つめ）。
# 落ちたことは絵に写らないので、`og.mjs` が枚数を数えて止める
python3 "$root/tools/sprites/avatars.py" || die "住人の絵を落とせませんでした"
curl -fsS --max-time 60 "$API" -o /tmp/ch.json || die "キャラクターの一覧に届きませんでした"
python3 "$root/tools/sprites/chars.py" || die "キャラクターの絵を落とせませんでした"

# ---- 撮る ---------------------------------------------------------------
# **開発サーバーではなく、書き出したものを静的に配って撮る**（`CLAUDE.md`）
python3 -m http.server "$PORT" --directory "$dist" >"$work/serve.log" 2>&1 &
srv=$!
up=""
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/"; then up=1; break; fi
  sleep 0.5
done
[ -n "$up" ] || die "静的配信（:$PORT）が上がりませんでした"

PORT="$PORT" OUT="$work/og.png" STAMP="$work/og.json" node "$root/tools/sprites/og.mjs"
code=$?
case "$code" in
  0) ;;
  1) die "撮れましたが、絵が島に見えません（ogcheck が落ちました）。絵は据え置きます" ;;
  *) die "撮れませんでした（og.mjs が $code）。絵は据え置きます" ;;
esac
[ -s "$work/og.png" ] || die "撮ったはずの絵がありません"
[ -s "$work/og.json" ] || die "撮ったはずの字がありません"

# ---- 字が変わったか -----------------------------------------------------
if [ -f "$STAMP" ] && cmp -s "$STAMP" "$work/og.json"; then
  echo "字は前のままです。絵は据え置きます（$(basename "$STAMP")）"
  exit 0
fi

echo "字が変わりました:"
diff "$STAMP" "$work/og.json" || true

cp "$work/og.png" "$PNG" || die "絵を置き換えられませんでした"
cp "$work/og.json" "$STAMP" || die "字を置き換えられませんでした"
echo "差し替えました $PNG（$(wc -c <"$PNG") バイト）"
# 呼んだ側（rebake.yml）が commit に混ぜるための合図。
# **差し替えが済んだあとにだけ立てる**——先に立てると、途中で落ちた晩に
# 「変わった」とだけ伝わって、変わっていない絵が commit される
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "OG_CHANGED=1" >>"$GITHUB_ENV"
fi
