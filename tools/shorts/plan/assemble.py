"""企画書の本体に、絵コンテの表と絵を差し込んで、制作記録の置き場に書き出す。
使い方: assemble.py <本体.md> <絵コンテの出力フォルダ> <specs の接頭辞> <書き出し先フォルダ> [画像のURLの頭]"""
import json, shutil, sys
from pathlib import Path
body, out, prefix, dest = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
url = sys.argv[5] if len(sys.argv) > 5 else ""
dest.mkdir(parents=True, exist_ok=True)
s = body.read_text()
for k in "ABC":
    t = (out / f"table_{k}.md").read_text().strip()
    s = s.replace(f"(table_{k})", t)
    shutil.copy(out / f"storyboard_{k}.jpg", dest / f"storyboard_{k}.jpg")
    s = s.replace(f"(storyboard_{k})", f"![{k}案の絵コンテ]({url}storyboard_{k}.jpg)")
    spec = Path(f"{prefix}_{k}.json")
    shutil.copy(spec, dest / f"spec_{k}.json")
(dest / "plan.md").write_text(s)
print(dest / "plan.md", len(s), "字")
