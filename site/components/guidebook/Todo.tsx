import Icon from "@/components/ui/Icon";
import type { Guidebook, Item, Todo as TodoT } from "@/content/guidebook/types";

import { MiniTiles, type Mini } from "./About";
import Sheet from "./Sheet";
import { WentBox } from "./Videos";
import { Credit, Ext, Picture, Sec, SrcLine, sheetId } from "./parts";

/**
 * 4 やりたいことN選。**いちばんの柱。** 「この街ってこんなに楽しそう！」「これもあれもやってみたい！」と思ってもらう節。
 *
 * ## 見せかた（あやと 2026-11-16「やりたいこと8選がダサい（超重要）」）
 *
 * 前は写真と字の札を同じ大きさで8枚並べていて、単調だった。いまは雑誌の見開きの調子で、大小を混ぜる:
 *
 * - **1つ目は画面いっぱいの大きな絵**に、大きな題とキャッチコピー
 * - 残りは広い札（横長）と細い札（縦長）を交互に。狭い画面は2列、広い画面は4列。行の端で余った札は横へ広げる
 *   （`spans`。穴を空けない）
 * - 札の上の字は少なく: 番号・小さな印（`badge`）・題。キャッチコピーは1枚目だけ。行き方・お金・コツは窓の中
 *
 * 絵は描いたもの（manifest の `do.<id>`）が先、無いあいだはデータの写真、それも無ければ落ち着いた色の地
 * （面の側で差し替える。`app/travel/<国>/<街>/page.tsx`）。
 *
 * 押すと**見開き**が開く: どこで・何をする・いつ・行き方・時間・お金・コツ・回りかた。出てくる見たいもの・食べたいもの・
 * 買いたいものは、窓の「どこで」からそれぞれの窓へ繋ぐ。
 */
export default function Todo({ g, n }: { g: Guidebook; n: number }) {
  const items = g.todo;
  const of = {
    see: new Map(g.see.items.map((s) => [s.id, s])),
    eat: new Map(g.eat.items.map((s) => [s.id, s])),
    buy: new Map(g.buy.items.map((s) => [s.id, s])),
  };
  const lay = spans(items.length - 1);
  return (
    <Sec id="todo" n={n} icon="checklist" title={`やりたいこと${items.length}選`}>
      <ol className="gb-todo">
        {items.map((t, i) => {
          const size = i === 0 ? "hero" : lay[i - 1].m;
          return (
            <li key={t.id} className={`is-${size}`} data-d={i === 0 ? undefined : lay[i - 1].d} data-tone={i % 4}>
              <a className={`gb-todo-card${t.pic ? "" : " is-nopic"}`} href={`#${sheetId("do", t.id)}`}>
                {/* 絵の無いあいだは、色の地に大きな絵（`icon`）。描いた絵が来たら消える */}
                {!t.pic && t.icon && (
                  <span className="gb-todo-ic" aria-hidden="true">
                    <Icon name={t.icon} size={size === "hero" ? 180 : 96} />
                  </span>
                )}
                {t.pic && (
                  <Picture
                    pic={t.pic}
                    sizes={size === "hero" ? "(min-width: 960px) 900px, 100vw" : size === "w" ? "(min-width: 720px) 450px, 100vw" : "(min-width: 720px) 225px, 50vw"}
                    ratio={null}
                    eager={i < 2}
                  />
                )}
                <span className="gb-todo-top">
                  <b className="gb-todo-n" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </b>
                  {t.badge && <span className="gb-todo-badge">{t.badge}</span>}
                  {/* 「イラスト」の札は印の並びに置く（左下は題が乗る。`docs/guide-design.md` 4-3 の例外） */}
                  {t.pic?.kind === "illust" && <i className="gb-pic-tag">イラスト</i>}
                </span>
                <span className="gb-todo-b">
                  <span className="gb-todo-t">{t.title}</span>
                  {size === "hero" && <span className="gb-todo-c">{t.catch ?? t.lead}</span>}
                  {t.went && <span className="gb-went">行った</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      {items.map((t, i) => (
        <TodoSheet
          key={t.id}
          t={t}
          i={i}
          all={items}
          where={[
            ...pick(t.see, of.see, "see"),
            ...pick(t.eat ?? [], of.eat, "eat"),
            ...pick(t.buy ?? [], of.buy, "buy"),
          ]}
        />
      ))}
    </Sec>
  );
}

const pick = (ids: string[], m: Map<string, Item>, kind: Mini["kind"]): Mini[] =>
  ids.flatMap((id) => (m.has(id) ? [{ kind, it: m.get(id)! }] : []));

/**
 * 1つ目（大きな絵）の後ろに並ぶ札の大きさ。
 *
 * - `m`（狭い画面・2列）: 広い（2列ぶん）→ 細い → 細い の繰り返し。最後に細い札が1枚だけ残ったら、広い札にする
 * - `d`（広い画面・4列）: 広い＝2列・細い＝1列。最後の行が埋まらなければ、行の最後の札を残りの列まで広げる
 */
function spans(n: number): { m: "w" | "h"; d: number }[] {
  const m: ("w" | "h")[] = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? "w" : "h"));
  if (n > 0 && m[n - 1] === "h" && m[n - 2] !== "h") m[n - 1] = "w";
  const out = m.map((x) => ({ m: x, d: x === "w" ? 2 : 1 }));
  let col = 0;
  for (const x of out) col = (col + x.d) % 4 || 0;
  if (col && out.length) out[out.length - 1].d += 4 - col;
  return out;
}

/** 見開きの字の欄（「どこで」は札の並びで上に出す）。見出しに絵は付けない（`parts.tsx` の `Facts` と同じ理由） */
const ROWS: { key: keyof Pick<TodoT, "what" | "when" | "how" | "time" | "money" | "tip" | "route">; label: string }[] = [
  { key: "what", label: "何をする" },
  { key: "when", label: "いつ" },
  { key: "how", label: "行き方" },
  { key: "time", label: "時間" },
  { key: "money", label: "お金" },
  { key: "tip", label: "コツ" },
  { key: "route", label: "回りかた" },
];

function TodoSheet({ t, i, all, where }: { t: TodoT; i: number; all: TodoT[]; where: Mini[] }) {
  const prev = all[i - 1];
  const next = all[i + 1];
  return (
    <Sheet
      id={sheetId("do", t.id)}
      kicker={`やりたいこと ${i + 1} / ${all.length}`}
      title={t.title}
      wide
      hero={
        t.pic ? (
          <>
            <Picture pic={t.pic} sizes="(min-width: 720px) 440px, 100vw" ratio="16 / 10" />
            <Credit pic={t.pic} of={t.title} />
          </>
        ) : (
          /* 絵の無いあいだは、札と同じ色の地と絵の帯（番号だけの大きな空の枠を出さない） */
          <span className="gb-todo-ground" data-tone={i % 4} aria-hidden="true">
            {t.icon && <Icon name={t.icon} size={88} />}
          </span>
        )
      }
      foot={
        <span className="gb-pager">
          {prev ? (
            <a href={`#${sheetId("do", prev.id)}`} aria-label={`前のやりたいこと（${prev.title}）`}>
              <Icon name="left" size={16} />前へ
            </a>
          ) : (
            <span />
          )}
          {next && (
            <a href={`#${sheetId("do", next.id)}`} aria-label={`次のやりたいこと（${next.title}）`}>
              次へ
              <Icon name="right" size={16} />
            </a>
          )}
        </span>
      }
    >
      {t.catch && <p className="gb-catch">{t.catch}</p>}
      <p className="gb-lead">
        {t.badge && <span className="gb-todo-badge is-in">{t.badge}</span>}
        {t.lead}
      </p>
      {t.went && <WentBox w={t.went} of={t.title} />}
      {where.length > 0 && (
        <>
          <h4 className="gb-h4">どこで</h4>
          <MiniTiles items={where} />
        </>
      )}
      <Ext>
        <dl className="gb-facts is-todo">
          {/* 材料に字の無い欄は出さない（空の見出しを置かない） */}
          {ROWS.filter((r) => t[r.key]).map((r) => (
            <div key={r.key}>
              <dt>{r.label}</dt>
              <dd>{t[r.key]}</dd>
            </div>
          ))}
        </dl>
        <SrcLine src={t.src} of={t.title} />
      </Ext>
    </Sheet>
  );
}
