"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getState } from "@/lib/api";
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
 * だから人が知りたいのは、順に5つ。
 *   1. あと何日で始まるのか
 *   2. 会えるまで、あとどれだけ残っているのか
 *   3. いま、どこにいるのか
 *   4. 次は、どこへ行くのか
 *   5. そこで何が起きるのか
 * これを1画面に収める。地図より先、文章より先に、いちばん上に置く。
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
  /** その区間で何が起きるか */
  note?: string;
  /** ここへ来るまでにヒッチハイクで進む距離(km)。残りを数えるのに使う。 */
  hitch?: number;
};

function fmt(n: number) {
  return String(n).padStart(2, "0");
}

export default function TripNow({
  stops,
  depart,
  departWhen,
  hitchKm,
}: {
  stops: Stop[];
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

  const last = stops.length - 1;
  const departed = left != null && left <= 0;
  const idx = at ?? (departed ? null : 0);
  const arrived = idx === last;

  // 残りの距離。まだ通っていない区間の、親指で進むぶんを足す。
  const leftKm = stops.slice((idx ?? 0) + 1).reduce((a, b) => a + (b.hitch ?? 0), 0);

  const now = idx != null ? stops[idx] : null;
  const next = idx != null && idx < last ? stops[idx + 1] : null;
  const d = left != null && left > 0 ? Math.floor(left / 1000) : 0;

  return (
    <div className="tnow">
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

      {/* 1. あと何日  2. あと何km */}
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
          <div className="tnow-count is-gone">
            <span className="tnow-count-l">{arrived ? "着いた" : "旅の途中"}</span>
            <span className="tnow-count-n is-wait">
              {arrived ? stops[last].name : (place ?? "移動中")}
            </span>
            <span className="tnow-count-w">
              {arrived
                ? "飛行機のあとは、ぜんぶ人の車と船で来た"
                : "いる場所は、島の「いまのポスト」と同じものを見ています"}
            </span>
          </div>
        )}

        {/* 残りの遠さ。進むほど減る。この企画でいちばん意味のある数字。
            ゴールは「会えたかどうか」ではなく「ストックホルムに着くこと」にする。
            相手の都合で会えないことは普通にあるし、そのとき相手が
            約束を破った人に見えるのがいちばんまずい（docs/nordic-fund.md 1章）。 */}
        <div className="tnow-count is-far">
          <span className="tnow-count-l">ストックホルムまで</span>
          <span className="tnow-count-n">
            <em>
              <b>{leftKm.toLocaleString()}</b>km
            </em>
          </span>
          <span className="tnow-count-w">
            {leftKm === 0
              ? "着いた"
              : `会いたい人がいる街まで、親指で進むぶん。ぜんぶで ${hitchKm.toLocaleString()}km`}
          </span>
          <span className="tnow-bar" aria-hidden>
            <span style={{ width: `${Math.round(((hitchKm - leftKm) / hitchKm) * 100)}%` }} />
          </span>
        </div>
      </div>

      {/* 2〜4. いま どこ / つぎ どこ / そこで何が起きる */}
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
      {next?.note && <p className="tnow-what">{next.note}</p>}

      {/* 一本道。どこまで来たかが、この帯だけで分かるようにする。 */}
      <ol className="tnow-rail" aria-label="通る順">
        {stops.map((s, i) => (
          <li
            key={s.name}
            className={`${i < (idx ?? 0) ? "is-past" : ""}${i === idx ? " is-on" : ""}${
              i === last ? " is-goal" : ""
            }`}
          >
            <span className="tnow-dot" />
            <span className="tnow-name">{s.name}</span>
            {i === last && <span className="tnow-goal">会いたい人がいる</span>}
          </li>
        ))}
      </ol>

      <div className="tnow-acts">
        <a className="tnow-act is-main" href="#map">
          通る道を見る
        </a>
        <Link className="tnow-act" href="/nordic/guide">
          旅のしおり
        </Link>
        <a className="tnow-act" href="#voices">
          みんなの意見
        </a>
      </div>
    </div>
  );
}
