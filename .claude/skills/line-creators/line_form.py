#!/usr/bin/env python3
"""EC2 の上で動く。LINE Creators Market の「新規登録（スタンプ）」の欄を埋める（保存は押さない）。

    python3 line_form.py <meta.json>

画面は Vue。値は JS で直に入れず、欄を押して打つ（v-model が拾わないことがあるため）。
select だけは value を入れて change を投げる。
"""
import json, sys, time
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import tab, where

VIS = "e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }"


def typein(t, sel_js, text):
    t.click(sel_js)
    t.js(f"(() => {{ const e = {sel_js}; e.focus(); e.select && e.select(); }})()")
    t.key("Backspace", vk=8)
    t.type(text)


def radio(t, label):
    """見えている radio の中で、ラベルの字がちょうど label のものを押す"""
    ok = t.js(f"""(() => {{ const l = [...document.querySelectorAll('label')].filter({VIS})
        .find(l => l.innerText.trim() === {json.dumps(label)}); if (!l) return false; l.click(); return true }})()""")
    if not ok:
        raise RuntimeError(f"radio が無い: {label}")


def pick(t, sel_js, value):
    """select に値を入れる。**input と change の両方を投げる。** change だけだと、Vue が拾わずに
    「Add」を押しても何も足されなかった（2026-10-13、作者名の言語）"""
    t.js(f"""(() => {{ const s = {sel_js}; s.value = {json.dumps(value)};
        s.dispatchEvent(new Event('input', {{bubbles: true}})); s.dispatchEvent(new Event('change', {{bubbles: true}})) }})()""")
    time.sleep(0.5)


def select_by_text(t, row_label, text):
    """行の見出しが row_label の select で、字が text の選択肢を選ぶ"""
    ok = t.js(f"""(() => {{ const th = [...document.querySelectorAll('th')].find(e => e.innerText.trim().startsWith({json.dumps(row_label)}));
        const s = th && th.closest('tr').querySelector('select'); if (!s) return 'no select';
        const o = [...s.options].find(o => o.text.trim() === {json.dumps(text)}); if (!o) return 'no option';
        s.value = o.value; s.dispatchEvent(new Event('input', {{bubbles: true}}));
        s.dispatchEvent(new Event('change', {{bubbles: true}})); return true }})()""")
    time.sleep(0.5)
    if ok is not True:
        raise RuntimeError(f"{row_label}: {ok}")


def author(t, m):
    """作者名の小窓。section.FnEditAuthor の中の .mdPOP01Window（2026-10-13 に読んだ）"""
    t.click("document.querySelector('[data-test=btn-edit-author]')")
    time.sleep(2)
    typein(t, "document.querySelector('.FnEditAuthor tr[data-test=author-en] input')", m["creator"]["en"])
    if not t.js("!!document.querySelector('.FnEditAuthor tr[data-test=author-ja]')"):
        pick(t, "document.querySelector('[data-test=author-dialog-select-language]')", "ja")
        t.click("document.querySelector('[data-test=author-dialog-add-button]')")
        time.sleep(1.5)
    typein(t, "document.querySelector('.FnEditAuthor tr[data-test=author-ja] input')", m["creator"]["ja"])
    t.click("document.querySelector('[data-test=btn-author-register]')")
    time.sleep(3)


def fill(m):
    t = tab("line")
    if "/sticker/create" not in t.url():
        # クリエイター ID はリポジトリに書かない。/my/ を開くと /my/<ID>/sticker/ に飛ぶので、そこから組む
        t.go("https://creator.line.me/my/", wait=5)
        t.go(t.url().split("/sticker/")[0] + "/sticker/create", wait=6)
    # 作者名（小窓）。もう入っていれば触らない（作者名はアイテム全部で共通）
    if m["creator"]["en"] not in (t.js("(document.querySelector('[data-test=info-author] td')||{}).innerText") or ""):
        author(t, m)
    # タイトル・説明（英語）
    typein(t, "document.querySelector('[name=\"meta[en][title]\"]')", m["title"]["en"])
    typein(t, "document.querySelector('[name=\"meta[en][description]\"]')", m["description"]["en"])
    # 日本語を足す
    if not t.js("!!document.querySelector('[name=\"meta[ja][title]\"]')"):
        pick(t, "document.querySelector('[data-test=select-language]')", "ja")
        t.click("document.querySelector('[data-test=btn-add-language]')")
        time.sleep(2)
    typein(t, "document.querySelector('[name=\"meta[ja][title]\"]')", m["title"]["ja"])
    typein(t, "document.querySelector('[name=\"meta[ja][description]\"]')", m["description"]["ja"])
    typein(t, "document.querySelector('[name=copyright]')", m["copyright"])
    radio(t, m["ai"])
    select_by_text(t, "Style Category", m["style"])
    select_by_text(t, "Character Category", m["character"])
    radio(t, m["release"])
    typein(t, "document.querySelector('[name=request_comment]')", m["note"])
    time.sleep(1)
    # 入ったものを読み返す（字数と、見えている誤りの文）
    print(json.dumps(t.js("""(() => {
        const v = n => (document.querySelector(`[name="${n}"]`) || {}).value;
        const errs = [...document.querySelectorAll('.mdTxtError, [class*=error], [class*=Error]')]
            .filter(e => e.offsetParent !== null && e.innerText.trim()).map(e => e.innerText.trim().slice(0, 80));
        const author = (document.querySelector('[data-test=info-author] td') || {}).innerText;
        return {title_en: v('meta[en][title]'), title_ja: v('meta[ja][title]'), desc_ja_len: (v('meta[ja][description]')||'').length,
                desc_en_len: (v('meta[en][description]')||'').length, copyright: v('copyright'), author, errs};
    })()"""), ensure_ascii=False, indent=1))
    t.shot("/home/ubuntu/shots/line-filled.jpg", full=True, quality=60)


if __name__ == "__main__":
    fill(json.load(open(sys.argv[1], encoding="utf-8")))
