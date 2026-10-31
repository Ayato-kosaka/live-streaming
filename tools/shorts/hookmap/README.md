# 地図のフック（街を回る回の0秒目〜）

あやと（2026-10-31・#1051）「フックに地図付きアニメーションが欲しい。※必要に応じて素材は画像生成しても良いですし、
コーティングで作っても良いです。」（帳面 F-060）

街を1日回る型の回で、題の札が出ている間（1行目の読み上げ、約3秒）に、**その街が国のどこにあるか**（題の言葉、
たとえば「第三の街」が分かる並び）と、**その日に回った道のり**を、地図の上で動かして見せる。配信に無い画なので、
ここでコードで描いて mp4 にする。

```bash
python3 tools/shorts/hookmap/hookmap.py shorts/videos/<回>/<版>/hookmap.json --out <スクラッチパッド>/hookmap
#  → hook_map.mp4（1080x1920・30fps・無音の音つき）・index.json（build_edit.py の --clips に足す）・contact.jpg（0.25秒ごと）
```

1. `hookmap.json` を回の置き場に書く（下の欄）。街と場所の緯度・経度・地図に出す国・秒
2. 回して `contact.jpg` を見る。題の札の帯（`layout.title_band`）に街の印が掛かると止まる
3. `build_edit.py … --clips <置き場>/index.json` で足し、spec の1行目の src（overrides の row 0 の cuts）に
   `27:46:40.0`（配信の時間軸の外の秒。配信は10時間までなので取り違えない）を書く
4. **組んだ指示書で、その素材の透かしの切り落としを外す**: `python3 tools/shorts/hookmap/hookmap.py --fix-edit <edit_X.json>`
   （build_edit.py は窓をみな配信の素材とみなし、右下の透かしの帯を切り落とす。地図は切らない。組み直すたびに回す）
5. 1つのカットは 3秒未満（`cut_length`）。行が3秒を越えるなら、地図を2.5秒ほどにして、残りは配信の画にする

## hookmap.json の欄

| 欄 | 中身 |
| --- | --- |
| `seconds` | 長さ（秒）。30fps でのコマ数に丸める |
| `lat0` | 投影の基準の緯度（横に cos を掛ける。国の真ん中あたり） |
| `countries` | 陸に塗る国（Natural Earth の `ADM0_A3`。France は ISO_A3 が -99 なので `FRA` を ADM0_A3 で） |
| `focus` | 明るく塗って影を付ける国 |
| `focus_units` | 国の中の地方を金色に脈打たせて光らせる（Natural Earth の map units の `GU_A3`。スコットランドは `SCT`）。無ければ光らせない |
| `unit_labels` | 光らせた地方の名前: `name`・`lat`・`lon`（国の段だけ） |
| `national` | 国の段のカメラ: `lon`・`lat`（画面の `cy` に置く点）・`scale`（緯度1度の画素）・`zoom_to`（寄る段の倍率） |
| `city.card` | 街の札の枠 [x0, y0, x1, y1]（画素。札は主役の街の印から広がる） |
| `city.box` | 場所の印を収める枠（札の中）。場所の緯度・経度から、この枠に収まる倍率を決める |
| `cities` | 国の段の街: `name`（日本語）・`lat`・`lon`・`rank`（印の数字と出る順）・`label`（left / right）・`mark`（数字の代わりの字。順位に意味の無い回は `★` や空）・`note`（名前の下の小さな字。「スコットランドの首都」） |
| `hero` | 主役の街の `name`（大きく光らせて寄る） |
| `stops` | 回った場所を回った順に: `name`・`lat`・`lon`・`icon`（townhall / donut / helmet / water / monument / bagpipe / castle / shops / haggis / pin）・`label`（left / right / above / below） |
| `stop_radius` | 場所の丸の半径（画素。既定 56）。場所どうしが近くて丸が重なる回は小さくする |
| `timeline` | `pins`（街の印が出る秒。rank の順）・`zoom`（寄る段の始めと終わり）・`route`（道のりの始めと終わり） |
| `scale_bar_m` | 縮尺の棒の長さ（m。場所と同じ投影から長さを出す） |
| `town_label` | 札の上の見出し（「リーズの中心部」） |
| `layout` | `title_band`（題の札の帯 [上, 下]）・`scale_bar_xy`・`town_label_xy` |

## 地図の素材と、なぜこれか

- **Natural Earth 1:50m の国境**（`ne_50m_admin_0_countries.geojson`・v5.1.2）。**公有で、表示の義務も無い**
  （https://www.naturalearthdata.com/about/terms-of-use/ 「All versions of Natural Earth raster + vector map data
  found on this website are in the public domain」）。OpenStreetMap のタイルのように帰属の表示が要る素材は使わない
  （投稿文に表示を足す仕組みが無い）
- 初回に GitHub の `nvkelso/natural-earth-vector` の版の札から落とし、`--cache`（既定 `~/.cache/hookmap`）に置く。
  sha256 を控えと突き合わせ、違えば止まる（版の中身が変わると地図の形が黙って変わるので）
- 街の中（寄ったあと）は、この解像度に道が無いので、**地の色だけにして、場所どうしの位置と縮尺だけを正しく**描く
  （緯度・経度を同じ投影で置く。縮尺の棒も同じ投影から）。それらしい道を描き足さない（嘘の地図になる）
- 場所の絵はコードで描く（絵文字の書体は版で字形が変わる・ドーナツに穴がある）。字は M PLUS Rounded 1c Black（OFL）

## 止め絵・カクつきの検査に当たらないように

国の段も街の段もカメラをゆっくり寄せ続け、主役の街の輪と道のりの点線を流し続けるので、どのコマも隣と違う
（`still_image` は隣のコマとの差が 0.5 以上の対を数える）。コマは1枚ずつ描くので、繰り返しのコマも無い（`source_stutter`）。
