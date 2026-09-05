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
 * キャラクターを置くところ。返るのは**見えている中身**の矩形。
 *
 * 縦の写真は横幅で、横の写真は高さで決める（`docs/nordic-photos.md` 5章）。
 * 縦の写真で高さを基準にすると小さすぎ、横の写真で横幅を基準にすると
 * 画面の3分の1がキャラクターになる。
 *
 * @param pw 写真の横幅 @param ph 写真の高さ
 * @param cw キャラクターの中身の横幅 @param ch 同じく高さ
 */
export function stampBox(pw: number, ph: number, cw: number, ch: number): Box {
  const aspect = cw / Math.max(1, ch);
  const w = ph > pw ? pw * STAMP.byWidth : ph * STAMP.byHeight * aspect;
  const h = w / aspect;
  return {
    x: pw - pw * STAMP.right - w,
    y: ph - ph * STAMP.bottom - h,
    w,
    h,
  };
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
  const at = stampBox(pw, ph, src.w, src.h);
  groundShadow(g, at);
  if (STAMP.tilt) {
    g.save();
    g.translate(at.x + at.w / 2, at.y + at.h);
    g.rotate((STAMP.tilt * Math.PI) / 180);
    g.translate(-(at.x + at.w / 2), -(at.y + at.h));
  }
  g.drawImage(chr, src.x, src.y, src.w, src.h, at.x, at.y, at.w, at.h);
  if (STAMP.tilt) g.restore();
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
 * 貼るまえに縮めて焼く。長辺 1600px の webp。
 *
 * `createImageBitmap` に `imageOrientation: "from-image"` を渡すのは、
 * スマホの縦写真が **Exif の回転を持ったまま**入ってくるため。
 * 素朴に描くと、縦で撮った写真が横に倒れて貼られる。
 */
export async function shrink(
  file: File,
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
  const long = Math.max(sw, sh);
  const k = long > UPLOAD_LONG ? UPLOAD_LONG / long : 1;
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.drawImage(src as CanvasImageSource, 0, 0, w, h);
  const url = cv.toDataURL("image/webp", 0.82);
  if (!url.startsWith("data:image/webp")) return null;
  return { image: url.slice(url.indexOf(",") + 1), w, h };
}
