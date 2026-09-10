"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  REMOTE_DOORS,
  REMOTE_PAGES,
  REMOTE_PARAM,
  REMOTE_SCROLLS,
  openRemote,
  pushRemote,
  type RemotePush,
  type RemoteState,
} from "@/lib/remote";
import { useAuth } from "@/lib/auth";
import { DAY_PAGES, dayHref, dayName } from "@/content/nordic";
import { jstNow } from "@/lib/nightly";
import Icon from "@/components/ui/IconCore";
import Fold from "@/components/ui/Fold";

/** 手元に残す押しどころの数。配信1本ぶんを遡れれば足りる。 */
const KEEP = 20;

/** 押した1つ。**送れたかどうかまで残す。** */
type Hit = {
  id: number;
  label: string;
  at: number;
  state: "送っています" | "送りました" | "送れませんでした";
};

/**
 * 島の遠隔操作のコントローラー（#165）。**あやとだけ。**
 *
 * あやとの言葉:
 *
 * > スマホ版OBSを見てる人がこのあやと島のことを知って、で操作方法も
 * > なんとなくわかって、で僕が操作しながら、2日目はこんな感じで行く
 * > 予定ですみたいなのを話せる
 *
 * **これは宣伝の道具ではなく、遊びかたを見せる道具。** だから表示側にも
 * 「何を押したか」が出る（左下に2秒）。出ないと、勝手に画面が動いている
 * ようにしか見えない。うるさければ、下の入切から切る。
 *
 * ## 配信中に、喋りながら押す
 *
 * - 押しどころは**どれも 48px 以上**。ルーレット（#164）と同じ寸法にそろえる
 * - **押したことが手元に残る。** 押しても何も返らないと、表示側が別の端末に
 *   ある以上、届いたのかどうかを確かめる方法が無い。上の紙に積む
 * - **北欧の日は「今日」だけを出して、残りは畳む。** 旅が進むと押す場所が
 *   変わる並びなので、10個ぜんぶ出すと毎日ちがう場所を探すことになる
 *
 * ## 表示側は Firestore ごしに繋がる
 *
 * ここが押すのは `POST /island-api/remote` まで。通し番号（`seq`）は
 * サーバーが +1 して、表示側が2秒ごとに読んで、増えていたら従う。
 * **同じボタンを2回押しても効く**のはそのため。
 */
export default function RemoteBox() {
  const { user, token } = useAuth();
  const [ses, setSes] = useState<RemoteState | null>(null);
  /** あやと以外が URL を直に叩いて来たとき */
  const [denied, setDenied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  /** 日本時間の今日。**書き出しに焼かない**（`CLAUDE.md`）ので、出てから数える */
  const [today, setToday] = useState("");

  useEffect(() => setToday(jstNow().date), []);

  /* ---- 開く。id は作り直さない（OBS の URL が変わってしまう） ---- */
  const open = useCallback(
    async (fresh: boolean) => {
      const t = await token();
      if (!t) return;
      setErr(null);
      try {
        const r = await openRemote(t, fresh);
        setSes(r.session);
      } catch (e) {
        if (String(e).includes("403")) setDenied(true);
        else setErr("開けませんでした。電波の届くところで、もう一度。");
      }
    },
    [token],
  );

  useEffect(() => {
    if (user) open(false);
  }, [user, open]);

  /* ---- 押す。**手ごたえを先に出して、あとから結果で塗り替える** ---- */
  const hit = useCallback(
    async (label: string, p: Omit<RemotePush, "sessionId" | "say">) => {
      if (!ses) return;
      const id = Date.now();
      setHits((prev) =>
        [{ id, label, at: id, state: "送っています" } as Hit, ...prev].slice(0, KEEP),
      );
      const mark = (state: Hit["state"]) =>
        setHits((prev) => prev.map((h) => (h.id === id ? { ...h, state } : h)));
      const t = await token();
      if (!t) {
        mark("送れませんでした");
        return;
      }
      try {
        /* 表示側の左下に出る一言は**ここで作る**。サーバーに作らせると、
           ボタンの名前を直すたびに Functions を出し直すことになる。 */
        const r = await pushRemote(
          { ...p, sessionId: ses.sessionId, say: `${label} を押しました` },
          t,
        );
        setSes(r.session);
        mark("送りました");
      } catch {
        mark("送れませんでした");
      }
    },
    [ses, token],
  );

  /* ---- 「押したものを表示側に出す」の入切 ---- */
  const flipSay = async () => {
    if (!ses) return;
    const next = !ses.showSay;
    setSes({ ...ses, showSay: next });
    const t = await token();
    if (!t) return;
    try {
      const r = await pushRemote(
        { sessionId: ses.sessionId, showSay: next, say: "" },
        t,
      );
      setSes(r.session);
    } catch {
      setSes((p) => (p ? { ...p, showSay: !next } : p));
      setErr("切り替えられませんでした。もう一度おしてください。");
    }
  };

  /* ---- 出す ---- */
  if (user === undefined) {
    return (
      <section className="panel paper">
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      </section>
    );
  }
  /* ここへの入口は、あやとの机（`/me/desk`）の1本だけ（#242）。
     看板にも `/all` にもパンくずにも出していないので、ここに着くのは
     あやとか、URL を直に打った人しかいない。**決まりの説明は置かない。**
     場所の名前と、戻る道だけ出す（`/me/desk` と同じ形）。 */
  if (!user || denied) {
    return (
      <section className="panel paper">
        <h2>ここは、あやとの机</h2>
        <Link className="blank-go" href="/">
          島へもどる
          <Icon name="right" size={14} />
        </Link>
      </section>
    );
  }
  if (!ses) {
    return (
      <section className="panel paper">
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      </section>
    );
  }

  const url =
    typeof window === "undefined" ?
      "" :
      `${window.location.origin}/?${REMOTE_PARAM}=${ses.sessionId}`;

  /* 北欧の日。**「今日」を先頭に出して、残りは畳む。**
     旅の途中なら今日そのもの、まだなら次に来る日、終わっていれば最後の日。
     `date` は型の上では無いこともある（旅程表の行は日付を持たないものが
     作れる）ので、空文字に落として比べる。 */
  const dateOf = (d: (typeof DAY_PAGES)[number]) => d.date ?? "";
  const head =
    DAY_PAGES.find((d) => today && dateOf(d) === today) ??
    DAY_PAGES.find((d) => today && dateOf(d) > today) ??
    DAY_PAGES[DAY_PAGES.length - 1];
  const headDate = dateOf(head);
  const headWhy =
    headDate === today ? "今日" : !today || headDate > today ? "つぎの日" : "さいごの日";
  const rest = DAY_PAGES.filter((d) => d.id !== head.id);

  return (
    <>
      {/* 押したもの。**いちばん上。** 表示側は別の端末にあるので、
          ここに残らないと、届いたかどうかを確かめる方法が無い */}
      <section className="panel paper rm-log">
        <h2>押したもの</h2>
        {hits.length === 0 ? (
          <p className="rm-note">
            まだ何も押していません。
          </p>
        ) : (
          <ul className="rm-hits">
            {hits.map((h) => (
              <li key={h.id} data-state={h.state}>
                <b>{h.label}</b>
                <i>{h.state}</i>
                <em>{new Date(h.at).toLocaleTimeString("ja-JP")}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 島 */}
      <section className="panel paper">
        <h2>島</h2>
        <div className="rm-row rm-row-2">
          <button className="rm-key is-big" onClick={() => hit("ひきで見る", { at: "/", view: "wide" })}>
            <Icon name="island" size={20} />
            ひきで見る
          </button>
          <button className="rm-key is-big" onClick={() => hit("よってみる", { at: "/", view: "near" })}>
            <Icon name="walk" size={20} />
            よってみる
          </button>
        </div>
      </section>

      {/* スクロール。**飛ばずに、送る。** */}
      <section className="panel paper">
        <h2>スクロール</h2>
        <div className="rm-row rm-row-3 rm-row-scroll">
          {REMOTE_SCROLLS.map((s) => (
            <button
              key={s.to}
              className="rm-key"
              onClick={() => hit(s.label, { scrollTo: s.to })}
            >
              <Icon name={s.to === "top" ? "up" : "chevron"} size={15} />
              {s.label}
            </button>
          ))}
        </div>
        <p className="rm-note">1回で1画面ぶん、滑らかに送る。</p>
      </section>

      {/* 面 */}
      <section className="panel paper">
        <h2>面</h2>
        <div className="rm-row rm-row-3">
          {REMOTE_PAGES.map((b) => (
            <button key={b.at} className="rm-key" onClick={() => hit(b.label, { at: b.at })}>
              {b.label}
            </button>
          ))}
        </div>
      </section>

      {/* 入口 */}
      <section className="panel paper">
        <h2>入口</h2>
        <div className="rm-row rm-row-2">
          {REMOTE_DOORS.map((b) => (
            <button key={b.at} className="rm-key" onClick={() => hit(b.label, { at: b.at })}>
              {b.label}
            </button>
          ))}
        </div>
        <p className="rm-note">島の看板に出ている6つ。</p>
      </section>

      {/* 北欧の日。**今日だけを出して、残りは畳む。** */}
      <section className="panel paper">
        <h2>北欧の日</h2>
        {head && (
          <button
            className="rm-key is-big is-day"
            onClick={() => hit(dayName(head), { at: dayHref(head) })}
          >
            <Icon name="calendar" size={20} />
            <span className="rm-day-t">
              <b>{dayName(head)}</b>
              <i>
                {headWhy}
                {headDate && `・${headDate.slice(5).replace("-", "/")}`}
              </i>
            </span>
          </button>
        )}
        <Fold title="ほかの日" lead={`${rest.length}日ぶん`}>
          <div className="rm-row rm-row-3">
            {rest.map((d) => (
              <button
                key={d.id}
                className="rm-key"
                onClick={() => hit(dayName(d), { at: dayHref(d) })}
              >
                {dayName(d)}
              </button>
            ))}
          </div>
        </Fold>
        <p className="rm-note">押すと、その日のページが出る。</p>
      </section>

      {/* 表示側の見え方と、出し先 */}
      <section className="panel paper">
        <h2>表示側</h2>
        <button
          className={`rm-switch${ses.showSay ? " is-on" : ""}`}
          onClick={flipSay}
          aria-pressed={ses.showSay}
        >
          <Icon name={ses.showSay ? "check" : "close"} size={18} />
          <span className="rm-switch-t">
            <b>押したものを表示側に出す</b>
            <i>左下に小さく2秒。うるさければ、ここで切る</i>
          </span>
        </button>

        <Fold title="表示（OBS）に出す URL" lead="いちど貼れば、変わらない">
          <p className="rm-url">{url}</p>
          <div className="rm-acts">
            <button
              className="rm-quiet"
              onClick={() => navigator.clipboard?.writeText(url)}
            >
              URL をうつす
            </button>
            <button className="rm-quiet" onClick={() => open(true)}>
              合言葉を作り直す
            </button>
          </div>
          <p className="rm-note">
            この URL を知っている人は、押したものを読めます（動かせるのはあやとだけ）。
            作り直すと、前の URL では動かなくなります。
          </p>
        </Fold>
      </section>

      {err && <p className="rm-err">{err}</p>}
    </>
  );
}
