"""YouTube Studio で、ショートのサムネイルを絵のファイルに差し替えて保存する（EC2 で動く）。

    python3 yt_thumb.py <動画ID> <絵のパス>

サムネイルは題の札が見えるコマにする（あやと 2026-10-17）。ショートでも詳細のページに
「ファイルをアップロード」（input#file-loader）があるので、書き出しから切り出したコマを上げる。
"""
import json, os, sys, time
sys.path.insert(0, os.path.expanduser("~ubuntu/cdp"))
from yt_studio import studio, url_of, BASE
vid, img = sys.argv[1], sys.argv[2]
SAVE = "[...document.querySelectorAll('ytcp-button')].find(b => b.offsetParent && (b.innerText || '').trim() === '保存')"
t = studio(url_of("videos/short"), wait=6)
t.go(f"{BASE}/video/{vid}/edit", wait=10)
before = t.js("(() => { const i = document.querySelector('ytcp-video-thumbnail-editor img, ytcp-thumbnail img'); return i ? i.src.slice(0, 80) : null; })()")
t.set_files("ytcp-thumbnail-uploader input#file-loader", [img])
time.sleep(8)
after = t.js("(() => { const i = [...document.querySelectorAll('ytcp-video-thumbnail-editor img, ytcp-thumbnail img')].map(i => i.src.slice(0, 60)); return i; })()")
print("before", before); print("after", after)
t.shot(os.path.expanduser("~ubuntu/shots/post/yt_8_thumb_set.jpg"))
if not t.js(f"!!{SAVE}"):
    print("RESULT", json.dumps({"ok": False, "error": "no_save"})); sys.exit(0)
t.click(SAVE)
time.sleep(10)
t.shot(os.path.expanduser("~ubuntu/shots/post/yt_9_thumb_saved.jpg"))
dirty = t.js(f"!!{SAVE} && !{SAVE}.hasAttribute('disabled')")
print("RESULT", json.dumps({"ok": True, "save_still_enabled": dirty}))
