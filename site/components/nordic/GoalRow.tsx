"use client";

import { useEffect, useState } from "react";
import { postNordicArrived, postNordicEnded } from "@/lib/api";
import { useAuth, useOwner } from "@/lib/auth";
import { loadState } from "@/lib/liveStats";

/**
 * 旅程表のいちばん下の2行。**「着いた」と「旅がおわった」を分ける。**
 *
 * ここは長いあいだ1行しかなかった。「着いた朝 / 船が着いたら終わりです」。
 * よていの言い方なので着いたあとも「これから着く」と言い続けていた、というのが
 * 1つ目の問題で、直したあとも**着いたら旅が終わる**作りのままだった。
 *
 * あやとの言葉（2026-09-06）:
 *
 * > ストックホルム出るまでが北欧旅です。なので、それが企画に盛り込まれてるか心配。
 *
 * **着いた日と、旅が終わった日は別の出来事。** 9月20日の朝に着いて、
 * そこから7泊して、9月27日にティラナへ発つ。着いた日は喜ぶところで、
 * 発つ日が締めるところ。1行にまとめると、着いた瞬間に旅が終わる。
 *
 * だから島から届く値も2つある（`/island-api/state`）。
 *
 * | 値 | 何の事実か | 押すところ |
 * | --- | --- | --- |
 * | `nordic.arrivedOn` | ストックホルムに着いた日 | 「着いた」の行 |
 * | `nordic.endedOn` | 旅が終わった日（発った日） | 「旅のおわり」の行 |
 *
 * 旅の終わりは旅の途中に起きるので、どちらも Git には入らない
 * （`docs/nordic-depart.md`）。
 *
 * **届くまでは、よていの字を出す。** 読めなかった日に「着いたかどうか
 * 分かりません」と書くと、旅程表の最後の行が謎になる。
 */

/** 「2026-09-20」→「9月20日(日)」。書き出しは UTC で走るので、月日は文字列から取る。 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

/** 出発から着くまで、何日かかったか。どちらも動かない日付なので、数え直しは要らない。 */
function tookDays(depart: string, arrived: string): number | null {
  const ms = Date.parse(`${arrived}T00:00:00Z`) - Date.parse(`${depart}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const n = Math.round(ms / 86400000) + 1;
  return n > 0 && n < 100 ? n : null;
}

/** 島から届く2つの日。読めなくても null のまま（例外を投げない）。 */
function useNordicDates() {
  const [v, setV] = useState<{ arrived: string | null; ended: string | null }>({
    arrived: null,
    ended: null,
  });
  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      setV({ arrived: s?.nordic?.arrivedOn ?? null, ended: s?.nordic?.endedOn ?? null });
    });
    return () => {
      alive = false;
    };
  }, []);
  return [v, setV] as const;
}

/**
 * 着いた日の行。**旅の折り返しではなく、会いたい人のいる街に降りた日。**
 *
 * 会えたかどうかは書かない。サイトの上のゴールはストックホルムに着くことで、
 * 会えたかどうかはそのあとの配信の話（`docs/nordic-fund.md` 1章）。
 * 相手の都合で会えないことは普通にあるし、そのとき相手が
 * 「約束を破った人」に見えるのがいちばんまずい。
 */
export function ArrivedRow({ depart, arrive }: { depart: string; arrive: string }) {
  const [{ arrived }, setV] = useNordicDates();
  const owner = useOwner();
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);

  const took = arrived ? tookDays(depart, arrived) : null;

  /* 着いた、を記録する。**この行に置く。** 着いたことを言う場所と、
     押す場所を同じにする。取り消せる口も並べておく。
     船が着く前に押してしまうことは普通に起きる。 */
  const mark = async (date: string) => {
    setBusy(true);
    try {
      const t = await token();
      if (!t) return;
      await postNordicArrived(date, t);
      setV((v) => ({ ...v, arrived: date || null }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ndayr is-flat">
      <span className="ndayr-body">
        <span className="ndayr-top">
          <b>{arrived ? "着いた" : "着く"}</b>
          <time dateTime={arrived ?? arrive}>{when(arrived ?? arrive)}</time>
        </span>
        <span className="ndayr-way">
          <span>ストックホルム</span>
        </span>
        <span className="ndayr-say">
          {arrived
            ? `ポーランドから${took ? `${took}日` : ""}、ぜんぶ人の車と船で来ました。ここに、会いたい人がいます。`
            : "船が着く朝。ここに、会いたい人がいます。ここからが、この旅のいちばん長い滞在。"}
        </span>
        {owner && (
          <span className="nlog-acts">
            {arrived ? (
              <button type="button" className="nlog-drop" disabled={busy} onClick={() => mark("")}>
                着いたのを取り消す
              </button>
            ) : (
              <button
                type="button"
                className="nph-post-go"
                disabled={busy}
                /* 日付は今日。UTC で切る（島じゅうの「1日」がそう） */
                onClick={() => mark(new Date().toISOString().slice(0, 10))}
              >
                着いた
              </button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * 旅のおわりの行。**ストックホルムを発つまでが北欧旅。**
 *
 * 着いた行と字を似せない。あちらは「着いた」で、ここは「おわった」。
 * 同じ言い方を2つ並べると、どちらが旅の終わりなのか読めなくなる。
 */
export function EndRow({ leave, fixed }: { leave: string; fixed: string }) {
  const [{ arrived, ended }, setV] = useNordicDates();
  const owner = useOwner();
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);

  const mark = async (date: string) => {
    setBusy(true);
    try {
      const t = await token();
      if (!t) return;
      await postNordicEnded(date, t);
      setV((v) => ({ ...v, ended: date || null }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ndayr is-flat">
      <span className="ndayr-body">
        <span className="ndayr-top">
          <b>{ended ? "旅がおわった" : "旅のおわり"}</b>
          <time dateTime={ended ?? leave}>{when(ended ?? leave)}</time>
        </span>
        <span className="ndayr-way">
          <span>ストックホルム</span>
          <i aria-hidden>→</i>
          <span>ティラナ</span>
        </span>
        <span className="ndayr-say">
          {ended
            ? "ストックホルムを発ちました。ここまでが北欧旅です。"
            : "7泊したあと、ストックホルムを発ちます。出るまでが北欧旅。"}
        </span>
        <span className="ndayr-fixed">{fixed}</span>
        {/* 着いてもいないうちに「おわった」を押せると、事故で旅が終わる。
            押せるのは、着いた日が入ってから。 */}
        {owner && arrived && (
          <span className="nlog-acts">
            {ended ? (
              <button type="button" className="nlog-drop" disabled={busy} onClick={() => mark("")}>
                おわったのを取り消す
              </button>
            ) : (
              <button
                type="button"
                className="nph-post-go"
                disabled={busy}
                onClick={() => mark(new Date().toISOString().slice(0, 10))}
              >
                旅がおわった
              </button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
