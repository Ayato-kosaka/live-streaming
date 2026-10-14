"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Flag from "@/components/ui/Flag";
import { KINDS, recipeNo, type Recipe, type RecipeKind } from "@/content/recipes";
import Icon from "@/components/ui/Icon";
import { ArtShelf } from "./Art";

/**
 * 料理のカタログ。図鑑の見開きに並べる。
 *
 * `output: "export"` の静的書き出しなので、絞り込みは全部ブラウザ側でやる。
 * 開いた瞬間から全部のマスが入っていて、押すと減るだけ。読み込みが挟まらない。
 *
 * 絞る軸は2つ。国だけだと25品がジョージアに固まっていて絞る意味がないので、
 * 「どんな料理か」を足してある。粉ものが7品続いた時期のようなかたよりは、
 * 国ではなくこちらの軸に出る。
 *
 * 並びかたを覚えさせない（localStorage を使わない）のはわざと。
 * 次に来たときも「新しい順」から始まったほうが、何が最近作られたか分かる。
 *
 * ## なぜ32品を一度に並べないか
 *
 * 32枚のマスを積むと、それだけで 3,899px あった（面の 5,515px のうち71%）。
 * マスを小さくして詰める手も試したが、料理の絵がマスの縦半分を切ると
 * 図鑑ではなくただの一覧に戻る（`docs/ac-reference.md` 7章 4）。
 *
 * だから**マスは小さくせず、帳面のようにページで送る。**
 * スタンプ帳は本物も見開き単位でめくるものなので、この面の型に合っている。
 * 1ページ8マス。32品がちょうど4ページに割れる数で、狭い画面で2×4、
 * 広い画面で4×2。絞り込むと1ページ目に戻る。
 */

/** 1ページに載せるマスの数。32品が端数なく4ページに割れる。 */
const PER = 8;

type Country = { slug: string; name: string };
type Order = "new" | "old" | "work";

const ORDERS: { id: Order; label: string }[] = [
  { id: "new", label: "新しい順" },
  { id: "old", label: "古い順" },
  { id: "work", label: "手間のかかった順" },
];

export default function KitchenCatalog({
  recipes,
  countries,
}: {
  recipes: Recipe[];
  countries: Country[];
}) {
  const [country, setCountry] = useState<string>("all");
  const [kind, setKind] = useState<RecipeKind | "all">("all");
  const [order, setOrder] = useState<Order>("new");
  const [page, setPage] = useState(0);
  /** しぼりの欄を出しているか。**焼いた姿は閉じたまま**（開くと背が 417px 伸びる） */
  const [sift, setSift] = useState(false);
  // ページを送ったとき、目が迷子にならないよう格子の頭へ戻す。
  // 最初に開いたときは動かさない（勝手にスクロールしない）。
  const gridTop = useRef<HTMLDivElement>(null);

  /** 軸ごとの数。絞り込む前の数で数える。押す前に「何品あるか」が見えるように。 */
  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    recipes.forEach((r) => m.set(r.country, (m.get(r.country) ?? 0) + 1));
    return m;
  }, [recipes]);
  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    recipes.forEach((r) => m.set(r.kind, (m.get(r.kind) ?? 0) + 1));
    return m;
  }, [recipes]);

  const shown = useMemo(() => {
    const list = recipes.filter(
      (r) => (country === "all" || r.country === country) && (kind === "all" || r.kind === kind),
    );
    return list.sort((a, b) => {
      if (order === "work" && a.streams.length !== b.streams.length) return b.streams.length - a.streams.length;
      return order === "old" ? (a.date < b.date ? -1 : 1) : a.date < b.date ? 1 : -1;
    });
  }, [recipes, country, kind, order]);

  const pages = Math.max(1, Math.ceil(shown.length / PER));
  // 絞り込みや並びを変えたら1ページ目に戻す。25品のジョージアから
  // 3品のイギリスへ絞ったとき、3ページ目のまま空っぽが出ていた。
  useEffect(() => {
    setPage(0);
  }, [country, kind, order]);
  const at = Math.min(page, pages - 1);
  const sheet = shown.slice(at * PER, at * PER + PER);

  const turn = (n: number) => {
    setPage(Math.min(Math.max(n, 0), pages - 1));
    gridTop.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const used = countries.filter((c) => byCountry.has(c.slug));
  const reset = country === "all" && kind === "all";

  /**
   * 畳んだ札に出す「いま何でしぼっているか」。
   *
   * **手で書かない。** 選んでいるものから組む。軸を1つ足した日に、
   * ここの字だけが古くなるのを避ける（`docs/island-standards.md` 8章）。
   * 絞っていないときは「ぜんぶ」と言う——**黙らない。**
   * 黙ると、閉じている札が「絞り込みが効いていない」と見分けがつかない。
   */
  const sifting = [
    country === "all" ? "ぜんぶ" : (countries.find((c) => c.slug === country)?.name ?? "ぜんぶ"),
    kind === "all" ? null : KINDS.find((k) => k.id === kind)?.label,
    ORDERS.find((o) => o.id === order)!.label,
  ]
    .filter(Boolean)
    .join("・");

  return (
    <>
      <div className="zk-zone is-tight">
        {/* **絞り込みは畳んで置く。**

            開いたまま置いていたら、390px の1画面目（844px）に料理の絵が
            1画素も入っていなかった（実測。1画面目の絵は面積の 5.2% で、
            いちばん大きいのは見出しの小屋 70x70。棚の絵は 806px の位置で、
            38px しか顔を出していない）。**ここはスタンプ帳なので、
            開いて最初に出るのは押したスタンプそのもの**
            （`docs/island-standards.md` 1章。住民図鑑が同じ理由で
            数字と説明を絵の下へ回している——`app/friends/page.tsx`）。

            軸そのものは消さない。**畳んだ札に、いま何でしぼっているかを出す**
            ので、閉じていても「ぜんぶ見ているのか、絞っているのか」は分かる。
            品数とページ目は畳みの外に置いて、**畳んでも消えない。** */}
        {/* **`<details>` では畳まない。**

            畳んだ `<details>` の中は `content-visibility: hidden` で描かれない。
            旗（`components/ui/Flag.tsx`）の三日月は `<mask id="cm-az">` を
            自分の svg の中に持っていて、id は文書ぜんぶで1つの名前空間なので、
            **文書順のいちばん先にあるもの**に解決される。畳みの中の国チップが
            その1つ目になると、**描かれていない型**を指すことになり、
            後ろのマスのアゼルバイジャン旗が3枚とも**白い四角**で出た
            （実測。畳んだまま最終ページで 208B / 開いてから 411B）。
            消さずに「畳む」とこうなるので、**閉じているあいだは置かない。**

            しぼりは JS でやっているので、JS の無い人には押しても何も起きない。
            置かないほうが正しい。 */}
        <button
          type="button"
          className="kt-sift-sum"
          aria-expanded={sift}
          onClick={() => setSift(!sift)}
        >
          <ArtShelf size={26} />
          <b>しぼる</b>
          <span className="kt-sift-now">{sifting}</span>
          <Icon name="chevron" size={14} className={`kt-sift-arw${sift ? " is-up" : ""}`} />
        </button>
        {sift && (
          <div className="kt-tools">
          <div className="zk-picks">
            <b className="zk-picks-t">どこで</b>
            <button type="button" className={`zk-pick${country === "all" ? " is-on" : ""}`} onClick={() => setCountry("all")}>
              ぜんぶ<em>{recipes.length}</em>
            </button>
            {used.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={`zk-pick${country === c.slug ? " is-on" : ""}`}
                onClick={() => setCountry(c.slug)}
              >
                <Flag slug={c.slug} size={17} />
                {c.name}
                <em>{byCountry.get(c.slug)}</em>
              </button>
            ))}
          </div>

          <div className="zk-picks">
            <b className="zk-picks-t">なにを</b>
            <button type="button" className={`zk-pick${kind === "all" ? " is-on" : ""}`} onClick={() => setKind("all")}>
              ぜんぶ
            </button>
            {KINDS.filter((k) => byKind.has(k.id)).map((k) => (
              <button key={k.id} type="button" className={`zk-pick${kind === k.id ? " is-on" : ""}`} onClick={() => setKind(k.id)}>
                {k.label}
                <em>{byKind.get(k.id)}</em>
              </button>
            ))}
          </div>

          <div className="zk-picks">
            <b className="zk-picks-t">ならび</b>
            {ORDERS.map((o) => (
              <button key={o.id} type="button" className={`zk-pick${order === o.id ? " is-on" : ""}`} onClick={() => setOrder(o.id)}>
                {o.label}
              </button>
            ))}
          </div>

          </div>
        )}

        {/* **品数とページ目は、畳みの外。** 「何品あって、いま何ページ目か」は
            畳んでいても要る（`docs/island-standards.md` の「送らなくても分かる」）。 */}
        <p className="kt-count">
          <b>{shown.length}</b> 品ならんでる
          {pages > 1 && <span className="kt-pageof">{at + 1} / {pages} ページ目</span>}
          {/* 0品のときは空っぽの枠のほうが「ぜんぶ出す」を出す。
              同じボタンが1画面に2つ並ばないようにする。 */}
          {!reset && shown.length > 0 && (
            <button
              type="button"
              className="kt-clear"
              onClick={() => {
                setCountry("all");
                setKind("all");
              }}
            >
              ぜんぶ出す
            </button>
          )}
        </p>
      </div>

      <div className="zk-zone is-flush">
        {shown.length === 0 ? (
          /* 空っぽの形は島に1つしかない（`docs/island-world.md` 4.1）。
             ここだけ自前の1行にしていたので、他の面と同じ枠に寄せる。
             次にする一手（絞り込みを外す）を板で1つ置く。 */
          <div className="blank">
            <b>この組み合わせは、まだ押されていない</b>
            <p>ほかの国か、ほかの種類なら押してあるかも。</p>
            <button
              type="button"
              className="blank-go"
              onClick={() => {
                setCountry("all");
                setKind("all");
              }}
            >
              ぜんぶ出す
            </button>
          </div>
        ) : (
          <div className="kt-grid-wrap" ref={gridTop}>
            <div className="kt-grid">
              {sheet.map((r) => (
                <Dish key={r.slug} r={r} />
              ))}
            </div>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="zk-zone is-tight">
          {/* 帳面をめくる。住民図鑑の送り（`.rzk-pager`）と同じ役なので、同じ形にする。
              端まで来たら押せなくする。輪にすると、何周でも回れてしまって
              「ぜんぶ見た」が分からない。 */}
          <nav className="kt-pager" aria-label="スタンプ帳をめくる">
            <button type="button" onClick={() => turn(at - 1)} disabled={at === 0}>
              <Icon name="left" size={14} />
              まえのページ
            </button>
            <span>
              <b>{at + 1}</b> / {pages}
            </span>
            <button type="button" onClick={() => turn(at + 1)} disabled={at === pages - 1}>
              つぎのページ
              <Icon name="right" size={14} />
            </button>
          </nav>
        </div>
      )}
    </>
  );
}

/**
 * 1品のマス。
 *
 * 図鑑と同じで、マスは板ではなく紙の上の区画。
 * 番号・絵・名前・どこで・いつ、が上から順に必ず同じ位置に来る。
 */
export function Dish({ r }: { r: Recipe }) {
  return (
    // 一覧の30枚が画面に入っただけで行き先を先読みすると、この面だけで 228KB になる。
    // prefetch={false} は「読まない」ではなく「指が乗ってから読む」なので、押した速さは変わらない。
    <Link className="dish" href={`/kitchen/${r.slug}`} prefetch={false}>
      <span className="dish-no">No.{String(recipeNo(r.slug)).padStart(2, "0")}</span>
      {r.streams.length > 1 && <span className="dish-days">{r.streams.length}日がかり</span>}
      <span className="dish-art">
        <img src={`/sprites/${r.icon}.webp`} alt="" loading="lazy" />
      </span>
      <b className="dish-name">{r.name}</b>
      {/* 料理の種類の札は、すぐ上の「なにを」で選ぶ軸そのものなので、
          マスの中でもう一度は言わない。「ごはん・麺」だけがこの行を
          2行に折り返していて、その1行のために格子が3行ぶん伸びていた。
          種類は開いた1枚（`/kitchen/[品]`）の記録の欄に出る。 */}
      <span className="dish-m">
        <Flag slug={r.country} size={16} />
        {r.date.replace(/-/g, "/")}
      </span>
    </Link>
  );
}
