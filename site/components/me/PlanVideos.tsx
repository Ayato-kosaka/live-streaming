"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getStreamEventPlans,
  setPlanVideos,
  videoIdOf,
  type NextPlan,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/lib/draft";
import Icon from "@/components/ui/Icon";

/** 「2026-09-14」→「9/14」。札に出す短いほう（旅の道具と同じ言い方）。 */
const md = (iso: string) =>
  `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * この配信は、この企画のもの（#202）。**あやとだけ。**
 *
 * ## なぜ旅の道具に入っているか
 *
 * 配信日の境目は日本時間の0時。**0時をまたぐと、1本の配信が2本に割れる。**
 * 後半は日付では当たらないので、後半の動画IDを企画に足さないと、
 * **後半に投げてくれた人にカードが渡らない。**
 *
 * 実際に 2026-09-06 で起きた。ひめひめさんが2回投げてくれたのに、
 * 手で足すまで片方が付かなかった。旅のあいだ毎晩起きうるので、
 * ヒッチハイクの途中に片手で開く3つの隣に置く。
 *
 * ## URL を貼れる
 *
 * **スマホで11文字を打たせない。** 旅の途中に開いているのは YouTube の
 * ページなので、そこから出てくるのは URL。`watch?v=` でも `youtu.be/` でも
 * `live/` でも、そこから id を取り出す（`videoIdOf`）。
 * 取り出した id は**足す前に画面に出す。** 送ってから返事で気づくのでは、
 * 電波の細いところでは遅い。
 *
 * ## 送ると置き換わる
 *
 * 口（`POST /nextplans/{id}/videos`）は**足す・外すではなく、送った一覧で
 * まるごと置き換える。** だから、いま入っているものを先に出してから送る。
 * 打ち間違えた1本を外す道が要るし、一覧で持つほうが画面が単純になる。
 */
export default function PlanVideos() {
  const { token } = useAuth();
  const online = useOnline();
  /** 取りにいっている最中は null。0件と区別する */
  const [plans, setPlans] = useState<NextPlan[] | null>(null);
  const [down, setDown] = useState(false);
  const [pick, setPick] = useState("");
  /** 打っている途中の一覧。**送るまでサーバーには行かない** */
  const [ids, setIds] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    /* **提案だけでなく運営側の企画も要る**（`events=1`）。結ぶ相手は
       たいてい「北欧◯日目」で、あれは掲示板の一覧には出てこない。 */
    getStreamEventPlans(200)
      .then((r) => {
        if (!alive) return;
        setPlans(r?.plans ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setPlans([]);
        setDown(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** 新しい日から。**旅の途中に足すのは、たいてい今日か昨日のぶん。** */
  const rows = useMemo(
    () =>
      [...(plans ?? [])].sort((a, b) =>
        (b.date || "").localeCompare(a.date || ""),
      ),
    [plans],
  );

  /* 開いた日を決める。**今日から見て、いちばん近い過ぎた企画。**
     `rows` は新しい順なので、今日以前の先頭がそれにあたる。 */
  useEffect(() => {
    if (pick || rows.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const near = rows.find((p) => p.date && p.date <= today);
    setPick((near ?? rows[0]).id);
  }, [rows, pick]);

  const plan = rows.find((p) => p.id === pick);

  /* 選び直したら、その企画にいま入っているものを出す。
     **打ちかけの一覧は持ち越さない。** 別の企画に、前の企画の配信を
     入れて送ってしまう。

     **一覧（`rows`）が入れ替わっただけでは走らせない。** 送ったあとに
     一覧を差し替えているので、そこで走ると押した結果の1行が消える
     （入ったのかどうかが分からなくなる）。 */
  useEffect(() => {
    setIds(rows.find((p) => p.id === pick)?.videoIds ?? []);
    setSaid(null);
    setBad(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  /** 打った字から取り出した id。**足す前に見せる** */
  const found = videoIdOf(typed);
  /** 送るものが、いま入っているものと違うか */
  const dirty =
    !!plan && ids.join(",") !== (plan.videoIds ?? []).join(",");

  const add = () => {
    if (!found) {
      setBad(true);
      setSaid("動画IDが読み取れませんでした。YouTube の URL を貼ってください。");
      return;
    }
    if (ids.includes(found)) {
      setBad(true);
      setSaid(`${found} はもう入っています。`);
      return;
    }
    setIds([...ids, found]);
    setTyped("");
    setBad(false);
    setSaid(null);
  };

  const send = async () => {
    if (!plan) return;
    const t = await token();
    if (!t) {
      setBad(true);
      setSaid("ログインしなおしてください。");
      return;
    }
    setBusy(true);
    setSaid(null);
    try {
      const r = await setPlanVideos(plan.id, ids, t);
      setPlans((cur) => cur?.map((p) => (p.id === r.plan.id ? r.plan : p)) ?? cur);
      setIds(r.plan.videoIds ?? []);
      setBad(false);
      setSaid(
        r.plan.videoIds?.length
          ? `${r.plan.videoIds.length}本を「${plan.title}」のものにしました。カードはこのあと配られます。`
          : `「${plan.title}」の配信をぜんぶ外しました。日付だけで結びます。`,
      );
    } catch (e) {
      setBad(true);
      setSaid(`送れませんでした。${String(e).slice(0, 60)}`);
    } finally {
      setBusy(false);
    }
  };

  if (plans === null) {
    return (
      <div className="wait is-row" aria-hidden>
        <span />
        <span />
      </div>
    );
  }

  return (
    <div className="dform mp-tool">
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。届いたら押してください。
        </p>
      )}
      <p className="mp-vid-lead">0時をまたいで割れた夜の、後半を足す。</p>

      {rows.length === 0 ? (
        <p className="muted">
          {down
            ? "企画が読めませんでした。電波の届くところで開き直してください。"
            : "まだ企画が1つもありません。"}
        </p>
      ) : (
        <>
          <label className="nph-post-row">
            <span>どの企画に</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              {rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.date ? `${md(p.date)} ` : ""}
                  {p.title || "（題なし）"}
                  {p.videoIds?.length ? ` ・${p.videoIds.length}本` : ""}
                </option>
              ))}
            </select>
          </label>

          {/* いま入っているもの。**送る前に、送る中身がそのまま見えている。**
              置き換えの口なので、ここに並んでいるものが送られる。 */}
          <p className="mp-vid-h">
            この企画の配信
            <i>{ids.length === 0 ? "まだ入っていません" : `${ids.length}本`}</i>
          </p>
          {ids.length > 0 && (
            <ul className="mp-vid-list">
              {ids.map((v) => (
                <li key={v}>
                  <code>{v}</code>
                  <button
                    type="button"
                    className="mp-vid-off"
                    onClick={() => setIds(ids.filter((x) => x !== v))}
                  >
                    <Icon name="close" size={13} />
                    外す
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="nph-post-row">
            <span>足す配信</span>
            <input
              type="text"
              value={typed}
              maxLength={200}
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=… を貼る"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          {/* 取り出した id を、足す前に出す。**貼ったものが正しく読めたか**が
              押す前に分かる。読めていなければ押しどころ自体を出さない。 */}
          <div className="mp-vid-add">
            <span className="mp-vid-found">
              {typed.trim()
                ? found
                  ? `動画ID ${found}`
                  : "動画IDが読み取れません"
                : "URL でも、動画IDそのままでも"}
            </span>
            <button
              type="button"
              className="mp-send is-small"
              disabled={!found}
              onClick={add}
            >
              <Icon name="plus" size={14} />
              足す
            </button>
          </div>

          {/* **札はいつも動作のまま。** 押せないときに「変わっていません」と
              書き替えると、押しどころが状態を言う欄に化ける。
              押せるかどうかは厚みが言う（`docs/island-design.md` 3・5-2）。 */}
          <button className="mp-send" disabled={busy || !dirty} onClick={send}>
            {busy ? "送っています…" : "この企画のものにする"}
          </button>
          {said && (
            <p className={bad ? "err" : "mp-vid-said"}>
              {bad && <Icon name="alert" size={13} />}
              {said}
            </p>
          )}
        </>
      )}
    </div>
  );
}
