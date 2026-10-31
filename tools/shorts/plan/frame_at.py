"""復号した材料（zoom とアーカイブのシート）から、指定した秒の1コマを切り出す。
使い方: frame_at.py <置き場/videoId> <H:MM:SS> <out.jpg>
zoom（刻みの細かいもの）にあればそれを、無ければアーカイブ（10秒刻み）のいちばん近いコマを使う。

切り出しは storyboard.py の frame() に任せる。前はここで zoom を 2x2・縦長と決め打ちしていて、
1x1 の zoom や横長の配信では隣のコマや枠の外を切っていた。シートの並びは寸法から割り出す。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from storyboard import frame, sec  # noqa: E402

base, hms, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
frame(base.parent, base.name, sec(hms)).save(out, quality=88)
print(out, base.name, hms)
