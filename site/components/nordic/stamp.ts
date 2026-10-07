/**
 * 写真にキャラクターを焼く。
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
 *
 * ## 置きどころの計算はここに書かない
 *
 * 寸法も締め方も2体の並べ方も `components/cards/place.ts` にある。
 * **ブラウザの要らない形にしておかないと、「枠から出ないか」「重ならないか」
 * を node から確かめられない**（`site/selftest/cardplace_selftest.mjs`）。
 * ここに残っているのは、絵を読む・透明なふちを落とす・canvas に描く、
 * の3つだけ。
 */

/* 寸法・置き方・2体の並べ方は `components/cards/place.ts`。
   **ここから呼ぶ側のために通してある**（import 先を増やさないため）。 */
export {
  STAMP,
  stampBox,
  clampPlace,
  defaultPlaceFor,
  layout,
  tiltOf,
  type Box,
  type Place,
  type Placed,
} from "@/components/cards/place";

import {
  layout,
  type Box,
  type Place,
  type Placed,
} from "@/components/cards/place";

/** 焼き上がりの長辺。これ以上大きくしても、持って帰る先で使い道がない。 */
export const OUT_LONG = 2048;

/** 貼るときに縮める長辺。10日ぶん何枚でも貼るので、元のままでは置き場が持たない。 */
export const UPLOAD_LONG = 1600;

/** 電波の細いところから貼るときの長辺。1600 のおよそ 1/3 の重さになる。 */
export const UPLOAD_THIN = 900;

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

/** 焼く1体ぶん。絵と、本人が動かした置き方。 */
export type Figure = { img: HTMLImageElement; place?: Place | null };

/**
 * 写真にキャラクターを焼いて、canvas を返す。
 *
 * **先頭が本人、2体目が連れ（あやと本人）。** 並べ方は
 * `components/cards/place.ts` の `layout` が決める——連れは本人を
 * 押しのけず、足元をそろえて、重ならないところに立つ。
 *
 * `figures` が空なら、写真をそのまま写した canvas が返る
 * （「そのまま保存」も同じ道を通す。道が2本あると片方だけ直し忘れる）。
 *
 * @param into 描き先。**渡すと作り直さずにそこへ描く。** 指で引きずって
 *   いるあいだ、1フレームごとに canvas を作り捨てないため
 */
export function composeMany(
  photo: HTMLImageElement,
  figures: Figure[],
  into?: HTMLCanvasElement | null,
): HTMLCanvasElement {
  const long = Math.max(photo.naturalWidth, photo.naturalHeight);
  const k = long > OUT_LONG ? OUT_LONG / long : 1;
  const pw = Math.round(photo.naturalWidth * k);
  const ph = Math.round(photo.naturalHeight * k);
  const cv = into ?? document.createElement("canvas");
  cv.width = pw;
  cv.height = ph;
  const g = cv.getContext("2d");
  if (!g) return cv;
  g.clearRect(0, 0, pw, ph);
  g.drawImage(photo, 0, 0, pw, ph);
  if (figures.length === 0) return cv;

  const src = figures.map((f) => opaqueBox(f.img));
  const at = layout(
    pw,
    ph,
    src.map((b, i) => ({ w: b.w, h: b.h, place: figures[i].place })),
  );
  /* **影を先に、ぜんぶまとめて落とす。** 1人ずつ「影→本体」で描くと、
     隣に立った人の足元の影が、先に描いた人の足の上に乗る。 */
  at.forEach((p) => groundShadow(g, p.box));
  at.forEach((p, i) => draw(g, figures[i].img, src[i], p));
  return cv;
}

/** 1体を、傾きと左右の返しごと描く。傾きの原点は足元（画面側と同じ）。 */
function draw(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement,
  src: Box,
  at: Placed,
) {
  const cx = at.box.x + at.box.w / 2;
  const foot = at.box.y + at.box.h;
  const moved = at.rot || at.flip;
  if (moved) {
    g.save();
    g.translate(cx, foot);
    if (at.rot) g.rotate((at.rot * Math.PI) / 180);
    // 左に立つ連れは左右を返す。**絵はどれも左を向いている**ので、
    // 返さないと本人に背を向けたまま並ぶ
    if (at.flip) g.scale(-1, 1);
    g.translate(-cx, -foot);
  }
  g.drawImage(img, src.x, src.y, src.w, src.h, at.box.x, at.box.y, at.box.w, at.box.h);
  if (moved) g.restore();
}

/**
 * 写真にキャラクターを1体だけ焼く。**いままでの呼び口。**
 *
 * `chr` が null なら、写真をそのまま写した canvas が返る。
 */
export function compose(
  photo: HTMLImageElement,
  chr: HTMLImageElement | null,
  /** 本人が動かしたときだけ渡す。既定（右下）でよければ渡さない */
  place?: Place | null,
): HTMLCanvasElement {
  return composeMany(photo, chr ? [{ img: chr, place }] : []);
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

/**
 * 焼き上がりの1枚に付ける名前。日付が入っていれば、あとから探せる。
 *
 * **`nordic` ではなく `island-card`。** 旅の写真の面をあやと島カードへ
 * 寄せたので（2026-09-10）、端末の写真フォルダに残る名前も面と揃える。
 * 旅が終わっても、この1枚は「あやと島カード」であり続ける。
 */
export const stampFileName = (day: string) => `ayato-island-card-${day}.jpg`;

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
