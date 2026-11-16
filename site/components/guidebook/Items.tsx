import type { ReactNode } from "react";

import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import type { Guidebook, Item, MyMap as MyMapT, Place, Todo } from "@/content/guidebook/types";

import MyMap from "./MyMap";
import Sheet from "./Sheet";
import { WentBox } from "./Videos";
import { Credit, Ext, Facts, FlagMarks, LocalName, MapsLink, Picture, STAR, Sec, SrcLine, sheetId, shortName } from "./parts";

type Kind = "see" | "eat" | "buy";

/**
 * 5〜7 見たいもの・食べたいもの・買いたいもの。**写真の札の格子 → 押すと窓**と、**マイマップ**。
 *
 * 節の名前は「見たいもの」「食べたいもの」「買いたいもの」（あやと 2026-11-16。前は「どこを見る？」の問いの形）。
 * **見たいものだけ、マイマップが上**——見たいものの地図は「どこにあるか」を先に知りたい人のもので、どんな街の地図
 * （概要）から「詳しい場所は…」で飛んでくる先でもある（`#see-mymap`）。食べたい・買いたいは、品を見てから店を探すので下。
 *
 * 札に出すのは絵・名前・1行（値段か距離）だけ。字は窓の中（あやと「文字文字しくならないように」）。
 * 一面に並ぶ札が全部押せるので、1枚ずつに厚みは付けない（`docs/island-design.md` 3章3の例外）。
 */
export function Tiles({ kind, items, cols, todo }: { kind: Kind; items: Item[]; cols: 2 | 3; todo: Todo[] }) {
  return (
    <>
      <ul className={`gb-tiles is-${cols}`}>
        {items.map((it, i) => (
          <li key={it.id} data-kinds={it.kinds?.join(" ")}>
            {/* 同じ名前の品が食べたいと買いたいの両方にある（ラキヤ・ヴラネツ）。読み上げの名前に節を入れて分ける。
                字で足すと、見えない字が面の字に数えられる（`guidebook.mjs` の字の量）ので、名前で渡す */}
            <a className="gb-tile" href={`#${sheetId(kind, it.id)}`} aria-label={tileName(kind, it)}>
              <Picture
                pic={it.pic}
                sizes={cols === 3 ? "(min-width: 720px) 220px, 31vw" : "(min-width: 720px) 300px, 46vw"}
                ratio={cols === 3 ? "1 / 1" : "4 / 3"}
                eager={kind === "see" && i < 2}
                label={shortName(it.name).slice(0, 1)}
              />
              {it.rank === 1 && kind === "see" && <span className="gb-must">必見</span>}
              <FlagMarks f={it.flags} />
              <span className="gb-tile-b">
                <b>{shortName(it.name)}</b>
                {it.line && <i>{it.line}</i>}
                {it.went && <span className="gb-went">行った</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {items.map((it) => (
        <ItemSheet key={it.id} kind={kind} it={it} todo={todo} />
      ))}
    </>
  );
}

const KICKER: Record<Kind, string> = { see: "見たいもの", eat: "食べたいもの", buy: "買いたいもの" };

/** 札の読み上げの名前。名前・節・1行・印（豚肉あり・アルコールあり・行った） */
function tileName(kind: Kind, it: Item) {
  const marks = [it.flags?.pork && "豚肉あり", it.flags?.alcohol && "アルコールあり", it.went && "行った"].filter(Boolean);
  return [`${shortName(it.name)}（${KICKER[kind]}）`, it.line, ...marks].filter(Boolean).join("・");
}

function ItemSheet({ kind, it, todo }: { kind: Kind; it: Item; todo: Todo[] }) {
  const ts = (it.todo ?? []).map((id) => todo.find((t) => t.id === id)).filter((t): t is Todo => !!t);
  return (
    <Sheet
      id={sheetId(kind, it.id)}
      kicker={KICKER[kind]}
      title={it.name}
      wide
      hero={
        <>
          <Picture pic={it.pic} sizes="(min-width: 720px) 440px, 100vw" ratio="4 / 3" label={shortName(it.name).slice(0, 1)} />
          <Credit pic={it.pic} of={it.name} />
        </>
      }
    >
      <p className="gb-name-row">
        <LocalName l={it.local} full />
        {it.rank && (
          <span className="gb-star">
            <b aria-hidden="true">{"★".repeat(4 - it.rank)}</b>
            {STAR[it.rank]}
          </span>
        )}
      </p>
      <FlagMarks f={it.flags} big />
      {it.went && <WentBox w={it.went} of={it.name} />}
      <ExtOf src={it.src}>
        {it.body && <p>{it.body}</p>}
        <Facts rows={it.facts} />
        {it.tip && (
          <p className="gb-tip">
            <b>コツ</b>
            {it.tip}
          </p>
        )}
        <SrcLine src={it.src} of={it.name} />
      </ExtOf>
      {it.maps && <MapsLink href={it.maps} of={it.name} label={kind === "see" ? "Google マップで開く" : "近くの店を Google マップで探す"} />}
      {ts.length > 0 && (
        <p className="gb-rel">
          <span>やりたいことで回る</span>
          {ts.map((t) => (
            <a key={t.id} href={`#${sheetId("do", t.id)}`}>
              {t.title}
            </a>
          ))}
        </p>
      )}
    </Sheet>
  );
}

/** 出どころのある字だけを、外の事実の入れ物に入れる（出どころの無い入れ物を作らない） */
function ExtOf({ src, children }: { src: unknown[]; children: ReactNode }) {
  return src.length ? <Ext>{children}</Ext> : <>{children}</>;
}

/** 地図の下の、店・市場の一覧。**地図の番号と、名前で開く本物の Google マップを1つに結ぶ** */
export function Places({ rows, items, kind }: { rows: Place[]; items: Item[]; kind: "eat" | "buy" }) {
  /* 店の説明に出どころが在る街（スコピエ）は、外の事実の入れ物に入れて、一覧の下に出どころを1行 */
  const seen = new Set<string>();
  const src = rows.flatMap((p) => p.src ?? []).filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  const list = (
    <ol className="gb-places">
      {rows.map((p, i) => {
        const here = items.filter((it) => it.places?.includes(p.id));
        return (
          <li key={p.id}>
            <b className="gb-places-n">{i + 1}</b>
            <span className="gb-places-b">
              <b>
                {p.name}
                {p.went && <span className="gb-went">行った</span>}
              </b>
              {p.roman && <i>{p.roman}</i>}
              <em>{p.what}</em>
              {p.km !== undefined && <span className="gb-far-km">中心から{p.km}km</span>}
              {here.length > 0 && (
                <span className="gb-places-it">
                  {here.map((it) => (
                    /* 同じ名前の品が食べたいと買いたいの両方にある（リュテニツァ）。読み上げの名前で分ける */
                    <a key={it.id} href={`#${sheetId(kind, it.id)}`} aria-label={`${shortName(it.name)}（${KICKER[kind]}）`}>
                      {shortName(it.name)}
                    </a>
                  ))}
                </span>
              )}
            </span>
            <MapsLink href={p.maps} of={p.name} label="マップ" />
          </li>
        );
      })}
    </ol>
  );
  return src.length ? (
    <Ext>
      {list}
      <SrcLine src={src} of={`${KICKER[kind]}の店と市場`} />
    </Ext>
  ) : (
    list
  );
}

/** 見たいもの。**マイマップが上**、その下に星の順の札（必見と行けたら）。余裕があればは畳む */
export function See({ g, n }: { g: Guidebook; n: number }) {
  const items = g.see.items;
  const top = items.filter((s) => (s.rank ?? 3) <= 2).sort((a, b) => (a.rank ?? 3) - (b.rank ?? 3));
  const rest = items.filter((s) => (s.rank ?? 3) > 2);
  return (
    <Sec id="see" n={n} icon="camera" title="見たいもの">
      {g.see.map && (
        <MapBlock m={g.see.map} caption={`見たいもの${g.see.map.pins}か所。ピンを押すと名前と説明`} icon="map" title="地図で見る" id="see-mymap" first />
      )}
      <Tiles kind="see" items={top} cols={2} todo={g.todo} />
      {rest.length > 0 && (
        <Fold title={`ほかにも${rest.length}か所`} lead={STAR[3]}>
          <Tiles kind="see" items={rest} cols={2} todo={g.todo} />
        </Fold>
      )}
      {g.see.far.length > 0 && <h3 className="gb-sub is-small">中心から離れた所</h3>}
      {g.see.far.length > 0 && (
        <ul className="gb-far">
          {g.see.far.map((f) => (
            <li key={f.id}>
              <a href={`#${sheetId("see", f.id)}`}>{f.name}</a>
              <i>中心から{f.km}km</i>
              <MapsLink href={f.maps} of={f.name} label="マップ" />
            </li>
          ))}
        </ul>
      )}
    </Sec>
  );
}

/**
 * 食べたいもの。**種類の札で絞る**（朝ごはん・食堂で・市場と屋台・飲みもの）。
 *
 * 絞りは JS を使わない。札は `<input type="radio">` で、`:has()` で格子の札を隠す——
 * 画面が出た瞬間から押せて、キーボードでは矢印で選べる。JS が無い・`:has()` が無いブラウザでは、全部が並ぶ。
 */
export function Eat({ g, n }: { g: Guidebook; n: number }) {
  const { kinds, items, places, map } = g.eat;
  const pork = items.filter((it) => it.flags?.pork).length;
  const alcohol = items.filter((it) => it.flags?.alcohol).length;
  const name = `gb-kind-${g.city}`;
  return (
    <Sec id="eat" n={n} icon="eat" title="食べたいもの">
      <div className="gb-eat">
        <fieldset className="gb-kinds">
          <legend className="sr-only">種類で絞る</legend>
          <input type="radio" name={name} id={`${name}-all`} value="all" defaultChecked />
          <label htmlFor={`${name}-all`}>
            すべて<i>{items.length}</i>
          </label>
          {kinds.map((k) => (
            <KindRadio key={k.id} name={name} id={k.id} count={items.filter((it) => it.kinds?.includes(k.id)).length}>
              {k.label}
            </KindRadio>
          ))}
        </fieldset>
        <style>
          {kinds
            .map((k) => `.gb-eat:has(#${name}-${k.id}:checked) .gb-tiles > li:not([data-kinds~="${k.id}"]){display:none}`)
            .join("")}
        </style>
        <p className="gb-legend">
          <span className="gb-flag is-pork" aria-hidden="true">
            <b>豚</b>
          </span>
          豚肉あり（{pork}品）
          <span className="gb-flag is-alcohol" aria-hidden="true">
            <b>酒</b>
          </span>
          アルコールあり（{alcohol}品）
        </p>
        <Tiles kind="eat" items={items} cols={3} todo={g.todo} />
      </div>
      <MapBlock m={map} caption={map && `${map.pins}か所。ピンを押すと名前と説明`} icon="eat" title="この料理は、ここで" />
      <Fold title="店と市場の一覧" note={`${places.length}か所`}>
        <Places rows={places} items={items} kind="eat" />
      </Fold>
    </Sec>
  );
}

function KindRadio({ name, id, count, children }: { name: string; id: string; count: number; children: ReactNode }) {
  return (
    <>
      <input type="radio" name={name} id={`${name}-${id}`} value={id} />
      <label htmlFor={`${name}-${id}`}>
        {children}
        <i>{count}</i>
      </label>
    </>
  );
}

export function Buy({ g, n }: { g: Guidebook; n: number }) {
  const { items, places, map } = g.buy;
  return (
    <Sec id="buy" n={n} icon="souvenir" title="買いたいもの">
      <Tiles kind="buy" items={items} cols={3} todo={g.todo} />
      <MapBlock m={map} caption={map && `${map.pins}か所。ピンを押すと名前と説明`} icon="market" title="買える所" />
      <Fold title="店と市場の一覧" note={`${places.length}か所`}>
        <Places rows={places} items={items} kind="buy" />
      </Fold>
    </Sec>
  );
}

/**
 * 節の下の地図。**マイマップがまだ無い街は、枠を出さずに見出しだけ**——下の店の一覧の「マップ」の札が、
 * 名前で検索した Google マップを1軒ずつ開く（#1228。マイマップは別の担当が作る）
 */
function MapBlock({
  m,
  caption,
  icon,
  title,
  id,
  first,
}: {
  m?: MyMapT;
  caption?: string;
  icon: IconName;
  title: string;
  /** 面の中の錨（どんな街の地図から飛んでくる先） */
  id?: string;
  /** 節の頭に置く（上の余白を詰める） */
  first?: boolean;
}) {
  return (
    <div className={`gb-mapblock${first ? " is-first" : ""}`} id={id}>
      <h3 className="gb-sub">
        <Icon name={icon} size={20} />
        {title}
      </h3>
      {m && caption && <MyMap m={m} caption={caption} />}
    </div>
  );
}
