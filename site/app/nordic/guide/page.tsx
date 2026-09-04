import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import { NORDIC_GUIDE as G } from "@/content/nordic";

export const metadata: Metadata = {
  title: "旅のしおり — 北欧ヒッチハイク",
  description:
    "お金、通信、服装、サウナの入り方、食べもの20品、おみやげ20品、困ったとき。北欧とバルト三国を旅する前に読むもの。",
};

/** 見出しと本文が並ぶだけの節。しおりの大半はこの形。 */
function Notes({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="gnotes">
      {items.map((n) => (
        <div key={n.title} className="gnote">
          <b>{n.title}</b>
          <p>{n.body}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * 旅のしおり。
 *
 * 行く人のためだけの実用ページにしない。行かない人が読んでも面白いように、
 * 「なぜそうなっているか」まで書いてある元の文章をそのまま活かす。
 * 節の順番は、旅の準備で困る順。
 */
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
        emoji="📖"
        title="旅のしおり"
        lead="お金、通信、服、サウナ、食べもの、おみやげ、困ったとき。北欧とバルト三国のぶんを全部調べました。"
        say="行かない人が読んでも面白いように書いてあるよ。サウナのところは特に。"
      />

      <p className="muted" style={{ marginBottom: 14 }}>
        もとは北欧7カ国ぶんに調べたもの。今回のルートから外れるノルウェーとデンマークの項目は落としてあります。
        地域全体を比べている文章の中には、まだ7カ国ぶんの数字が出てきます。
      </p>

      <nav className="gjump">
        {[
          ["basic", "まず知っておくこと"],
          ["money", "お金"],
          ["connect", "通信"],
          ["clothes", "服装"],
          ["move", "国から国への移動"],
          ["sauna", "サウナの入り方"],
          ["food", "食べもの"],
          ["souvenir", "おみやげ"],
          ["light", "白夜と極夜とオーロラ"],
          ["phrases", "現地のことば"],
          ["trouble", "困ったとき"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <Panel>
        <h2 id="basic">まず知っておくこと</h2>
        <Notes items={G.basic} />
      </Panel>

      <Panel>
        <h2 id="money">お金</h2>
        <Notes items={G.money} />
      </Panel>

      <Panel>
        <h2 id="connect">通信</h2>
        <Notes items={G.connect} />
      </Panel>

      <Panel>
        <h2 id="clothes">服装</h2>
        <Notes items={G.clothes.seasons} />
        <h3 className="sub">持ち物リスト</h3>
        <ul className="glist">
          {G.clothes.checklist.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 id="move">国から国への移動</h2>
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
      </Panel>

      <Panel>
        <h2 id="sauna">サウナの入り方</h2>
        <Notes items={G.sauna.steps} />
        <h3 className="sub">やってはいけないこと</h3>
        <ul className="glist is-dont">
          {G.sauna.donts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <h3 className="sub">サウナのことば</h3>
        <div className="gcards">
          {G.sauna.words.map((w) => (
            <div key={w.word} className="gcard">
              <b>{w.word}</b>
              <p>{w.mean}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 id="food">食べもの {G.food.length}品</h2>
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
      </Panel>

      <Panel>
        <h2 id="souvenir">おみやげ {G.souvenir.length}品</h2>
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
      </Panel>

      <Panel>
        <h2 id="light">白夜と極夜とオーロラ</h2>
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
      </Panel>

      <Panel>
        <h2 id="phrases">現地のことば</h2>
        {G.phrases.map((p) => (
          <div key={p.lang} className="gphrase">
            <h3>
              {p.lang}
              <i>{p.country}</i>
            </h3>
            <p className="muted">{p.note}</p>
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
      </Panel>

      <Panel>
        <h2 id="trouble">困ったとき</h2>
        <Notes items={G.trouble} />
      </Panel>
    </PageShell>
  );
}
