/**
 * **どんな街の地図の並べかた**（#1228）。描いた絵地図（`public/guide/<国>/<街>/manifest.json` の `areamap`）の上に、
 * 面の側で2つを重ねる:
 *
 * | | 何 | 置き場所 |
 * | --- | --- | --- |
 * | 地図の外の矢印 | 絵の外の所の向きと名前 | manifest の `beyond` の x・y（絵の縁）。動かさない |
 * | エリアの札 | 地区の名前。押すとエリアの窓 | manifest の `areas` の x・y。ふさがっていれば近くの空いた所へ |
 *
 * ## 概要だけを伝える（あやと 2026-11-16「見どころマップがダサい」）
 *
 * 前は番号つきの写真のピンを本当の位置に立て、下に地区ごとの番号の一覧を置いていた。詳しい場所は
 * 見たいもののマイマップの役目で、ここは「どのあたりがどんな地区か」が分かれば足りる。ピンと一覧はやめて、
 * 札と矢印だけにした（`docs/island-misses.md` #327）。
 *
 * ## いちばん狭い絵で決めて、割合で置く
 *
 * 位置は書き出すときに1回だけ決める（JS を使わない。画面が出た瞬間から押せる）。札の大きさは px なので、
 * 狭い画面ほど相対的に大きく見えて重なる。**いちばん狭い絵（`NARROW`）で重ならなければ、広い画面でも重ならない。**
 * 矢印どうしが重なるときと、札がどうしても置けないときは、**書き出しを止める**（黙って重ねない）。
 */

/** 位置を決める、いちばん狭い絵の幅（px）。390px の画面で絵は 366px。それより少し狭い端末（360px）も見込む */
export const NARROW = 340;
/** 札と矢印の見た目の高さ（CSS の `.gb-amap-pin` `.gb-amap-out` と同じ）。当たりは `::after` で 44px 以上 */
export const TAG_H = 34;
/** 2行の札の見た目の高さ（CSS の `.gb-amap-pin.is-2` と同じ） */
export const TAG_H2 = 44;
/** 見た目の箱どうしのすきま。当たりを広げたぶん（上下 5px）が、となりの見た目に食い込まない幅 */
const GAP = 6;
/**
 * 札と矢印を絵の縁から離す幅（px）。当たりは `::after` で上下に 5px 広げてあり、絵は `overflow: hidden` なので、
 * 縁に寄せると当たりが切れる（スコピエのヴォドノ山の矢印が、絵の下の縁で当たり 43px になった。2026-11-16）
 */
const EDGE = 6;
/** 札をずらしてよい距離（px） */
const TAG_REACH = 120;
/** 絵の右下の「イラスト・位置は目安」の札の大きさ（11.5px の字10字と余白） */
const NOTE_W = 132;
const NOTE_H = 20;

/** 字の幅の見積もり（px）。12.5px の太字で、全角 13px・半角 7.5px */
const textW = (s: string) => Math.ceil([...s].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 7.5 : 13), 0));

/** 1行で置く札の字数の上限。これより長い名前は2行にする（11字の札は、いちばん狭い絵の半分を塞いだ） */
const ONE_LINE = 7;

/**
 * 札の名前を、1行か2行に分ける。**分けどころは字の種類の変わり目か「・」「と」の後ろ**で、2行の長いほうが
 * いちばん短くなる所（ネフスキー／大聖堂まわり・市場と／シナゴーグ）。CSS に折らせないのは、どこで折れたかで
 * 札の幅が変わり、ここの見積もりと合わなくなるから
 */
export function tagLines(name: string): string[] {
  const cs = [...name];
  if (cs.length <= ONE_LINE) return [name];
  const kind = (c: string) => (/[゠-ヿ]/.test(c) ? "k" : /[぀-ゟ]/.test(c) ? "h" : /[\x20-\x7e]/.test(c) ? "a" : "c");
  let best: string[] = [name];
  let bw = Infinity;
  for (let i = 2; i <= cs.length - 2; i++) {
    const prev = cs[i - 1];
    const cut = prev === "・" || prev === "と" || (kind(prev) !== kind(cs[i]) && cs[i] !== "・" && cs[i] !== "ー");
    if (!cut) continue;
    const a = cs.slice(0, i).join("");
    const b = cs.slice(i).join("");
    const w = Math.max(textW(a), textW(b));
    if (w < bw) [best, bw] = [[a, b], w];
  }
  return best;
}

/** 札の箱（px）。左右の余白 20px と少しの遊び。2行なら高さ 44px。矢印は頭に向きの印（14px と間 4px）が付く */
export function tagBox(name: string, arrow = false) {
  const ls = arrow ? [name] : tagLines(name);
  return { w: Math.max(...ls.map(textW)) + 20 + 6 + (arrow ? 18 : 0), h: ls.length > 1 ? TAG_H2 : TAG_H };
}

type Rect = { id: string; x: number; y: number; w: number; h: number };
type In = { id: string; name: string; x: number; y: number };

export type Placed = {
  /** 札と矢印の中心（割合） */
  tags: { id: string; x: number; y: number }[];
  arrows: { id: string; x: number; y: number }[];
};

const rectHit = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP;

/**
 * 並べる。入力は割合（0〜1）、出力も割合。`tags` はエリアの札（manifest の位置）、`arrows` は地図の外の矢印（manifest の位置）。
 * 矢印を先に置く（縁の向きは動かせない）。札は manifest の位置から近い順に空いた所へ（横に動かすほうを重く見る。
 * 横の位置は地区の意味が強い）
 */
export function place(aspect: number, tags: In[], arrows: In[]): Placed {
  const W = NARROW;
  const H = NARROW * aspect;
  const px = (p: { x: number; y: number }) => ({ x: p.x * W, y: p.y * H });
  const out: Placed = { tags: [], arrows: [] };
  const inside = (r: Rect) => r.x - r.w / 2 >= EDGE && r.x + r.w / 2 <= W - EDGE && r.y - r.h / 2 >= EDGE && r.y + r.h / 2 <= H - EDGE;
  /* 絵の右下の「イラスト・位置は目安」の札（CSS の `.gb-amap-art .gb-pic-tag`）。だれも重ならない */
  const boxes: Rect[] = [{ id: "イラストの札", w: NOTE_W, h: NOTE_H, x: W - 6 - NOTE_W / 2, y: H - 6 - NOTE_H / 2 }];

  /* 1 矢印。絵の縁に置く。はみ出すぶんは内側へ寄せる（動かすのはそれだけ） */
  for (const a of arrows) {
    const { w } = tagBox(a.name, true);
    const p = px(a);
    const r = {
      id: a.id,
      w,
      h: TAG_H,
      x: Math.min(Math.max(p.x, w / 2 + EDGE), W - w / 2 - EDGE),
      y: Math.min(Math.max(p.y, TAG_H / 2 + EDGE), H - TAG_H / 2 - EDGE),
    };
    const o = boxes.find((q) => rectHit(q, r));
    if (o) throw new Error(`spotmap: 地図の外の矢印「${a.name}」と「${o.id}」が重なる（manifest の beyond の x・y を離す）`);
    boxes.push(r);
    out.arrows.push({ id: a.id, x: r.x / W, y: r.y / H });
  }

  /* 2 エリアの札 */
  const offs: { x: number; y: number }[] = [];
  for (let dy = -TAG_REACH; dy <= TAG_REACH; dy += 4)
    for (let dx = -TAG_REACH; dx <= TAG_REACH; dx += 4) if (Math.hypot(dx * 1.4, dy) <= TAG_REACH) offs.push({ x: dx, y: dy });
  offs.sort((a, b) => Math.hypot(a.x * 1.4, a.y) - Math.hypot(b.x * 1.4, b.y));
  for (const tg of tags) {
    const { w, h } = tagBox(tg.name);
    const p = px(tg);
    const got = offs.map((o) => ({ id: tg.id, w, h, x: p.x + o.x, y: p.y + o.y })).find((r) => inside(r) && !boxes.some((q) => rectHit(q, r)));
    if (!got) throw new Error(`spotmap: エリアの札「${tg.name}」を、矢印とほかの札に重ねずに置ける所が無い（manifest の areas の x・y を空いた所へ）`);
    boxes.push(got);
    out.tags.push({ id: tg.id, x: got.x / W, y: got.y / H });
  }
  return out;
}
