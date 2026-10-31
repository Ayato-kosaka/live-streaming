#!/usr/bin/env bash
# ChatGPT が作ったグッズの絵（tools/goods/art/*.png）を、SUZURI の入稿サイズの1枚に組む。
#
#   tools/goods/compose.sh            # → tools/goods/art/out/*.png
#
# ChatGPT の絵は 1100〜2200px・白い地。SUZURI は品目ごとに「刷る面そのもの」の大きさを求める
# （`suzuri.jp/item_templates`）。絵だけを上げると contain で面いっぱいに伸ばされて、
# 胸元のワンポイントが胸いっぱいのロゴになる。**面と同じ大きさのキャンバスに置いて渡す。**
#
#   Tシャツ（スタンダード・表/裏） 2520 x 2992
#   フェイスタオル                 6929 x 2992（88 x 38 cm）
#   帆布ファスナーポーチ M         1062 x 826
#
# **SUZURI は絵を縮めずに、1画素=1画素で刷る面に置く**（2倍の絵を渡したら中央だけが写った。
# 2026-10-13 に格子の絵で測った）。だから「面と同じ大きさ」で渡す。大きく見せたいときは絵の側を大きくする
#
# 白い地は、**四隅からつながった白だけ**を抜く（floodfill）。「白を全部抜く」にすると、
# 黒い丸の中の白抜き文字（AYT）まで透けて、白以外のTシャツで穴になる。
set -euo pipefail
cd "$(dirname "$0")/art"
mkdir -p out

# 四隅から白（に近い色）を透明にする。ふちの白いにじみは fuzz で拾う
cut_white() { # in out
  convert "$1" -alpha set -bordercolor white -border 2 -fuzz 9% -fill none \
    -floodfill +0+0 white -floodfill +"$(( $(identify -format %w "$1") + 3 ))"+0 white \
    -floodfill +0+"$(( $(identify -format %h "$1") + 3 ))" white \
    -floodfill +"$(( $(identify -format %w "$1") + 3 ))"+"$(( $(identify -format %h "$1") + 3 ))" white \
    -shave 2x2 -trim +repage "$2"
}

# 面に置く: 透明キャンバスの (中心x, 上端y) に、幅 w（高さ h を超えない）で置く
place() { # art canvasW canvasH w h top out
  convert -size "$2"x"$3" xc:none \( "$1" -filter Lanczos -resize "$4"x"$5" \) \
    -gravity north -geometry +0+"$6" -composite "$7"
}

for k in tshirt-a-front tshirt-a-back tshirt-b-front tshirt-b-back towel pouch-a; do
  cut_white "$k.png" "out/_$k.cut.png"
done

# --- Tシャツ（2520 x 2992）。胸元は小さく、背中は大きく
place out/_tshirt-a-front.cut.png 2520 2992 1000 600  520 out/tshirt-a-front.png
place out/_tshirt-b-front.cut.png 2520 2992  760 760  420 out/tshirt-b-front.png
place out/_tshirt-a-back.cut.png  2520 2992 1300 1700 380 out/tshirt-a-back.png
place out/_tshirt-b-back.cut.png  2520 2992 1700 1700 420 out/tshirt-b-back.png

# --- フェイスタオル（6929 x 2992）。黄色の地に絵を置く。
# タオルは縦に吊るす。吊るしたとき字が正しく読めるよう、絵は左へ90°倒して（字の天が左を向く）、
# 吊るしたときの下になる右端へ寄せる。絵の幅（タオルの幅 38cm の方向）は 2992 の7割強、長さは 3300 ほど
YEL="#FFE600"
convert -size 6929x2992 xc:"$YEL" \( out/_towel.cut.png -filter Lanczos -resize 2250x3400 -rotate -90 \) \
  -gravity east -geometry +450+0 -composite out/towel.png

# --- ポーチ（1062 x 826）
# バス: 白地を抜いて、帆布の生成りの上に。横長の絵なので幅いっぱい（1000）で、縦は真ん中
place out/_pouch-a.cut.png 1062 826 1000 700 245 out/pouch-a.png
# 数字ポーズの柄: 生地いっぱいの柄なので、地ごと面を覆う（cover）。透過にしない
convert pouch-b.png -filter Lanczos -resize 1062x826^ -gravity center -extent 1062x826 out/pouch-b.png

rm -f out/_*.cut.png
for f in out/*.png; do convert "$f" -depth 8 -define png:compression-level=9 "$f"; done
identify out/*.png
