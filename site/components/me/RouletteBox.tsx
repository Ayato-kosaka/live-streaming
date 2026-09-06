"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRoulette,
  putRouletteItems,
  putRouletteSettings,
  readRouletteChat,
  sayRouletteResult,
  spinRoulette,
  startRoulette,
  type ChatLine,
  type RouletteItem,
  type RouletteSession,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MAX_ITEMS, RESULT_SAY, RL_UI, WAIT_SECONDS } from "@/content/roulette";
import { THEMES, THEME_NAME, type WheelTheme } from "@/components/roulette/wheel";
import Icon from "@/components/ui/IconCore";
import Fold from "@/components/ui/Fold";
import SignIn from "@/components/live/SignIn";

/** 手元に残しておくコメントの数。これより古いものは落とす。 */
const KEEP = 200;

/**
 * ルーレットのコントローラー（#164）。**あやとだけ。**
 *
 * あやとの言葉:「スマホ版OBSでURLのパラメータに値を入れてるんですけど。
 * それが配信中にそれやるのが結構大変」。ここはその URL を書き換える
 * 代わりに立てる面で、配信していない方の端末で開く。
 *
 * ## 配信中に、走りながら押す
 *
 * - 押しどころは**どれも 48px 以上**。回すところは 64px
 * - コメントの1行がそのまま押しどころ。**チェック箱を別に置かない**
 * - 選んだものは即座に表示側へ行く。押してから確かめない
 * - 36件でいっぱい。37件目は**押せなくする**（あやとの決め）
 *
 * ## 当たりはここで決めない
 *
 * 「回す」を押すと、サーバーが当たりを決めて Firestore に書き、
 * 表示側がそれを見て回りだす。結果のコメントも Functions が投げる。
 * OBS が落ちていても、コメントだけは配信に出る。
 */
export default function RouletteBox() {
  const { user, token } = useAuth();
  const [ses, setSes] = useState<RouletteSession | null>(null);
  /** あやと以外が URL を直に叩いて来たとき */
  const [denied, setDenied] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [live, setLive] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 秒ごとに動かして、待ち時間の表示を進める */
  const [, beat] = useState(0);

  const sid = ses?.id ?? null;
  const items = ses?.items ?? [];
  const picked = new Set(items.map((x) => x.id));
  const full = items.length >= MAX_ITEMS;

  /* ---- 開く。id は作り直さない（OBS の URL が変わってしまう） ---- */
  const open = useCallback(
    async (clear: boolean) => {
      const t = await token();
      if (!t) return;
      setBusy(true);
      setErr(null);
      try {
        const r = await startRoulette(t, clear);
        setSes(r.session);
        setLive(r.live);
        if (clear) setLines([]);
      } catch (e) {
        if (String(e).includes("403")) setDenied(true);
        else setErr("開けませんでした。電波の届くところで、もう一度。");
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (user) open(false);
  }, [user, open]);

  /* ---- コメントを流す。**コントローラーを開いてからのぶんだけ** ---- */
  useEffect(() => {
    if (!sid) return;
    let gone = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const tk = await token();
      let wait = 6000;
      if (tk) {
        try {
          const r = await readRouletteChat(sid, tk);
          if (gone) return;
          setLive(r.live);
          wait = r.wait;
          if (r.lines.length) {
            setLines((p) => [...r.lines].reverse().concat(p).slice(0, KEEP));
          }
        } catch {
          /* 配信が終わっただけかもしれない。次の周期でまた聞く */
          wait = 15000;
        }
      }
      if (gone) return;
      t = setTimeout(tick, wait);
    };
    tick();
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [sid, token]);

  /* ---- 回っているあいだは、状態を読み直す ---- */
  const turning =
    !!ses?.spunAt && !ses.posted && Date.now() < (ses.postAt ?? 0) + 20000;
  useEffect(() => {
    if (!sid || !turning) return;
    const t = setInterval(async () => {
      beat((n) => n + 1);
      try {
        const r = await getRoulette(sid);
        setSes((p) => (p && p.updatedAt === r.session.updatedAt ? p : r.session));
      } catch {
        /* 読めなくても、押した事実は変わらない */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [sid, turning]);

  /* ---- 選択肢を置き換える。押した手ごたえを先に出す ---- */
  const put = useCallback(
    async (next: RouletteItem[]) => {
      if (!sid) return;
      const t = await token();
      if (!t) return;
      const before = ses;
      setSes((p) => (p ? { ...p, items: next, result: null, spunAt: null } : p));
      try {
        const r = await putRouletteItems(sid, next, t);
        setSes(r.session);
      } catch {
        setSes(before);
        setErr("入れられませんでした。もう一度おしてください。");
      }
    },
    [sid, ses, token],
  );

  const toggle = (line: ChatLine) => {
    if (picked.has(line.id)) {
      put(items.filter((x) => x.id !== line.id));
      return;
    }
    if (full) return;
    put([
      ...items,
      {
        id: line.id,
        label: line.text,
        name: line.name,
        icon: line.icon,
        byHand: false,
      },
    ]);
  };

  const [typed, setTyped] = useState("");
  const addByHand = () => {
    const label = typed.trim();
    if (!label || full) return;
    put([
      ...items,
      {
        id: `hand-${Date.now().toString(36)}`,
        label,
        name: "",
        icon: "",
        byHand: true,
      },
    ]);
    setTyped("");
  };

  /* ---- 設定 ---- */
  const setting = async (
    s: Partial<Pick<RouletteSession, "wait" | "duration" | "turns" | "theme">>,
  ) => {
    if (!sid) return;
    const t = await token();
    if (!t) return;
    setSes((p) => (p ? { ...p, ...s } : p));
    try {
      const r = await putRouletteSettings(sid, s, t);
      setSes(r.session);
    } catch {
      setErr("直せませんでした。もう一度おしてください。");
    }
  };

  /* ---- 回す ---- */
  const spin = async () => {
    if (!sid || items.length < 2 || turning) return;
    const t = await token();
    if (!t) return;
    setErr(null);
    /* **返事を待たない。** サーバーは結果のコメントを投げ終わってから
       返す（最長30秒）ので、待つと押した人の画面が固まる。
       いま何が起きているかは、読み直したほうから出す。 */
    spinRoulette(sid, ses?.wait ?? WAIT_SECONDS[1], RESULT_SAY, t)
      .then((r) => setSes(r.session))
      .catch(() =>
        setErr("回せたか分かりません。表示のほうを見てください。"),
      );
    setSes((p) =>
      p ?
        {
          ...p,
          status: "回っている",
          spunAt: Date.now() + 1200,
          postAt:
            Date.now() + 1200 + p.duration * 1000 + (p.wait ?? 10) * 1000,
          posted: false,
        } :
        p,
    );
  };

  const sayAgain = async () => {
    if (!sid) return;
    const t = await token();
    if (!t) return;
    try {
      const r = await sayRouletteResult(sid, t);
      setSes((p) => (p ? { ...p, posted: r.posted } : p));
      if (!r.posted) setErr("いま配信していないので、投げられませんでした。");
    } catch {
      setErr("投げられませんでした。もう一度おしてください。");
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
  if (!user) {
    return (
      <section className="panel paper">
        <h2>ここは、あやとのところ</h2>
        <p className="muted">配信のルーレットを回すところ。入ると出ます。</p>
        <SignIn />
      </section>
    );
  }
  if (denied) {
    return (
      <section className="panel paper">
        <h2>ここは、あやとのところ</h2>
        <p className="muted">
          配信のルーレットを回すところなので、あやとだけが開けます。
          島のほかの面は、そのまま見られます。
        </p>
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
      `${window.location.origin}/roulette?s=${ses.id}`;
  const won = ses.result ? items.find((x) => x.id === ses.result) : null;
  const left = ses.postAt ? Math.ceil((ses.postAt - Date.now()) / 1000) : 0;

  return (
    <>
      {/* 回すところ。**いちばん上。** 配信中はここしか押さない */}
      <section className="panel paper rc-go">
        <h2>回す</h2>
        <p className="rc-count">
          <b>{items.length}</b> / {MAX_ITEMS} 件
          {full && <span className="chip">いっぱい</span>}
        </p>
        <button
          className="rc-spin"
          onClick={spin}
          disabled={items.length < 2 || turning}
        >
          <Icon name="play" size={20} />
          {turning ? "回っています" : "ルーレット開始"}
        </button>
        {items.length < 2 && (
          <p className="rc-note">2件から回せます。下から選ぶか、手で足す。</p>
        )}

        <p className="rc-lab">結果を配信にコメントするまで</p>
        <div className="rc-waits">
          {WAIT_SECONDS.map((w) => (
            <button
              key={w}
              className={`rc-wait${ses.wait === w ? " is-on" : ""}`}
              onClick={() => setting({ wait: w })}
              aria-pressed={ses.wait === w}
            >
              {w}秒
            </button>
          ))}
        </div>
        <p className="rc-note">
          配信のラグぶん、待ってから投げる。早すぎると答えが先に出る。
        </p>

        {won && (
          <p className="rc-won">
            <b>{won.label}</b>
            <i>
              {ses.posted ?
                "配信にコメントしました" :
                turning ?
                  `あと ${Math.max(left, 0)} 秒でコメント` :
                  "コメントは、まだ投げていません"}
            </i>
          </p>
        )}
        {won && !ses.posted && !turning && (
          <button className="rc-say" onClick={sayAgain}>
            <Icon name="refresh" size={16} />
            結果をもう一度おくる
          </button>
        )}
      </section>

      {/* これから回すもの */}
      <section className="panel paper">
        <h2>これから回すもの</h2>
        {items.length === 0 ? (
          <div className="blank">
            <b>まだ1件も入っていません</b>
            <p>下のコメントを押すと入ります。コメントに無いものは、手で足せます。</p>
          </div>
        ) : (
          <ul className="rc-picked">
            {items.map((it) => (
              <li key={it.id}>
                <span className="rc-picked-t">
                  <b>{it.label}</b>
                  {/* 手で足したものには、書いた人がいない。名前の欄も出さない */}
                  {!it.byHand && it.name && <i>{it.name}</i>}
                  {it.byHand && <i>手で足したもの</i>}
                </span>
                <button
                  className="rc-off"
                  onClick={() => put(items.filter((x) => x.id !== it.id))}
                  aria-label={`${it.label} を外す`}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dform rc-add">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addByHand();
            }}
            placeholder="コメントに無いものを足す"
            maxLength={60}
            aria-label="手で足す"
          />
          <button onClick={addByHand} disabled={!typed.trim() || full}>
            <Icon name="plus" size={16} />
            足す
          </button>
        </div>
      </section>

      {/* コメント */}
      <section className="panel paper">
        <h2>流れてきたコメント</h2>
        {live === false && <p className="rc-note">{RL_UI.noLive}</p>}
        {lines.length === 0 ? (
          <div className="blank">
            <b>まだ来ていません</b>
            <p>{RL_UI.noComments}</p>
          </div>
        ) : (
          <ul className="rc-lines">
            {lines.map((l) => {
              const on = picked.has(l.id);
              return (
                <li key={l.id}>
                  <button
                    className={`rc-line${on ? " is-on" : ""}`}
                    onClick={() => toggle(l)}
                    disabled={!on && full}
                    aria-pressed={on}
                  >
                    <span className="rc-tick" aria-hidden>
                      {on && <Icon name="check" size={16} />}
                    </span>
                    {l.icon ? (
                      <img className="rc-face" src={l.icon} alt="" />
                    ) : (
                      <span className="rc-face" aria-hidden />
                    )}
                    <span className="rc-line-t">
                      <b>{l.text}</b>
                      <i>{l.name}</i>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 出し先と、細かいところ。**決めたら滅多に触らないので畳む。** */}
      <Fold title="表示（OBS）に出す URL" lead="いちど貼れば、変わらない">
        <p className="rc-url">{url}</p>
        <div className="rc-acts">
          <button
            className="rc-quiet"
            onClick={() => navigator.clipboard?.writeText(url)}
          >
            URL をうつす
          </button>
          <button className="rc-quiet" onClick={() => open(true)} disabled={busy}>
            はじめから
          </button>
        </div>
        <p className="rc-note">
          この URL を知っている人は、ルーレットを見られます。配信の画面に
          そのまま映すもの以外には貼らない。「はじめから」で、選んだものを空にする。
        </p>
      </Fold>

      <Fold title="回りかたと色" lead={`${ses.duration}秒・${ses.turns}周`}>
        <div className="dform rc-set">
          <label>
            <span>回る秒数</span>
            <input
              type="number"
              min={1}
              max={15}
              value={ses.duration}
              onChange={(e) => setting({ duration: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>何周</span>
            <input
              type="number"
              min={2}
              max={15}
              value={ses.turns}
              onChange={(e) => setting({ turns: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>色</span>
            <select
              value={ses.theme}
              onChange={(e) => setting({ theme: e.target.value })}
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {THEME_NAME[t as WheelTheme]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Fold>

      {err && <p className="rc-err">{err}</p>}
    </>
  );
}
