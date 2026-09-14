#!/usr/bin/env bash
#
# 配信の一部を mp4 に切り出す。**GitHub Actions から呼ばれる**（clip_make.yml）。
#
# ワークフローの中に直に書かず、ここに出してあるのは**手元で回せるようにするため。**
# 区間の読み取り・ファイル名・ffprobe での確認は、YouTube に繋がらない箱でも
# CLIP_SOURCE_URL に手元の mp4 を渡せばそのまま通る（tools/clip/selftest.sh）。
#
# 入力（環境変数）:
#   VIDEO   … YouTube の動画ID。ファイル名の頭に付く
#   RANGES  … 2:55:20-3:08:20,4:31:20-4:36:00 のようなカンマ区切り
#   HEIGHT  … 縦の画素数の上限（既定 1080）
#   OUT     … 書き出す先のディレクトリ（既定 out）
#   CLIP_SOURCE_URL … 手元で試すとき用。YouTube の代わりに読む URL
#
set -euo pipefail

VIDEO="${VIDEO:?VIDEO（動画ID）が要ります}"
RANGES="${RANGES:?RANGES（切り出す区間）が要ります}"
HEIGHT="${HEIGHT:-1080}"
OUT="${OUT:-out}"

if ! printf '%s' "$VIDEO" | grep -qE '^[A-Za-z0-9_-]{11}$'; then
  echo "::error::動画IDは11文字（英数字と - _）です: $VIDEO" >&2
  exit 1
fi
if ! printf '%s' "$HEIGHT" | grep -qE '^[0-9]{3,4}$'; then
  echo "::error::height は数字で: $HEIGHT" >&2
  exit 1
fi

mkdir -p "$OUT"

# --- 区間を秒に直す -------------------------------------------------------
# 受ける形は H:MM:SS / M:SS / 秒。**終わりが始まりより後ろでなければ止める。**
# 黙って直すと、頼んだ区間と違うものが artifact に入る
to_sec() {
  local t="$1" n=0 part
  case "$t" in
    *[!0-9:]*) echo "::error::時刻に使えない字が入っています: $t" >&2; exit 1 ;;
  esac
  local IFS=:
  for part in $t; do
    [ -n "$part" ] || { echo "::error::時刻が空です: $t" >&2; exit 1; }
    n=$((n * 60 + 10#$part))
  done
  echo "$n"
}

# 秒 → 1-28-40。ファイル名に : は使えないので - で繋ぐ
to_name() {
  printf '%d-%02d-%02d' $(($1 / 3600)) $(($1 % 3600 / 60)) $(($1 % 60))
}

sections=()
starts=()
ends=()
IFS=',' read -r -a raw <<<"$RANGES"
for r in "${raw[@]}"; do
  r="$(printf '%s' "$r" | tr -d '[:space:]')"
  [ -n "$r" ] || continue
  case "$r" in
    *-*) : ;;
    *) echo "::error::区間は 開始-終了 の形で書いてください: $r" >&2; exit 1 ;;
  esac
  s="$(to_sec "${r%%-*}")"
  e="$(to_sec "${r##*-}")"
  if [ "$e" -le "$s" ]; then
    echo "::error::終わりが始まりより後ろではありません: $r" >&2
    exit 1
  fi
  sections+=(--download-sections "*${s}-${e}")
  starts+=("$s")
  ends+=("$e")
done
if [ "${#starts[@]}" -eq 0 ]; then
  echo "::error::切り出す区間が1つもありません" >&2
  exit 1
fi
echo "切り出す区間 ${#starts[@]}本 / 縦 ${HEIGHT}px まで"

# --- 落とす ---------------------------------------------------------------
# **全体を落とさない。** --download-sections を付けると ffmpeg が要る区間だけ
# 拾う。4時間45分の配信を丸ごと落とすと、時間も容量も無駄になる。
#
# 呼び出しは**1回にまとめる。** 区間ごとに yt-dlp を起こすと、そのたびに
# 動画ページを取りに行くことになる。Cookie は使うほど回り続けるので、
# YouTube を叩く回数は少ないほどいい。
src="${CLIP_SOURCE_URL:-https://www.youtube.com/watch?v=${VIDEO}}"
tmpl="${OUT}/${VIDEO}__%(section_start)d-%(section_end)d.%(ext)s"

yt-dlp \
  --no-playlist \
  --no-progress \
  --newline \
  --no-part \
  --retries 5 \
  --format "bv*[height<=${HEIGHT}]+ba/b[height<=${HEIGHT}]/bv*+ba/b" \
  --merge-output-format mp4 \
  "${sections[@]}" \
  --output "$tmpl" \
  "$src"

# --- 見て分かる名前に直して、出来たものを確かめる -------------------------
# yt-dlp が置ける名前は秒までで、%(section_start)s は 10520 のような数字。
# 受け取った人が「どこを切ったか」を見て分かるように 2-55-20 に直す。
#
# **「落ちてきた」で終わらせない。** 頼んだ長さと出来た長さを並べて出す。
# 配信の終わりを越えた区間を頼むと、yt-dlp は**短いものを黙って返す**
# （5分の動画に 6:00-6:30 を頼んで、2秒のものが出来た）。ファイルがある
# ことだけを見る確かめかたでは、これが通ってしまう
echo ""
echo "出来たもの:"
made=0
bad=0
for i in "${!starts[@]}"; do
  s="${starts[$i]}"
  e="${ends[$i]}"
  want=$((e - s))
  from="${OUT}/${VIDEO}__${s}-${e}.mp4"
  to="${OUT}/${VIDEO}_$(to_name "$s")_$(to_name "$e").mp4"
  label="$(to_name "$s")〜$(to_name "$e")"

  if [ ! -f "$from" ]; then
    printf '  NG  %s  ← ファイルが出来ていません\n' "$label"
    bad=$((bad + 1))
    continue
  fi
  mv "$from" "$to"
  made=$((made + 1))

  name="$(basename "$to")"
  size="$(du -h "$to" | cut -f1)"
  d="$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$to" 2>/dev/null || true)"
  wh="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
    -of csv=s=x:p=0 "$to" 2>/dev/null || true)"
  got="${d%%.*}"

  # 空の器でも拡張子は .mp4 になる。**長さと縦横が読めることまで見る**
  if [ -z "$d" ] || [ -z "$wh" ] || ! printf '%s' "$got" | grep -qE '^[0-9]+$'; then
    printf '  NG  %s  ← ffprobe が読めません（%s）\n' "$name" "$size"
    bad=$((bad + 1))
    continue
  fi
  # 頼んだ長さの半分に届かないものは、頼んだ区間とは別のもの
  if [ "$((got * 2))" -lt "$want" ]; then
    printf '  NG  %s  頼んだ %s秒 / 出来た %s秒  ← 配信の終わりを越えていませんか\n' \
      "$name" "$want" "$got"
    bad=$((bad + 1))
    continue
  fi
  printf '  OK  %s  頼んだ %s秒 / 出来た %s秒  %s  %s\n' \
    "$name" "$want" "$got" "$wh" "$size"
done

if [ "$bad" -gt 0 ]; then
  # **出来たぶんは持ち帰れるようにしておく**（ワークフローの artifact は
  # ここが赤くても上げる）。赤くするのは、気づかずに使わないため
  echo "::error::頼んだとおりになっていないものが ${bad}本あります" >&2
  exit 1
fi
echo "${made}本を書き出しました（$OUT）"
