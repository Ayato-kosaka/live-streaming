import type { Metadata } from "next";

import { crumbOf } from "@/components/island/layout";
import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import NmMapSvg from "@/components/macedonia/NmMapSvg";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import {
  NM_BEYOND,
  NM_EAT,
  NM_FACTS,
  NM_FUN,
  NM_KNOW,
  NM_LEAD,
  NM_PRACTICAL,
  NM_SKOPJE,
  NM_WORDS,
  type NmNote,
  type NmSpot,
} from "@/content/northMacedonia";

import "./nm.css";

/**
 * 北マケドニアの案内。
 *
 * ## 何を載せる面か
 *
 * あやと（2026-10-08）:「北マケドニアの、どんな国かとか、そういうのを
 * いろいろまとめて。首都に行くので。どんな国か、何をするべきか、
 * こういうのが楽しそうとか、こういうのを食べたらおいしそうとか。」
 *
 * だから章立てはその4つ＋首都。**首都を厚くする**——腰を据えるのはそこなので。
 *
 * ## 作り
 *
 * 文章は1行もここに書かない。`content/northMacedonia.ts` を読むだけ
 * （`/nordic/guide` と同じ）。見た目も**しおりと同じ「紙の型」**を借りる
 * （`app/css/nordic.css` の `.gbook` `.gtoc` `.gcard` …）。
 * 同じ用事の面が2通りの見た目を持つと、島の中で部屋が増えたように見える。
 *
 * **ぜんぶ畳んでおく。** 開いているのは「どんな国か」1つだけ
 * （`docs/island-design.md` 4章「開いた状態を初期値にしていいのは1つ」）。
 * 閉じたままの背は 390px 幅で2.5画面に収まる。
 *
 * ## 日付を焼かない
 *
 * 静的書き出しなので、ここに書いた字は次のビルドまで直らない。
 * 「あと◯日」も「◯月◯日に行く」も置かない——移動の日は企画のほう
 * （`content/plans.ts` の `north-macedonia`）が持っていて、
 * あちらは画面が出てから数え直す。
 */

export const metadata: Metadata = {
  title: "北マケドニア — 山と湖の国",
  /* 数は手で書かない。載っている件数から作る（`/nordic/guide` と同じ） */
  description: `海に出ない、山と湖の国。首都スコピエの見どころ${NM_SKOPJE.length}つ、街の外${NM_BEYOND.length}つ、食べもの${NM_EAT.length}品、ことば${NM_WORDS.length}。`,
};

/** 節の表。**絵はここ1か所で決める**——節の中で絵を別に書くと、ここと食い違う */
const CHAPTERS: { id: string; icon: IconName; title: string; note: string }[] = [
  { id: "know", icon: "info", title: "どんな国か", note: `${NM_KNOW.length}つ` },
  { id: "skopje", icon: "oldtown", title: "首都スコピエ", note: `${NM_SKOPJE.length}か所` },
  { id: "beyond", icon: "mountain", title: "街の外へ", note: `${NM_BEYOND.length}か所` },
  { id: "fun", icon: "sparkle", title: "こういうのが楽しそう", note: `${NM_FUN.length}つ` },
  { id: "eat", icon: "eat", title: "食べたらおいしそう", note: `${NM_EAT.length}品` },
  { id: "words", icon: "phrase", title: "ことば", note: `${NM_WORDS.length}語` },
  { id: "money", icon: "wallet", title: "お金と足", note: `${NM_PRACTICAL.length}つ` },
];

/** 本文の節に、目次と同じ絵を出すため */
const ICON_OF = Object.fromEntries(CHAPTERS.map((c) => [c.id, c.icon])) as Record<string, IconName>;

/** 節ひとつ。中身は開くまで出さない */
function Chapter({
  id,
  n,
  title,
  note,
  open,
  children,
}: {
  id: string;
  n: number;
  title: string;
  note: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="gchap" id={id}>
      <Fold
        open={open}
        title={
          <span className="gchap-h">
            <span className="gchap-n">{String(n).padStart(2, "0")}</span>
            <Icon name={ICON_OF[id]} size={22} />
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

/** 見出しと本文だけが並ぶ節。ひとつずつ畳む */
function Notes({ items }: { items: NmNote[] }) {
  return (
    <div className="folds">
      {items.map((x) => (
        <Fold key={x.title} title={x.title} lead={x.body}>
          <p>{x.body}</p>
        </Fold>
      ))}
    </div>
  );
}

/** 行き先の札。絵・名前・現地のつづり・中身・行き方 */
function Spots({ items }: { items: NmSpot[] }) {
  return (
    <div className="gcards">
      {items.map((s) => (
        <div key={s.id} className="gcard nmspot">
          <Icon name={s.icon} size={26} />
          <span className="nmspot-h">
            <b>{s.name}</b>
            {s.local && <i className="nmspot-local">{s.local}</i>}
          </span>
          <span className="nmspot-b">
            <p>{s.what}</p>
            {s.how && <p className="nmspot-how">{s.how}</p>}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function NorthMacedoniaPage() {
  return (
    <PageShell current="next" crumbs={[crumbOf("next"), { label: "北マケドニア" }]}>
      <PageHead
        mark={<Icon name="mountain" size={44} />}
        title="北マケドニア"
        lead={NM_LEAD}
        say="まず地図。そのあと、腰を据える街のところから開くといいよ。"
      />

      <NmMapSvg />

      <div className="nmfacts">
        {NM_FACTS.map((f) => (
          <div key={f.cap}>
            <b>{f.n}</b>
            {f.unit && <em>{f.unit}</em>}
            <span>{f.cap}</span>
          </div>
        ))}
      </div>

      <div className="gbook">
        {/* **目次を置かない。** 節が7つで、閉じた札がそのまますぐ下に7枚並ぶ。
            同じ一覧を2回出すと、押す場所が2か所になって「どちらが本物か」を
            読む人に考えさせる（`docs/island-standards.md` 6章）。
            しおり（`/nordic/guide`）に目次が在るのは、あちらが11章あって
            閉じた札だけでも1画面に収まらないから。 */}
        <Chapter id="know" n={1} title="どんな国か" note={`${NM_KNOW.length}つ`}>
          <Notes items={NM_KNOW} />
        </Chapter>

        <Chapter id="skopje" n={2} title="首都スコピエ" note={`${NM_SKOPJE.length}か所。歩いて回れる`}>
          <Spots items={NM_SKOPJE} />
        </Chapter>

        <Chapter id="beyond" n={3} title="街の外へ" note={`${NM_BEYOND.length}か所。日帰りと、泊まりがけ`}>
          <Spots items={NM_BEYOND} />
        </Chapter>

        <Chapter id="fun" n={4} title="こういうのが楽しそう" note={`${NM_FUN.length}つ`}>
          <Notes items={NM_FUN} />
        </Chapter>

        <Chapter id="eat" n={5} title="食べたらおいしそう" note={`${NM_EAT.length}品。現地のつづりつき`}>
          <div className="gcards">
            {NM_EAT.map((d) => (
              <div key={d.roman} className="gcard">
                <b>{d.jp}</b>
                <i className="nmspot-local">
                  {d.local} / {d.roman}
                </i>
                <p>{d.what}</p>
                <span>{d.where}</span>
              </div>
            ))}
          </div>
        </Chapter>

        <Chapter id="words" n={6} title="ことば" note={`${NM_WORDS.length}語。キリル文字つき`}>
          {/* 読みはカタカナで近い音をあてたもの。そのことは中で言う */}
          <p className="gpnote">
            カタカナは近い音をあてたもので、そのままの発音ではない。通じなければ、左の文字を見せる。
          </p>
          <div className="gwords">
            {NM_WORDS.map((w) => (
              <div key={w.local}>
                <b className="nmspot-local">{w.local}</b>
                <i>{w.yomi}</i>
                <span>{w.jp}</span>
              </div>
            ))}
          </div>
        </Chapter>

        <Chapter id="money" n={7} title="お金と足" note={`${NM_PRACTICAL.length}つ`}>
          <Notes items={NM_PRACTICAL} />
        </Chapter>
      </div>
    </PageShell>
  );
}
