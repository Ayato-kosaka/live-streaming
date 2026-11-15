import type { Item, MapBBox } from "./types";

/**
 * **見どころマップの並べかた**（#1228。あやと 2026-11-15「こんな感じで地区分けして、見どころマップみたいにしたいの」）。
 *
 * 描いた絵地図（`public/guide/<国>/<街>/manifest.json` の `areamap`）の上に、面の側で3つを重ねる:
 *
 * | | 何 | 置き場所 |
 * | --- | --- | --- |
 * | 地図の外の矢印 | 絵の外の所の向きと名前 | manifest の `beyond` の x・y（絵の縁）。動かさない |
 * | 写真のピン | 番号つきの丸い写真。押すと見たいものの窓 | 座標（`Item.at`）を `bbox` で絵の上に直した所。重なるなら引き出し線を付けて近くへ |
 * | エリアの札 | 地区の名前。押すとエリアの窓 | manifest の `areas` の x・y。ふさがっていれば近くの空いた所へ |
 *
 * **どれを代表にするか（ピンを立てるか）は `types.ts` の `SpotRule` に書いた決まりどおり**。ここはそれを実行するだけ。
 * 矢印を最初に置く（縁の向きは動かせない）。ピンと札はどちらを先にするかで立つ本数が変わるので、両方を試して
 * 多く立つほうを使う（`place`）。札がどうしても置けないときは、**ピンを後ろから1本ずつ減らして**置き直す
 * （札を黙って重ねない）。
 *
 * ## いちばん狭い絵で決めて、割合で置く
 *
 * 位置は書き出すときに1回だけ決める（JS を使わない。画面が出た瞬間から押せる）。ピンと札の大きさは px なので、
 * 狭い画面ほど相対的に大きく見えて重なる。**いちばん狭い絵（`NARROW`）で重ならなければ、広い画面でも重ならない**
 * （エリアの札で 2026-11-15 に決めたのと同じ考え。前の `About.tsx` の `spread`）。
 *
 * ## 重なりの決まり
 *
 * - ピン・札・矢印は、どの2つも見た目の箱が重ならない（すきま `GAP`）
 * - **代表の候補（選ぶ順の前から `max` 件）の本当の位置（点）は、ピンが隠さない。** 隠すと、そこに何があるのか読めない。
 *   固まった所（ソフィアの中心は 300m の中に7つ）は、点だけを残して、ピンをまわりに広げる。札は立ったピンの点を隠さない
 * - 引き出し線は、ほかのピン・札・矢印・引き出し線と交わらない
 * - 矢印どうしが重なるときと、ピンを0本にしても札が置けないときは、**書き出しを止める**
 */

/** 位置を決める、いちばん狭い絵の幅（px）。390px の画面で絵は 366px。それより少し狭い端末（360px）も見込む */
export const NARROW = 340;
/** 写真のピンの直径（px。CSS の `.gb-amap-spot` と同じ）。当たりは `::after` で 48px まで広げる */
export const SPOT_D = 44;
/** 札と矢印の見た目の高さ（CSS の `.gb-amap-pin` `.gb-amap-out` と同じ）。当たりは `::after` で 44px 以上 */
export const TAG_H = 34;
/** 見た目の箱どうしのすきま。当たりを広げたぶん（上下 5px）が、となりの見た目に食い込まない幅 */
const GAP = 6;
/**
 * ピンをずらしてよい距離（px。いちばん狭い絵で）。これより遠くなら、そのピンは立てない（一覧にだけ出す）。
 * 前は 108 で、ソフィアの聖ソフィア教会が引き出し線 81px（390px の画面で 87px）の先に立った——線が長いと、
 * どの点のピンなのか読めない。近くは先に立った大事な順のピン（中央鉱泉浴場・ネフスキー大聖堂）と札で塞がっていて、
 * 寄せると別のピンが 100px 先へ追いやられた（2026-11-15）
 */
const SPOT_REACH = 72;
/** 札をずらしてよい距離（px） */
const TAG_REACH = 120;
/** 点を隠さないための余白（点の半径 4px ＋ 白いふち） */
const DOT_CLEAR = 6;
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
/** 2行の札の見た目の高さ（CSS の `.gb-amap-pin.is-2` と同じ） */
export const TAG_H2 = 44;

/**
 * 緯度経度を、絵の上の割合（0〜1。左上が 0,0）に直す。**緯度は web メルカトル**（OSM のタイルから描いた絵なので。
 * `python/build_bulgaria.py` の `at` と同じ式）
 */
export function project(b: MapBBox, lat: number, lon: number) {
  const merc = (d: number) => Math.log(Math.tan(Math.PI / 4 + (d * Math.PI) / 360));
  return {
    x: (lon - b.west) / (b.east - b.west),
    y: (merc(b.north) - merc(lat)) / (merc(b.north) - merc(b.south)),
  };
}

export const inBox = (p: { x: number; y: number }) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/**
 * 代表を選ぶ順（`SpotRule` の 2・3）。まず**エリアごとに1つ**（エリアの並びの順に、そのエリアでいちばん前のもの）、
 * 残りは 必見 → 行けたら → 余裕があれば → 星なし。同じ星なら、行った所 → やりたいことに出てくる数の多い所 → データの並び。
 *
 * エリアごとに1つを先にするのは、**地区分けの地図なのに、ピンの無い地区を作らない**ため（ソフィアの中心の必見4つを
 * 先に置くと、市場の一角にピンが1本も立たなかった）
 */
export function spotOrder<T extends Pick<Item, "id" | "rank" | "went" | "area">>(items: T[], todo: { see: string[] }[], areas: string[] = []) {
  const uses = (id: string) => todo.filter((t) => t.see.includes(id)).length;
  const ranked = items
    .map((it, i) => ({ it, i }))
    .sort(
      (a, b) =>
        (a.it.rank ?? 4) - (b.it.rank ?? 4) ||
        Number(!!b.it.went) - Number(!!a.it.went) ||
        uses(b.it.id) - uses(a.it.id) ||
        a.i - b.i,
    )
    .map((x) => x.it);
  const heads = areas.map((a) => ranked.find((it) => it.area === a)).filter((x): x is T => !!x);
  return [...heads, ...ranked.filter((it) => !heads.includes(it))];
}

type Pt = { x: number; y: number };
type Rect = { id: string; x: number; y: number; w: number; h: number };
type Seg = { a: Pt; b: Pt };
type In = { id: string; name: string; x: number; y: number };

export type Placed = {
  /** `x` `y` はピンの中心、`tx` `ty` は本当の位置（どちらも割合）。`leader` は引き出し線を引くか */
  pins: { id: string; x: number; y: number; tx: number; ty: number; leader: boolean }[];
  tags: { id: string; x: number; y: number }[];
  arrows: { id: string; x: number; y: number }[];
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const rectHit = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP;
/** 点から長方形までの距離（中なら 0） */
const toRect = (p: Pt, r: Rect) =>
  Math.hypot(Math.max(Math.abs(p.x - r.x) - r.w / 2, 0), Math.max(Math.abs(p.y - r.y) - r.h / 2, 0));
/** 点から線分までの距離 */
function toSeg(p: Pt, s: Seg) {
  const vx = s.b.x - s.a.x;
  const vy = s.b.y - s.a.y;
  const L = vx * vx + vy * vy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / L)) : 0;
  return Math.hypot(p.x - (s.a.x + t * vx), p.y - (s.a.y + t * vy));
}
/** 線分どうしが交わるか */
function segHit(s: Seg, t: Seg) {
  const cr = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  return cr(t.a, t.b, s.a) * cr(t.a, t.b, s.b) < 0 && cr(s.a, s.b, t.a) * cr(s.a, s.b, t.b) < 0;
}
/** 線分が長方形（すきま 2px 込み）を通るか。2px ずつ見る */
function segRect(s: Seg, r: Rect) {
  const n = Math.max(2, Math.ceil(dist(s.a, s.b) / 2));
  for (let i = 0; i <= n; i++) {
    const p = { x: s.a.x + ((s.b.x - s.a.x) * i) / n, y: s.a.y + ((s.b.y - s.a.y) * i) / n };
    if (toRect(p, r) < 2) return true;
  }
  return false;
}


/**
 * 並べる。入力は割合（0〜1）、出力も割合。
 *
 * - `spots` は代表を選ぶ順（`spotOrder`）に並べた、絵の範囲の中の見どころ。前から順に、置けるものだけ `max` まで
 * - `tags` はエリアの札（manifest の位置）、`arrows` は地図の外の矢印（manifest の位置）
 *
 * 札とピンのどちらを先に置くかで、立つピンの数が変わる（札を先に置くと札は manifest の位置に近く、ピンを先に置くと
 * 固まった所のピンが多く立つ）。**両方の順で、ピンの上限を `max` から1つずつ下げて試し、いちばん多くピンが立った
 * 並びを使う**（同じ数なら札が先）。0本でも札が置けなければ投げる（書き出しが止まる）
 */
export function place(aspect: number, spots: Omit<In, "name">[], tags: In[], arrows: In[], max: number): Placed {
  let best: Placed | null = null;
  let last: unknown;
  for (let n = Math.min(max, spots.length); n >= 0; n--) {
    for (const pinsFirst of [false, true]) {
      try {
        const r = attempt(aspect, spots, tags, arrows, n, pinsFirst);
        if (!best || r.pins.length > best.pins.length) best = r;
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("spotmap: 地図の外の矢印")) throw e;
        last = e;
      }
    }
    if (best && best.pins.length >= n) break;
  }
  if (!best) throw last;
  return best;
}

function attempt(aspect: number, spots: Omit<In, "name">[], tags: In[], arrows: In[], max: number, pinsFirst: boolean): Placed {
  const W = NARROW;
  const H = NARROW * aspect;
  const R = SPOT_D / 2;
  const px = (p: { x: number; y: number }) => ({ x: p.x * W, y: p.y * H });
  const out: Placed = { pins: [], tags: [], arrows: [] };
  const inside = (r: Rect) => r.x - r.w / 2 >= 2 && r.x + r.w / 2 <= W - 2 && r.y - r.h / 2 >= 2 && r.y + r.h / 2 <= H - 2;
  /** 隠してはいけない点（代表の候補） */
  const keep = spots.slice(0, max).map((s) => ({ id: s.id, ...px(s) }));
  /* 固まり（ピン1つぶんより近い点どうしを、つながる限りまとめたもの）の重心。ピンを外へ開く向きの元 */
  const hubOf = (pts: (Pt & { id: string })[]) => {
    const m = new Map<string, Pt>();
    const link = SPOT_D + GAP + 10;
    const grp = pts.map((_, i) => i);
    const root = (i: number): number => (grp[i] === i ? i : (grp[i] = root(grp[i])));
    pts.forEach((a, i) => pts.forEach((b, j) => j > i && dist(a, b) < link && (grp[root(i)] = root(j))));
    pts.forEach((a, i) => {
      const mem = pts.filter((_, j) => root(j) === root(i));
      m.set(a.id, { x: mem.reduce((s, d) => s + d.x, 0) / mem.length, y: mem.reduce((s, d) => s + d.y, 0) / mem.length });
    });
    return m;
  };
  let hub = hubOf(keep);
  /* 絵の右下の「イラスト・位置は目安」の札（CSS の `.gb-amap-art .gb-pic-tag`）。だれも重ならない */
  const boxes: Rect[] = [{ id: "イラストの札", w: NOTE_W, h: NOTE_H, x: W - 6 - NOTE_W / 2, y: H - 6 - NOTE_H / 2 }];
  const circles: (Pt & { id: string })[] = [];
  const segs: (Seg & { id: string })[] = [];

  /* 1 矢印。絵の縁に置く。はみ出すぶんは内側へ寄せる（動かすのはそれだけ） */
  for (const a of arrows) {
    const { w } = tagBox(a.name, true);
    const p = px(a);
    const r = {
      id: a.id,
      w,
      h: TAG_H,
      x: Math.min(Math.max(p.x, w / 2 + 2), W - w / 2 - 2),
      y: Math.min(Math.max(p.y, TAG_H / 2 + 2), H - TAG_H / 2 - 2),
    };
    const o = boxes.find((q) => rectHit(q, r));
    if (o) throw new Error(`spotmap: 地図の外の矢印「${a.name}」と「${o.id}」が重なる（manifest の beyond の x・y を離す）`);
    boxes.push(r);
    out.arrows.push({ id: a.id, x: r.x / W, y: r.y / H });
  }

  /* エリアの札。manifest の位置から近い順に、空いた所へ（横に動かすほうを重く見る。横の位置は地区の意味が強い）。
     代表の候補の点と、もう立ったピン・引き出し線を隠さない */
  const placeTags = () => {
    const offs: Pt[] = [];
    for (let dy = -TAG_REACH; dy <= TAG_REACH; dy += 4)
      for (let dx = -TAG_REACH; dx <= TAG_REACH; dx += 4) if (Math.hypot(dx * 1.4, dy) <= TAG_REACH) offs.push({ x: dx, y: dy });
    offs.sort((a, b) => Math.hypot(a.x * 1.4, a.y) - Math.hypot(b.x * 1.4, b.y));
    const pinned = new Set(out.pins.map((p) => p.id));
    const dots = pinsFirst ? keep.filter((d) => pinned.has(d.id)) : keep;
    for (const tg of tags) {
      const { w, h } = tagBox(tg.name);
      const p = px(tg);
      const got = offs
        .map((o) => ({ id: tg.id, w, h, x: p.x + o.x, y: p.y + o.y }))
        .find(
          (r) =>
            inside(r) &&
            !boxes.some((q) => rectHit(q, r)) &&
            !dots.some((d) => toRect(d, r) < DOT_CLEAR) &&
            !circles.some((c) => toRect(c, r) < R + GAP) &&
            !segs.some((sg) => segRect(sg, r)),
        );
      if (!got) throw new Error(`spotmap: エリアの札「${tg.name}」を、矢印と見どころに重ねずに置ける所が無い（manifest の areas の x・y を空いた所へ）`);
      boxes.push(got);
      out.tags.push({ id: tg.id, x: got.x / W, y: got.y / H });
    }
  };

  /* 写真のピン。選ぶ順に、本当の位置から近い所を探す */
  const ANG = 32;
  /** 点 `t`（本当の位置）のピンを置ける、いちばんよい中心。`dots` は隠してはいけない点、`self` は自分の id */
  const search = (self: string, t: Pt, dots: (Pt & { id: string })[]) => {
    /* 固まった所の外向き（自分の固まりの重心から、自分の点へ）。ずらすならこの向きへ——西の物は西へ、東の物は東へ
       開くので、ピンの並びが本当の並びと入れ替わらない */
    const g = hub.get(self) ?? t;
    const gl = dist(t, g);
    const out1 = gl > 2 ? { x: (t.x - g.x) / gl, y: (t.y - g.y) / gl } : null;
    let best: { c: Pt; score: number } | null = null;
    for (let r = 0; r <= SPOT_REACH; r += 3) {
      for (let k = 0; k < (r ? ANG : 1); k++) {
        const th = (k / ANG) * Math.PI * 2;
        const c = { x: t.x + r * Math.cos(th), y: t.y + r * Math.sin(th) };
        if (c.x < R + 2 || c.x > W - R - 2 || c.y < R + 2 || c.y > H - R - 2) continue;
        if (circles.some((o) => o.id !== self && dist(o, c) < 2 * R + GAP)) continue;
        if (boxes.some((q) => toRect(c, q) < R + GAP)) continue;
        if (dots.some((d) => d.id !== self && dist(d, c) < R + DOT_CLEAR)) continue;
        if (segs.some((q) => q.id !== self && toSeg(c, q) < R + 2)) continue;
        if (r > R - 8) {
          const sg = { a: t, b: c };
          if (circles.some((o) => o.id !== self && toSeg(o, sg) < R + 2)) continue;
          if (boxes.some((q) => segRect(sg, q))) continue;
          if (segs.some((q) => q.id !== self && segHit(sg, q))) continue;
        }
        /* 近いほど・外向きに近いほどよい（小さいほうを取る） */
        const turn = out1 && r ? 1 - (Math.cos(th) * out1.x + Math.sin(th) * out1.y) : 0;
        /* 内向き（90度より曲がる）へは引き出さない。固まりの反対側へ回ったピンは、隣と入れ替わって読める */
        if (turn > 1 && r > R - 8) continue;
        const score = r + 60 * turn;
        if (!best || score < best.score) best = { c, score };
      }
    }
    return best?.c ?? null;
  };
  /** もう立ったピンの、本当の位置（引き出し線の根もとの点） */
  const roots = () => out.pins.map((q) => ({ id: q.id, ...px({ x: q.tx, y: q.ty }) }));

  const placePins = () => {
    for (const s of spots) {
      if (out.pins.length >= max) break;
      const t = px(s);
      /* 自分の点が、もう置いたもので隠れているなら立てない（点の見えないピンは、どこを指すのか読めない） */
      if (circles.some((c) => dist(c, t) < R + DOT_CLEAR) || boxes.some((r) => toRect(t, r) < DOT_CLEAR)) continue;
      /* 守る点は、代表の候補と、もう立ったピン（候補の外から立ったものもある） */
      const c = search(s.id, t, [...keep, ...roots()]);
      if (!c) continue;
      const lead = dist(c, t) > R - 8;
      circles.push({ id: s.id, ...c });
      if (lead) segs.push({ id: s.id, a: t, b: c });
      out.pins.push({ id: s.id, x: c.x / W, y: c.y / H, tx: s.x, ty: s.y, leader: lead });
    }
  };

  /*
   * 仕上げ: 引き出し線のピンを、全部置いたあとでもう一度、本当の位置の近くへ寄せる。
   *
   * 置いている最中は、まだ立つか分からない候補の点まで空けておく（`keep`）。立たなかった候補の点は地図に出ないのに、
   * それを避けたピンが脇へ寄せられたままになる（ソフィアのネフスキー大聖堂は、立たなかった聖ソフィア教会の点を避けて
   * 15px ずれていた）。ここでは**立ったピンの点だけ**を守って、いまより近くが空いていれば寄せる。
   * ほかの決まり（重ならない・線が交わらない・札と矢印を隠さない・内向きへ回り込まない）はそのまま
   */
  const tidy = () => {
    /* 外向きも、立ったピンの点だけで固まりを組み直して決める（立たなかった点を入れると、固まりの重心がずれる） */
    hub = hubOf(roots());
    for (const p of out.pins) {
      if (!p.leader) continue;
      const t = px({ x: p.tx, y: p.ty });
      const ci = circles.findIndex((o) => o.id === p.id);
      const [mine] = circles.splice(ci, 1);
      const si = segs.findIndex((q) => q.id === p.id);
      const [line] = segs.splice(si, 1);
      const c = search(p.id, t, roots());
      if (!c || dist(c, t) >= dist(mine, t) - 3) {
        circles.push(mine);
        segs.push(line);
        continue;
      }
      const lead = dist(c, t) > R - 8;
      circles.push({ id: p.id, ...c });
      if (lead) segs.push({ id: p.id, a: t, b: c });
      Object.assign(p, { x: c.x / W, y: c.y / H, leader: lead });
    }
  };

  if (pinsFirst) {
    placePins();
    placeTags();
  } else {
    placeTags();
    placePins();
  }
  tidy();
  return out;
}
