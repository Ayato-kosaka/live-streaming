import Icon from "@/components/ui/Icon";
import type { Guidebook, Item, Todo as TodoT } from "@/content/guidebook/types";

import { MiniTiles, type Mini } from "./About";
import Sheet from "./Sheet";
import { WentBox } from "./Videos";
import { Credit, Ext, Marks, Picture, Sec, SrcLine, sheetId } from "./parts";

/**
 * 4 やりたいことN選。**いちばんの柱。** 「この街ってこんなに楽しそう！」「これもあれもやってみたい！」と思ってもらう節。
 *
 * ## 見せかた（あやと 2026-11-16「基本的には、すべてのカードを同じサイズ・比率に統一し、縦1列に並べたい」）
 *
 * **札は全部同じ大きさ・同じ比率（4:3。描いた絵と借りた写真の比）で、縦1列。** 前は1枚目だけ画面いっぱいに大きく、
 * 残りを広い札と細い札の2列に混ぜていた（雑誌の見開きの調子）。大小で強弱を付けると、どれがいちばんかを
 * こちらが決めることになり、読む人には並びが崩れて見えた（`docs/island-misses.md` #328）。
 *
 * 札の上の字は少なく: 番号・印（`marks`。値段か季節）・題。キャッチコピーと行き方・お金・コツは窓の中。
 * 広い画面でも1列のまま、幅を絞る（4:3 の札を本文の幅いっぱいに広げると、8枚で画面5枚ぶんになる）。
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
  return (
    <Sec id="todo" n={n} icon="checklist" title={`やりたいこと${items.length}選`}>
      <ol className="gb-todo">
        {items.map((t, i) => (
          <li key={t.id} data-tone={i % 4}>
            <a className={`gb-todo-card${t.pic ? "" : " is-nopic"}`} href={`#${sheetId("do", t.id)}`}>
              {/* 絵の無いあいだは、色の地に大きな絵（`icon`）。描いた絵が来たら消える */}
              {!t.pic && t.icon && (
                <span className="gb-todo-ic" aria-hidden="true">
                  <Icon name={t.icon} size={120} />
                </span>
              )}
              {t.pic && <Picture pic={t.pic} sizes="(min-width: 720px) 600px, 100vw" ratio={null} eager={i < 1} />}
              <span className="gb-todo-top">
                <b className="gb-todo-n" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </b>
                <Marks m={t.marks} />
              </span>
              <span className="gb-todo-b">
                <span className="gb-todo-t">{t.title}</span>
                {t.went && <span className="gb-went">行った</span>}
              </span>
            </a>
          </li>
        ))}
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
        <Marks m={t.marks} className="is-in" />
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
