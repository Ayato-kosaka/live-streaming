"use client";

import { useEffect, useState } from "react";
import { getState } from "@/lib/api";
import { setHereSeq } from "./here";
import { Mark } from "./Marks";

/**
 * 旅の司令塔。
 *
 * この企画の芯は「ヒッチハイクで北欧を回る」ではなく、
 * **会いたい人がいるので、スウェーデンまで陸路で会いに行く**こと。
 * 行為ではなく目的なので、「着いたかどうか」という終わりがあるし、
 * 1,541km がそのまま「会えるまでの遠さ」になる。
 *
 * その人が誰なのかは書かない。名前も写真も出さない。
 * 「会いたい人がいる」だけで、この企画は成立する。
 *
 * だから人が知りたいのは、順に4つ。
 *   1. あとどれだけで、そこに着くのか
 *   2. いま、どこにいるのか
 *   3. 次は、どこへ行くのか
 * これを1画面に収める。地図より先、文章より先に、いちばん上に置く。
 * **「そこで何が起きるか」はここに置かない。** その日の話は旅程表が持っている
 * （`Days.tsx`）ので、ここに書くと必ず同じ文を二度読むことになる。
 *
 * **大きい数字はひとつだけ置く。** 出る前は「あと何日」、出たあとは「あと何km」。
 * 2つ並べていたころ、出発前の画面には減らない 1,541km のバーが
 * 空のまま出ていて、すぐ上の一行と同じ数字を2回言っていた。
 * そのときに意味のある数字だけを、いちばん大きく出す。
 *
 * 静的書き出しなので、日付も現在地もビルド時の値を焼くわけにいかない。
 * 残り時間は画面が出てから毎秒数え直し、いる場所は `/island-api/state` の
 * `current.place` を読んで、ルートの街の名前と突き合わせる。
 *
 * 分かった現在地は、同じ画面にある地図にも渡す。React で描き直すと
 * 地図の SVG まるごとが作り直しになるので、class を付け外しするだけにしてある
 * （`docs/island-design.md` 3章「動きは React の外で」）。
 *
 * 中身はぜんぶ props で受け取る。ここで `content/nordic` を読むと、
 * 見どころ161件ぶんの JSON が丸ごとブラウザに落ちてくる。
 */

export type Stop = {
  /** 街の名前 */
  name: string;
  /** 地図の街の id。出発地（クタイシ）だけ持たない。 */
  id?: string;
  /** その街のある国 */
  country?: string;
  /** ここへ来るときの移動 */
  how?: string;
  /** その区間の絵（`Marks.tsx` の名前） */
  art?: string;
  /** ここへ来るまでにヒッチハイクで進む距離(km)。残りを数えるのに使う。 */
  hitch?: number;
};

function fmt(n: number) {
  return String(n).padStart(2, "0");
}

export default function TripNow({
  stops,
  mainLegs,
  legOrder,
  dayOf,
  depart,
  departWhen,
  hitchKm,
}: {
  stops: Stop[];
  /**
   * 一本道の区間の id を、通る順に。`stops[i]` へ来る区間が `mainLegs[i - 1]`。
   * いる場所が分かったら、下の区間ボードで**いまの区間と次の区間だけ**を開く。
   */
  mainLegs: string[];
  /**
   * 寄り道も入れた、`ROUTE` ぜんぶの区間の id を通る順に。
   * いま走っているのが何本目かを、下の面（`here.ts`）に配るのに使う。
   * まだ決めていないことの問いは、越えた日のぶんが閉じる。
   */
  legOrder: string[];
  /** 区間の id → 何日目。旅程表のその日へ飛ぶのと、今日の札に使う。 */
  dayOf: Record<string, number>;
  /** 出発の日時（ISO） */
  depart: string;
  /** 画面に出す出発の日時 */
  departWhen: string;
  hitchKm: number;
}) {
  const [left, setLeft] = useState<number | null>(null);
  /** いる場所。ルートの何番目か。分からないうちは null。 */
  const [at, setAt] = useState<number | null>(null);
  /** 島が持っている「いまいる場所」の文字。ルートの外にいるときはこれを出す。 */
  const [place, setPlace] = useState<string | null>(null);

  useEffect(() => {
    const t = new Date(depart).getTime();
    const tick = () => setLeft(t - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [depart]);

  useEffect(() => {
    let alive = true;
    getState()
      .then((s) => {
        if (!alive) return;
        const p = (s.current?.place ?? "").trim();
        setPlace(p || null);
        // 「リガ」でも「ラトビア・リガ」でも当たるように、含んでいるかで見る。
        const i = stops.findIndex((st) => st.id && p.includes(st.name));
        if (i >= 0) setAt(i);
      })
      .catch(() => {
        /* 島の様子が取れなくても、カウントダウンだけは出す */
      });
    return () => {
      alive = false;
    };
  }, [stops]);

  // 分かった現在地を、同じ画面の地図にも反映する。
  useEffect(() => {
    if (at == null) return;
    const id = stops[at]?.id;
    const svg = document.querySelector<SVGSVGElement>(".nmap");
    if (!svg || !id) return;
    svg.dataset.here = id;
    const seq = Number(svg.querySelector(`[data-id="${id}"]`)?.getAttribute("data-seq") ?? -1);
    svg.querySelectorAll<SVGElement>("[data-seq]").forEach((el) => {
      el.classList.toggle("is-done", Number(el.getAttribute("data-seq")) <= seq);
    });
    // 「いま ここ」の札はどの街にもぶら下げてある。出すのは1つだけ。
    svg.querySelectorAll<SVGElement>(".nmap-pin").forEach((el) => {
      el.classList.toggle("is-now", el.getAttribute("data-id") === id);
    });
  }, [at, stops]);

  // 旅程表の「いま、ここ」を、今日の1日にだけ出す。
  //
  // 静的書き出しなので、書き出した時点では誰も走っていない。
  // 場所が分かってから、その日の行に印を付ける（`docs/island-design.md` 3章
  // 「動きは React の外で」。ここで状態を持つと旅程表がまるごと作り直しになる）。
  useEffect(() => {
    if (at == null || at < 1) return;
    const n = dayOf[mainLegs[at]];
    document.querySelectorAll<HTMLElement>(".nday").forEach((el) => {
      el.toggleAttribute("data-now", el.id === `day-${n}`);
    });
  }, [at, mainLegs, dayOf]);

  // いま走っているのが何本目かを、下の面にも配る。
  // 越えた日の「まだ決めていないこと」は、そこで閉じる（`here.ts`）。
  useEffect(() => {
    if (at == null || at < 1) return;
    const i = legOrder.indexOf(mainLegs[at]);
    setHereSeq(i >= 0 ? i : null);
  }, [at, mainLegs, legOrder]);

  const last = stops.length - 1;
  const departed = left != null && left <= 0;
  const idx = at ?? (departed ? null : 0);
  const arrived = idx === last;

  // 残りの距離。まだ通っていない区間の、親指で進むぶんを足す。
  const leftKm = stops.slice((idx ?? 0) + 1).reduce((a, b) => a + (b.hitch ?? 0), 0);

  const now = idx != null ? stops[idx] : null;
  /** いま走っている日。出発前と、着いたあとは無い。 */
  const nowDay = idx != null && idx >= 1 && idx < last ? dayOf[mainLegs[idx]] : null;
  const next = idx != null && idx < last ? stops[idx + 1] : null;
  const d = left != null && left > 0 ? Math.floor(left / 1000) : 0;

  return (
    // 器は紙の正本（`.panel.paper`）をそのまま借りる。
    // ここが板だったころ、生成りの地の上に厚み8pxの箱が925px積まれていた
    // （`docs/island-review-2.md` 3章）。紙の作りをこちらに写経すると、
    // 正本を直したときにこの面だけ取り残されるので、class を足すだけにする。
    <section className="panel paper tnow">
      {/* h1 は場所の名前。文にしない（`docs/island-world.md` 7.5）。
          「会いたい人がいます」は良い一行なので消さず、すぐ下の lead に下ろす。
          前置きは h1 と1行まで。21面ぜんぶが同じ長さの前置きで始まると、
          並べたときに全部同じページに見える（同 7.6）。 */}
      <div className="tnow-top">
        <h1>北欧ヒッチハイク</h1>
        <p className="tnow-lead">
          <b>スウェーデンに、会いたい人がいます。</b>
          ジョージアからそこまで、人の車だけで {hitchKm.toLocaleString()}km。
        </p>
      </div>

      {/* 大きい数字はひとつ。出る前は日数、出たあとは残りの距離。
          ゴールは「会えたかどうか」ではなく「ストックホルムに着くこと」にする。
          相手の都合で会えないことは普通にあるし、そのとき相手が
          約束を破った人に見えるのがいちばんまずい（docs/nordic-fund.md 1章）。 */}
      <div className="tnow-counts">
        {!departed ? (
          <div className="tnow-count">
            <span className="tnow-count-l">クタイシ発まで</span>
            {left == null ? (
              <span className="tnow-count-n is-wait">数えています</span>
            ) : (
              <span className="tnow-count-n">
                <em>
                  <b>{Math.floor(d / 86400)}</b>日
                </em>
                <em>
                  <b>{fmt(Math.floor((d % 86400) / 3600))}</b>時間
                </em>
                <em>
                  <b>{fmt(Math.floor((d % 3600) / 60))}</b>分
                </em>
                <em>
                  <b>{fmt(d % 60)}</b>秒
                </em>
              </span>
            )}
            <span className="tnow-count-w">{departWhen}</span>
          </div>
        ) : (
          <div className="tnow-count is-far">
            <span className="tnow-count-l">{arrived ? "着いた" : "ストックホルムまで"}</span>
            <span className="tnow-count-n">
              {arrived ? (
                <b>{stops[last].name}</b>
              ) : (
                <em>
                  <b>{leftKm.toLocaleString()}</b>km
                </em>
              )}
            </span>
            <span className="tnow-count-w">
              {arrived
                ? "飛行機のあとは、ぜんぶ人の車と船で来た"
                : `会いたい人がいる街まで、親指で進むぶん。ぜんぶで ${hitchKm.toLocaleString()}km`}
            </span>
            {!arrived && (
              <span className="tnow-bar" aria-hidden>
                <span style={{ width: `${Math.round(((hitchKm - leftKm) / hitchKm) * 100)}%` }} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* いま どこにいて、つぎ どこへ向かうのか */}
      <div className="tnow-pair">
        <div className="tnow-at">
          <i>いま</i>
          <b>{now ? now.name : (place ?? "移動中")}</b>
          <em>{now?.country ?? ""}</em>
        </div>
        <span className="tnow-go" aria-hidden>
          <svg viewBox="0 0 40 24" width="32" height="19">
            <path
              d="M3 12h26M23 5l8 7-8 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="tnow-to">
          <i>{next ? "つぎ" : "ここまで"}</i>
          <b>{next ? next.name : stops[last].name}</b>
          <em>{next ? next.how : "会いたい人がいる街。友だちの家に約1週間"}</em>
        </div>
        {next?.art && <Mark art={next.art} size={54} className="tnow-art" />}
      </div>
      {/* ここに「つぎの区間で何が起きるか」（`next.note`）を出していた。
          同じ文が、下の区間ボードの開いているカードにもそのまま出る。
          開いているカードはいつも「いま走っている区間」なので、**必ず二度読みになる。**
          区間の話は区間カードが持つ。ここは「どこへ向かっているか」まで。 */}

      {/* 行き先。**一本道の帯（`.tnow-rail`）はここに置かない。**
          10の街を横に並べる帯は、すぐ下の地図と、その下の区間ボードと、
          まったく同じ「クタイシからストックホルムまでの10区間」を3回目に描いていた。
          どこまで来たかは地図の線がいちばんよく言える。 */}
      <div className="tnow-acts">
        {/* 出る前は旅程表の頭へ。出たあとは**今日の行へ**。
            旅の途中に来た人がまず見たいのは「今日どこにいるか」で、
            それは表の9行目かもしれない。頭に落とすと、そこから自分で探すことになる。 */}
        <a className="tnow-act is-main" href={nowDay ? `#day-${nowDay}` : "#plan"}>
          {nowDay ? "今日のところへ" : "旅のよていを見る"}
        </a>
        <a className="tnow-act" href="#map">
          通る道を見る
        </a>
        <a className="tnow-act" href="#back">
          応援する
        </a>
        {/* しおりへの入口は、下の紙のタイルが持っている。ここに4つ目を置くと
            行が2段に折れて 46px 増えるので、上は3つまでにする。 */}
      </div>
    </section>
  );
}
