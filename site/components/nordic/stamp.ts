/**
 * 写真にキャラクターを1体だけ焼く。
 *
 * **合成はブラウザでやる。** サーバーで焼くと、同じ1枚を人数ぶん作って
 * 置いておくことになる。ここでやれば、押した人の端末で1枚作って渡すだけで済む。
 *
 * 寸法は `docs/nordic-photos.md` 5章。あやとの見本（トビリシのサメバ大聖堂を
 * 縦に撮った写真に、ネズミが右下に1体）から測った値がそのまま定数になっている。
 *
 * ## キャラクターの絵の CORS
 *
 * `lh3.googleusercontent.com` は `access-control-allow-origin: *` を返すので、
 * **`crossOrigin = "anonymous"` を付けて読めば canvas は汚れない。**
 * 付け忘れると汚れて、`toBlob` がその場で例外を投げる（写真のほうも同じ）。
 * ここを1か所に閉じ込めてあるのは、その付け忘れを起こさないため。
 */

/** 寸法。`docs/nordic-photos.md` 5章の表と1対1で対応する。 */
export const STAMP = {
  /** 縦の写真。キャラクターの横幅は、写真の横幅のこれだけ */
  byWidth: 0.34,
  /** 横の写真。横幅で決めると大きすぎるので、高さを基準にする */
  byHeight: 0.2,
  /** 右端からの空き（写真の横幅に対して） */
  right: 0.02,
  /** 下端からの空き（写真の高さに対して） */
  bottom: 0.05,
  /** 傾き。見本は0度だった */
  tilt: 0,
} as const;

/** 焼き上がりの長辺。これ以上大きくしても、持って帰る先で使い道がない。 */
export const OUT_LONG = 2048;

/** 貼るときに縮める長辺。10日ぶん何枚でも貼るので、元のままでは置き場が持たない。 */
export const UPLOAD_LONG = 1600;

/** 電波の細いところから貼るときの長辺。1600 のおよそ 1/3 の重さになる。 */
export const UPLOAD_THIN = 900;

export type Box = { x: number; y: number; w: number; h: number };

/**
 * 絵を1枚読む。**canvas に描くので必ず crossOrigin を付ける。**
 * 読めなかったら null。片方が読めないだけで画面が真っ白にならないように。
 */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  });
}

/**
 * 透明なふちを落とした、絵の中身のところ。
 *
 * キャラクターの絵は上下左右に透明な余白を持っている。そのまま置くと
 * 「下端からの空き 5%」が余白ぶんずれて、**足元が地面から浮く。**
 * 見えている画素の外接矩形を取って、そこを基準に置く。
 *
 * 読めなかったとき（描けない絵など）は、絵ぜんぶを返す。
 */
export function opaqueBox(img: HTMLImageElement): Box {
  const all = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  // 端の1画素まで見る必要はない。粗く見て軽くする
  const step = Math.max(1, Math.floor(Math.max(all.w, all.h) / 256));
  const cw = Math.max(1, Math.round(all.w / step));
  const ch = Math.max(1, Math.round(all.h / step));
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext("2d", { willReadFrequently: true });
  if (!g) return all;
  g.drawImage(img, 0, 0, cw, ch);
  let data: Uint8ClampedArray;
  try {
    data = g.getImageData(0, 0, cw, ch).data;
  } catch {
    // crossOrigin の付け忘れなど。ここで落とさず、絵ぜんぶを使う
    return all;
  }
  let x0 = cw;
  let y0 = ch;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return all;
  return {
    x: (x0 * all.w) / cw,
    y: (y0 * all.h) / ch,
    w: ((x1 - x0 + 1) * all.w) / cw,
    h: ((y1 - y0 + 1) * all.h) / ch,
  };
}

/**
 * 本人が動かした置き方。**動かしていないカードは渡さない。**
 * 割合（0〜1）で、`y` は足元の高さ（`docs/island-cards.md` 5章）。
 */
export type Place = { x: number; y: number; rot: number; scale: number };

/**
 * キャラクターを置くところ。返るのは**見えている中身**の矩形。
 *
 * 縦の写真は横幅で、横の写真は高さで決める（`docs/nordic-photos.md` 5章）。
 * 縦の写真で高さを基準にすると小さすぎ、横の写真で横幅を基準にすると
 * 画面の3分の1がキャラクターになる。
 *
 * **既定は右下ひとところ、大きさも1つ。** 台帳の `x/y/scale` を素直に
 * 使うと、散らした先が右端を越えて絵が切れ、1人ずつ大きさが変わる
 * （あやと・2026-09-10）。本人が動かしたぶんだけ `place` で受けて、
 * そのときも枠から出さない。**画面側（`components/cards/cards.ts` の
 * `cardPlace`）と同じ決め方にしてある。** 片方だけ直すと、見えている絵と
 * 持って帰る絵がずれる。
 *
 * @param pw 写真の横幅 @param ph 写真の高さ
 * @param cw キャラクターの中身の横幅 @param ch 同じく高さ
 */
export function stampBox(
  pw: number,
  ph: number,
  cw: number,
  ch: number,
  place?: Place | null,
): Box {
  const aspect = cw / Math.max(1, ch);
  const k = place ? Math.min(2, Math.max(0.4, place.scale || 1)) : 1;
  const w = (ph > pw ? pw * STAMP.byWidth : ph * STAMP.byHeight * aspect) * k;
  const h = w / aspect;
  if (!place) {
    return { x: pw - pw * STAMP.right - w, y: ph - ph * STAMP.bottom - h, w, h };
  }
  const x = Math.min(pw - w, Math.max(0, place.x * pw - w / 2));
  const y = Math.min(ph - h, Math.max(0, place.y * ph - h));
  return { x, y, w, h };
}

/**
 * 足元に落ちる影。
 *
 * 島の絵の決まりの3番目（`docs/island-design.md` 2章）。
 * これが無いと、キャラクターが景色の上に貼った紙に見える。
 * 逆に濃く落とすと、写真の地面が何であっても黒い楕円が乗るので、薄く。
 */
function groundShadow(g: CanvasRenderingContext2D, at: Box) {
  const cx = at.x + at.w / 2;
  const cy = at.y + at.h;
  const rx = at.w * 0.36;
  const ry = at.w * 0.09;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
  grad.addColorStop(0, "rgba(0,0,0,0.28)");
  grad.addColorStop(0.6, "rgba(0,0,0,0.13)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.save();
  g.translate(cx, cy);
  g.scale(1, ry / rx);
  g.translate(-cx, -cy);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * 写真にキャラクターを焼いて、canvas を返す。
 *
 * `chr` が null なら、写真をそのまま写した canvas が返る
 * （「そのまま保存」も同じ道を通す。道が2本あると片方だけ直し忘れる）。
 */
export function compose(
  photo: HTMLImageElement,
  chr: HTMLImageElement | null,
  /** 本人が動かしたときだけ渡す。既定（右下）でよければ渡さない */
  place?: Place | null,
): HTMLCanvasElement {
  const long = Math.max(photo.naturalWidth, photo.naturalHeight);
  const k = long > OUT_LONG ? OUT_LONG / long : 1;
  const pw = Math.round(photo.naturalWidth * k);
  const ph = Math.round(photo.naturalHeight * k);
  const cv = document.createElement("canvas");
  cv.width = pw;
  cv.height = ph;
  const g = cv.getContext("2d");
  if (!g) return cv;
  g.drawImage(photo, 0, 0, pw, ph);
  if (!chr) return cv;

  const src = opaqueBox(chr);
  const at = stampBox(pw, ph, src.w, src.h, place);
  groundShadow(g, at);
  // 傾きの原点は足元。傾けても足の位置が動かないようにする（画面側と同じ）
  const tilt = place ? Math.max(-20, Math.min(20, place.rot || 0)) : STAMP.tilt;
  if (tilt) {
    g.save();
    g.translate(at.x + at.w / 2, at.y + at.h);
    g.rotate((tilt * Math.PI) / 180);
    g.translate(-(at.x + at.w / 2), -(at.y + at.h));
  }
  g.drawImage(chr, src.x, src.y, src.w, src.h, at.x, at.y, at.w, at.h);
  if (tilt) g.restore();
  return cv;
}

/**
 * 持って帰る1枚にする。
 *
 * **JPEG で出す。** 置き場に持つのは webp（軽いので）だが、
 * 持って帰ったあとは、その人の端末の写真になる。webp を開けない
 * 送り先がまだあるので、渡すほうは JPEG にしておく。
 */
export function toJpeg(cv: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((done) => cv.toBlob(done, "image/jpeg", 0.92));
}

/** 焼き上がりの1枚に付ける名前。日付が入っていれば、あとから探せる。 */
export const stampFileName = (day: string) => `ayato-nordic-${day}.jpg`;

/**
 * 貼るまえに縮めて焼く。既定は長辺 1600px の webp。
 *
 * `createImageBitmap` に `imageOrientation: "from-image"` を渡すのは、
 * スマホの縦写真が **Exif の回転を持ったまま**入ってくるため。
 * 素朴に描くと、縦で撮った写真が横に倒れて貼られる。
 *
 * `long` を小さくすると、そのぶん送るものが軽くなる。**電波の細いところ
 * から貼るときのため**にある（`UPLOAD_THIN`）。旅の途中に「送れない」で
 * 止まるくらいなら、粗くても1枚入ったほうがいい。
 */
export async function shrink(
  file: File,
  long: number = UPLOAD_LONG,
): Promise<{ image: string; w: number; h: number } | null> {
  let src: ImageBitmap | HTMLImageElement | null = null;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    src = await loadImage(URL.createObjectURL(file));
  }
  if (!src) return null;
  const sw = "width" in src ? src.width : 0;
  const sh = "height" in src ? src.height : 0;
  const now = Math.max(sw, sh);
  const k = now > long ? long / now : 1;
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.drawImage(src as CanvasImageSource, 0, 0, w, h);
  /* **webp が出ない端末がある。** iOS の Safari は
     `toDataURL("image/webp")` を黙って png に落とす。前はそこで諦めていて、
     **あやとの iPhone から1枚も貼れなかった**（本番で「焼けなかった」）。
     旅の途中に貼るのはその iPhone なので、出なければ jpeg に落とす。

     png には落とさない。写真の png は jpeg の何倍にもなって、
     細い電波で送るという、この道具の用事そのものを壊す。 */
  let url = cv.toDataURL("image/webp", 0.82);
  if (!url.startsWith("data:image/webp")) url = cv.toDataURL("image/jpeg", 0.82);
  if (!url.startsWith("data:image/webp") && !url.startsWith("data:image/jpeg")) {
    return null;
  }
  return { image: url.slice(url.indexOf(",") + 1), w, h };
}
