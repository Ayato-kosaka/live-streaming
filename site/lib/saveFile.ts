"use client";

/**
 * 1枚を端末に落とす。
 *
 * **`<a download>` だけでは足りない。** 絵は置き場（`firebasestorage.googleapis.com`）
 * にあって、面とはドメインが違う。別のドメインを指した `download` は無視され、
 * ただそのページへ飛ぶだけになる。いったん取ってから blob にすると、
 * こちらの付けた名前で落ちる（置き場が `access-control-allow-origin: *` を
 * 返すので、取ってくるところは通る。実測 2026-09-11）。
 *
 * 取れなかったときは、新しい面で開くところまでは必ずやる。
 * **黙って何も起きない、にしない。** スマホなら、開いた絵を長押しで保存できる。
 */
export async function saveFile(url: string, name: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * 落とすときのファイル名。
 *
 * ## 日本語を入れない
 *
 * `<a download>` に日本語が1文字でも入っていると、**Chrome は名前ごと
 * 捨てて `download`（拡張子なし）にする。** 実測:
 *
 *     "ascii-plain.png"     → ascii-plain.png
 *     "No.1-背景なし.png"    → download
 *     "No1-背景.png"         → download
 *
 * 拡張子まで落ちるので、落とした人は何のファイルか分からなくなる。
 * 名前（YouTube のチャンネル名）もここに入れない——**人の名前は
 * たいてい日本語**なので、入れた人だけ `download` になる。
 *
 * ## 拡張子は元の URL から取る
 *
 * 置き場に入っているのは元の絵そのままなので、png のことも jpeg のことも
 * ある（背景ありは透明を持たないので jpeg で焼いてある）。決め打つと、
 * jpeg を `.png` という名前で落とすことになる。
 */
export function saveName(base: string, url: string): string {
  const m = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.exec(decodeURIComponent(url));
  /* ASCII の英数と `.-_` だけ残す。日本語が混ざると名前ごと捨てられる
     （上の実測）ので、**置き換えるのではなく落とす。** 全部落ちたら
     呼ぶ側の渡した名前が日本語だけだったということなので、既定の名前にする。 */
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "ayato-island"}.${(m?.[1] ?? "png").toLowerCase()}`;
}
