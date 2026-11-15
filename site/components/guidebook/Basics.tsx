import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import type { Guide, Guidebook } from "@/content/guidebook/types";

import Sheet from "./Sheet";
import { MapsLink, Sec, SrcLine, jpDate, sheetId } from "./parts";

/**
 * 8 基本情報。**上から、要約の4枚 → 旅の実用ガイド（押すと窓）→ 1日の予算・持ち物・気候 → 困ったとき。**
 * 前の面は17件を1つの畳みに入れていた。読む人が探すのは「いくら」「どう動く」「危なくないか」なので、
 * その答えを先に4枚で見せて、詳しくは窓に入れる。
 */
export default function Basics({ g, n }: { g: Guidebook; n: number }) {
  const b = g.basics;
  const total = b.budget.rows.reduce((a, r) => [a[0] + r.eur[0], a[1] + r.eur[1]], [0, 0]);
  const yen = (v: number) => (Math.round((v * g.rate.yen) / 100) * 100).toLocaleString("ja-JP");
  const eur = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(2));
  const range = (r: [number, number]) => (r[0] === r[1] ? eur(r[0]) : `${eur(r[0])}〜${eur(r[1])}`);
  const yenRange = (r: [number, number]) => (r[0] === r[1] ? yen(r[0]) : `${yen(r[0])}〜${yen(r[1])}`);
  const hiMax = Math.max(...b.climate.months.map((m) => m.hi));
  const loMin = Math.min(...b.climate.months.map((m) => m.lo));
  const span = hiMax - loMin;
  return (
    <Sec id="basics" n={n} icon="info" title="行く前に知っておくこと">
      <ul className="gb-sum">
        {b.summary.map((s) => (
          <li key={s.id}>
            <a href={s.to}>
              <Icon name={s.icon} size={28} />
              <span className="gb-sum-l">{s.label}</span>
              <b>{s.value}</b>
              <i>{s.lead}</i>
            </a>
          </li>
        ))}
      </ul>

      <h3 className="gb-sub">旅の実用ガイド</h3>
      <ul className="gb-guides">
        {b.guides.map((x) => (
          /* `#words` は前の面（`/bulgaria#words`）の錨。札に持たせて、移った先でも同じ所に着く */
          <li key={x.id} id={x.id === "words" ? "words" : undefined}>
            <a href={`#${sheetId("guide", x.id)}`}>
              <Icon name={x.icon} size={28} />
              <b>{x.title}</b>
              <i>{x.lead}</i>
            </a>
          </li>
        ))}
      </ul>

      <div className="gb-budget" id="budget">
        <h3 className="gb-sub">
          <Icon name="wallet" size={20} />
          1日の予算
        </h3>
        <table className="gb-table">
          <caption>
            宿代は別。円は1{g.rate.unit}＝{g.rate.yen}円（{jpDate(g.rate.date)}）で計算
          </caption>
          <thead>
            <tr>
              <th scope="col">何に</th>
              <th scope="col">{g.rate.unit}</th>
              <th scope="col">円</th>
            </tr>
          </thead>
          <tbody>
            {b.budget.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">
                  <b>{r.label}</b>
                  <span>{r.what}</span>
                </th>
                <td>{range(r.eur)}</td>
                <td>約{yenRange(r.eur)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">1日</th>
              <td>約{range([Math.round(total[0]), Math.round(total[1])])}</td>
              <td>約{yenRange(total as [number, number])}</td>
            </tr>
          </tfoot>
        </table>
        <Fold title="安く済ませるコツ" note={`${b.budget.tips.length}つ`}>
          <ul className="gb-tips">
            {b.budget.tips.map((t, i) => (
              <li key={i}>
                <p>{t.text}</p>
                <SrcLine src={t.src} of={`安く済ませるコツ${i + 1}`} />
              </li>
            ))}
          </ul>
          <SrcLine src={dedupe(b.budget.rows.flatMap((r) => r.src))} of="1日の予算" />
        </Fold>
      </div>

      <h3 className="gb-sub">
        <Icon name="suitcase" size={20} />
        持ち物
      </h3>
      <ul className="gb-pack">
        {b.pack.map((p) => (
          <li key={p.label}>
            <Icon name={p.icon} size={30} />
            <b>{p.label}</b>
            <i>{p.why}</i>
          </li>
        ))}
      </ul>

      <h3 className="gb-sub">
        <Icon name="thermometer" size={20} />
        気候
      </h3>
      <figure className="gb-climate">
        <ol aria-label={`月ごとの${b.climate.note}`}>
          {b.climate.months.map((m, i) => (
            <li key={i}>
              <span className="gb-climate-hi">{Math.round(m.hi)}</span>
              <span className="gb-climate-bar" aria-hidden="true">
                <span style={{ top: `${((hiMax - m.hi) / span) * 100}%`, bottom: `${((m.lo - loMin) / span) * 100}%` }} />
              </span>
              <span className="gb-climate-lo">{Math.round(m.lo)}</span>
              <b>{i + 1}月</b>
              <span className="sr-only">
                平均最高{m.hi}℃・平均最低{m.lo}℃・降水{m.mm}mm
              </span>
            </li>
          ))}
        </ol>
        <figcaption>
          {b.climate.note}。単位は℃
          <SrcLine src={b.climate.src} of="気候" />
        </figcaption>
      </figure>

      <h3 className="gb-sub">
        <Icon name="firstaid" size={20} />
        困ったとき
      </h3>
      <div className="gb-help">
        {b.help.calls.map((c) => (
          <a key={c.num} className="gb-call" href={`tel:${c.num}`} aria-label={`${c.num}に電話する（${c.label}）`}>
            <Icon name="phone" size={26} />
            <b>{c.num}</b>
            <span>
              {c.label}
              <i>{c.note}</i>
            </span>
          </a>
        ))}
        <div className="gb-embassy">
          <b>{b.help.embassy.name}</b>
          <span>{b.help.embassy.address}</span>
          <span>{b.help.embassy.hours}</span>
          <a className="gb-call is-small" href={`tel:${b.help.embassy.tel.replace(/\s/g, "")}`} aria-label={`${b.help.embassy.name}に電話する`}>
            <Icon name="phone" size={20} />
            {b.help.embassy.tel}
          </a>
          <MapsLink href={b.help.embassy.maps} of={b.help.embassy.name} />
          <SrcLine src={[...b.help.embassy.src, ...b.help.calls.flatMap((c) => c.src)]} of="困ったとき" />
        </div>
      </div>

      {[...b.guides, b.season].map((x) => (
        <GuideSheet key={x.id} x={x} />
      ))}
    </Sec>
  );
}

function GuideSheet({ x }: { x: Guide }) {
  return (
    <Sheet id={sheetId("guide", x.id)} kicker="旅の実用ガイド" title={x.title}>
      <p className="gb-lead">{x.lead}</p>
      {x.parts.map((p, i) => (
        <div key={i} className="gb-part">
          {p.h && <h4 className="gb-h4">{p.h}</h4>}
          <p>{p.text}</p>
        </div>
      ))}
      {x.words && (
        <ul className="gb-words">
          {x.words.map((w) => (
            <li key={w.local.text}>
              <b lang={w.local.lang}>{w.local.text}</b>
              <i>{[w.local.roman, w.local.kana].filter(Boolean).join("／")}</i>
              <span>{w.jp}</span>
            </li>
          ))}
        </ul>
      )}
      <SrcLine src={x.src} of={x.title} />
    </Sheet>
  );
}

function dedupe<T extends { url: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => !seen.has(x.url) && !!seen.add(x.url));
}
