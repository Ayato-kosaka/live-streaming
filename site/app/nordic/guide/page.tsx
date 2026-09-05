import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import { NORDIC_GUIDE as G } from "@/content/nordic";

export const metadata: Metadata = {
  title: "旅のしおり — 北欧ヒッチハイク",
  description:
    "お金、通信、服装、サウナの入り方、食べもの20品、おみやげ20品、困ったとき。北欧とバルト三国を旅する前に読むもの。",
};

/**
 * 旅のしおり。
 *
 * 行く人のためだけの実用ページにしない。行かない人が読んでも面白いように、
 * 「なぜそうなっているか」まで書いてある元の文章をそのまま活かす。
 * ただし全部そのまま並べると2万字を超えるので、コーナーも項目も畳んでおく。
 * 目次から開いて、読みたいところだけ読む。
 *
 * 見た目は**紙の型**（`docs/ac-reference.md` 7章）。
 * どうぶつの森のUIには「板の型」（島の上のHUD・ボタン）と
 * 「紙の型」（いきもの図鑑・カタログ・パスポート・しおり）の2つがあって、
 * しおりは後者。厚みのある板を積むのではなく、1枚の紙に刷ったように見せる。
 *   - 影を落とさない。区切りは細い罫線
 *   - 見出しには蛍光ペンの帯を敷く
 *   - 紙は無地にしない。わずかなムラを入れる
 *   - 押せないもの（札）は平ら。厚みを付けるのは押せるものだけ
 * 板の型と紙の型を1つの面で混ぜない。だから `Panel` は使っていない。
 */

const CHAPTERS = [
  { id: "basic", title: "まず知っておくこと", note: "ビザ、入国、物価" },
  { id: "money", title: "お金", note: "通貨4種類、カードと現金" },
  { id: "connect", title: "通信", note: "eSIM、フリーWi-Fi" },
  { id: "clothes", title: "服装", note: "季節ごとの重ね方と持ち物" },
  { id: "move", title: "国から国への移動", note: "時間とお金" },
  { id: "sauna", title: "サウナの入り方", note: "手順、やってはいけないこと" },
  { id: "food", title: "食べもの", note: "何で、どこで食べるか" },
  { id: "souvenir", title: "おみやげ", note: "値段とどこで買うか" },
  { id: "light", title: "白夜と極夜とオーロラ", note: "明るい時期と暗い時期" },
  { id: "phrases", title: "現地のことば", note: "挨拶と、通じる一言" },
  { id: "trouble", title: "困ったとき", note: "緊急番号、盗難、病気" },
];

/** 見出しと本文が並ぶだけの節。ひとつずつ畳んでおく。 */
function Notes({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="folds">
      {items.map((n) => (
        <Fold key={n.title} title={n.title} lead={n.body}>
          <p>{n.body}</p>
        </Fold>
      ))}
    </div>
  );
}

/** しおりのコーナー1つ。中身は開くまで出さない。 */
function Chapter({
  id,
  n,
  title,
  note,
  children,
}: {
  id: string;
  /** 何番目のコーナーか。紙の図鑑らしく、通し番号を振る。 */
  n: number;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="gchap" id={id}>
      <Fold
        title={
          <span className="gchap-h">
            <span className="gchap-n">{String(n).padStart(2, "0")}</span>
            {title}
          </span>
        }
        lead={note}
      >
        {children}
      </Fold>
    </section>
  );
}

export default function NordicGuidePage() {
  return (
    <PageShell
      current="next"
      crumbs={[
        { label: "これから", href: "/next" },
        { label: "北欧ヒッチハイク", href: "/nordic" },
        { label: "旅のしおり" },
      ]}
    >
      <PageHead
        mark={<Icon name="book" size={44} />}
        title="旅のしおり"
        lead="お金、通信、服、サウナ、食べもの、おみやげ、困ったとき。北欧とバルト三国のぶんを全部調べました。目次から、読みたいところだけ開いてください。"
      />

      <div className="gbook">
        {/* 目次。紙の図鑑と同じで、まず全体で何章あるかが見えるようにする。 */}
        <nav className="gtoc" aria-label="もくじ">
          {CHAPTERS.map((c, i) => (
            <a key={c.id} href={`#${c.id}`}>
              <span className="gtoc-n">{String(i + 1).padStart(2, "0")}</span>
              <b>{c.title}</b>
              <i>{c.note}</i>
            </a>
          ))}
        </nav>

        <p className="gnote">
          もとは北欧7カ国ぶんに調べたもの。今回のルートから外れるノルウェーとデンマークの項目は
          落としてあります。地域全体を比べている文章の中には、まだ7カ国ぶんの数字が出てきます。
        </p>

        <Chapter id="basic" n={1} title="まず知っておくこと" note={`ビザ、入国、物価。${G.basic.length}項目`}>
          <Notes items={G.basic} />
        </Chapter>

        <Chapter id="money" n={2} title="お金" note={`通貨4種類、カードと現金。${G.money.length}項目`}>
          <Notes items={G.money} />
        </Chapter>

        <Chapter id="connect" n={3} title="通信" note={`eSIM、フリーWi-Fi。${G.connect.length}項目`}>
          <Notes items={G.connect} />
        </Chapter>

        <Chapter id="clothes" n={4} title="服装" note="季節ごとの重ね方と、持ち物リスト">
          <Notes items={G.clothes.seasons} />
          <h3 className="gsub">持ち物リスト</h3>
          <ul className="glist">
            {G.clothes.checklist.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Chapter>

        <Chapter id="move" n={5} title="国から国への移動" note={`${G.move.length}区間。時間とお金`}>
          <div className="gtable">
            {G.move.map((m) => (
              <div key={m.from} className="grow">
                <b>{m.from}</b>
                <span>{m.how}</span>
                <i>{m.time}</i>
                <em>{m.cost}</em>
              </div>
            ))}
          </div>
        </Chapter>

        <Chapter id="sauna" n={6} title="サウナの入り方" note="手順、やってはいけないこと、ことば">
          <Notes items={G.sauna.steps} />
          <h3 className="gsub">やってはいけないこと</h3>
          <ul className="glist is-dont">
            {G.sauna.donts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <h3 className="gsub">サウナのことば</h3>
          <div className="gcards">
            {G.sauna.words.map((w) => (
              <div key={w.word} className="gcard">
                <b>{w.word}</b>
                <p>{w.mean}</p>
              </div>
            ))}
          </div>
        </Chapter>

        <Chapter id="food" n={7} title="食べもの" note={`${G.food.length}品。何で、どこで食べるか`}>
          <div className="gcards">
            {G.food.map((f) => (
              <div key={f.local} className="gcard">
                <b>{f.jp}</b>
                <i>{f.local}</i>
                <p>{f.what}</p>
                <span>{f.where}</span>
              </div>
            ))}
          </div>
        </Chapter>

        <Chapter id="souvenir" n={8} title="おみやげ" note={`${G.souvenir.length}品。値段とどこで買うか`}>
          <div className="gcards">
            {G.souvenir.map((f) => (
              <div key={f.name} className="gcard">
                <b>{f.name}</b>
                <i>
                  {f.country} / {f.price}
                </i>
                <p>{f.tip}</p>
                <span>{f.where}</span>
              </div>
            ))}
          </div>
        </Chapter>

        <Chapter id="light" n={9} title="白夜と極夜とオーロラ" note="場所ごとの、明るい時期と暗い時期">
          <div className="gtable">
            {G.light.map((l) => (
              <div key={l.place} className="grow">
                <b>{l.place}</b>
                <span>白夜 {l.white}</span>
                <i>極夜 {l.polar}</i>
                <em>オーロラ {l.aurora}</em>
              </div>
            ))}
          </div>
        </Chapter>

        <Chapter id="phrases" n={10} title="現地のことば" note={`${G.phrases.length}言語。挨拶と、通じる一言`}>
          {G.phrases.map((p) => (
            <div key={p.lang} className="gphrase">
              <h3 className="gsub">
                {p.lang}
                <i>{p.country}</i>
              </h3>
              <p className="gpnote">{p.note}</p>
              <div className="gwords">
                {p.items.map((w) => (
                  <div key={w.jp + w.local}>
                    <b>{w.local}</b>
                    <i>{w.yomi}</i>
                    <span>{w.jp}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Chapter>

        <Chapter id="trouble" n={11} title="困ったとき" note={`緊急番号、盗難、病気。${G.trouble.length}項目`}>
          <Notes items={G.trouble} />
        </Chapter>
      </div>
    </PageShell>
  );
}
