import Icon from "@/components/ui/Icon";
import type { Guidebook, Item, Todo as TodoT } from "@/content/guidebook/types";

import { MiniTiles } from "./About";
import Sheet from "./Sheet";
import { WentVideo } from "./Videos";
import { Credit, Picture, Sec, SrcLine, jpDate, sheetId } from "./parts";

/**
 * 4 やりたいことN選。**いちばんの柱。** 大きな絵の札をN枚（パリの「8 THINGS TO DO」の形）。
 * 押すと**見開き**が開く: どこ・何をする・行き方・時間・お金・コツ・回りかた。
 *
 * Nは街の大きさで決める（最大8。#1228）。見たいもの（場所の一覧）とは役割を分け、
 * 出てくる場所は窓の「どこ」から見たいものの窓へ繋ぐ。
 */
export default function Todo({ g, n }: { g: Guidebook; n: number }) {
  const items = g.todo;
  const byId = new Map(g.see.items.map((s) => [s.id, s]));
  return (
    <Sec id="todo" n={n} icon="sparkle" title={`やりたいこと${items.length}選`}>
      <ol className="gb-todo">
        {items.map((t, i) => (
          <li key={t.id}>
            <a className="gb-todo-card" href={`#${sheetId("do", t.id)}`}>
              <Picture pic={t.pic} sizes="(min-width: 720px) 300px, 46vw" ratio="4 / 5" eager={i < 2} label={String(i + 1)} />
              <b className="gb-todo-n" aria-hidden="true">
                {i + 1}
              </b>
              <span className="gb-todo-b">
                <span className="gb-todo-t">{t.title}</span>
                {t.went && <span className="gb-went">行った</span>}
              </span>
            </a>
          </li>
        ))}
      </ol>
      {items.map((t, i) => (
        <TodoSheet key={t.id} t={t} i={i} all={items} where={t.see.map((id) => byId.get(id)).filter((x): x is Item => !!x)} />
      ))}
    </Sec>
  );
}

/** 見開きの7つ（「どこ」は札の並びで上に出す）。見出しに絵は付けない（`parts.tsx` の `Facts` と同じ理由） */
const ROWS: { key: keyof Pick<TodoT, "what" | "how" | "time" | "money" | "tip" | "route">; label: string }[] = [
  { key: "what", label: "何をする" },
  { key: "how", label: "行き方" },
  { key: "time", label: "時間" },
  { key: "money", label: "お金" },
  { key: "tip", label: "コツ" },
  { key: "route", label: "回りかた" },
];

function TodoSheet({ t, i, all, where }: { t: TodoT; i: number; all: TodoT[]; where: Item[] }) {
  const prev = all[i - 1];
  const next = all[i + 1];
  return (
    <Sheet
      id={sheetId("do", t.id)}
      kicker={`やりたいこと ${i + 1} / ${all.length}`}
      title={t.title}
      wide
      hero={
        <>
          <Picture pic={t.pic} sizes="(min-width: 720px) 440px, 100vw" ratio="16 / 10" label={String(i + 1)} />
          <Credit pic={t.pic} of={t.title} />
        </>
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
      <p className="gb-lead">{t.lead}</p>
      {t.went && (
        <div className="gb-went-box">
          <span className="gb-went">行った</span>
          <time dateTime={t.went.date}>{jpDate(t.went.date)}</time>
          {t.went.story && <p>{t.went.story}</p>}
          {t.went.say && <p className="gb-say">「{t.went.say}」</p>}
          <WentVideo w={t.went} of={t.title} />
        </div>
      )}
      <h4 className="gb-h4">どこ</h4>
      <MiniTiles items={where} />
      <dl className="gb-facts is-todo">
        {ROWS.map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>{t[r.key]}</dd>
          </div>
        ))}
      </dl>
      <SrcLine src={t.src} of={t.title} />
    </Sheet>
  );
}
