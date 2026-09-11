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
 * 落とすときのファイル名。**拡張子は元の URL から取る。**
 *
 * 置き場に入っているのは元の絵そのままなので、png のことも jpeg のことも
 * ある（背景ありは透明を持たないので jpeg で焼いてある）。決め打つと、
 * jpeg を `.png` という名前で落とすことになる。
 */
export function saveName(base: string, url: string): string {
  const m = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.exec(decodeURIComponent(url));
  /* 名前は人が付けたものが入る（YouTube のチャンネル名）。**そのまま
     ファイル名にしない。** `/` が入っていると、落ちる先が変わったり
     名前が切れたりする。空になったら番号だけの名前になるので、
     呼ぶ側が「No.5」のような代わりを渡している。 */
  const safe = base.replace(/[\\/:*?"<>|]/g, "-").trim() || "character";
  return `${safe}.${(m?.[1] ?? "png").toLowerCase()}`;
}
