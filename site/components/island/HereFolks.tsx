"use client";

import { useEffect, useRef, useState } from "react";
import { loadState } from "@/lib/liveStats";
import {
  HERE_POLL_IDLE_MS,
  HERE_POLL_MS,
  HERE_STALE_MS,
  here,
  type HereMark,
} from "@/lib/here";
import { readHere } from "@/lib/hereRest";
import { useAuth } from "@/lib/auth";

/**
 * いま島にいる人を、島の上に出す（`docs/island-here.md`）。
 *
 * 出るのは丸い YouTube のアイコンと、右下のオンラインの印だけ。
 * **押せない。** 押せるものは島の建物と住人で、そこに3つめを足さない。
 *
 * ## 島ぜんぶを描き直させない
 *
 * 位置は2秒に1回届く。届くたびに `setState` すると、島の160枚のスプライトが
 * まるごと作り直される（`docs/island-design.md`「動きは React の外で」）。
 * ここで React が動くのは**顔ぶれが変わったときだけ**で、位置は
 * `lib/here.ts` の `marks` に直接書き、`IslandStage` の rAF が読んで
 * DOM に置く。島の SVG の外にある要素なので、島は描き直されない。
 *
 * ## 誰も居ない時間帯にただにする
 *
 * `marks` が空なら、島の rAF は長さを見るだけで終わる。
 * ここが DOM を作らなければ、足す前とまったく同じ絵になる。
 *
 * ## Firestore の SDK を落とさない
 *
 * 読むのは REST（`lib/hereRest.ts`）。`firebase/firestore` は 590KB あって、
 * **ログインしていない人にも乗る**（いる人が見えるのは全員なので）。
 * 居場所が変わるのは2秒に1回なので、2秒ごとに読めば
 * **届く中身は onSnapshot と同じ**。違うのは遅れだけで、平均1秒。
 *
 * **誰も居ないあいだは 20秒に1回しか聞かない。** ほとんどの時間帯はこちらで、
 * 0人の返りは数百バイト。誰か現れたら次の1回から 2秒になる。
 *
 * ## 見えていないあいだは聞かない
 *
 * 裏に回したタブと、画面の外にある島のために読み続けない。
 * 戻ってきたらその場で1回読む（20秒待たせない）。
 */

type Row = { uid: string; name?: string | null; photo?: string | null; self?: boolean };

/** 自分の印につける鍵。Firestore から届くどの uid とも当たらない。 */
const SELF = "__me__";

export default function HereFolks() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  /** 顔ぶれと居場所。React の外で持つ */
  const marks = useRef(new Map<string, HereMark>());

  /* --- 自分 ---
     自分の姿は名簿を待たずに出す。**出さないと決めた人にも、自分だけは見える。**
     他の人に見えるかどうかは置いてくるかどうかで決まっていて（`components/live/Here.tsx`）、
     ここで出しているものは自分の画面から外へ出ない。 */
  useEffect(() => {
    const m = marks.current;
    if (user) {
      m.set(SELF, {
        uid: SELF,
        self: true,
        x: here.pos.x,
        y: here.pos.y,
        tx: here.pos.x,
        ty: here.pos.y,
        el: null,
      });
    } else {
      m.delete(SELF);
    }
    setRows(list(m, { [SELF]: { name: user?.name, photo: user?.photo } }));
    // 名前とアイコンは user から取る。ここは自分のぶんだけなので突き合わせが要らない
  }, [user]);

  /* --- 他の人 --- */
  const uid = user?.uid;
  useEffect(() => {
    let stop = false;
    let timer = 0;
    let ac: AbortController | null = null;
    /** いま誰か居るか。聞きにいく間隔をこれで変える */
    let busy = false;
    let who: Map<string, { name?: string | null; photo?: string | null }> | null = null;
    let onVis: (() => void) | null = null;

    /** 届いた名簿を、島の rAF が見ている形へ落とす。 */
    const apply = (list0: { uid: string; x: number; y: number; seenAt: number }[]) => {
      const m = marks.current;
      const now = Date.now();
      let changed = false;
      const alive = new Set<string>();
      for (const v of list0) {
        if (v.uid === uid) continue; // 自分は上で出している
        if (!who?.has(v.uid)) continue; // 出してよいと言っていない人は、出す絵も名前も無い
        if (now - v.seenAt > HERE_STALE_MS) continue;
        alive.add(v.uid);
        const had = m.get(v.uid);
        if (had) {
          // 届いた場所を入れるだけ。ここで React は動かさない
          had.tx = v.x;
          had.ty = v.y;
        } else {
          m.set(v.uid, { uid: v.uid, x: v.x, y: v.y, tx: v.x, ty: v.y, el: null });
          changed = true;
        }
      }
      /* 返ってこなかった人は、その場で落とす。**毎回まるごと届くので、
         「消えたことを教えてもらう」仕組みが要らない。** */
      for (const k of [...m.keys()]) {
        if (k !== SELF && !alive.has(k)) {
          m.delete(k);
          changed = true;
        }
      }
      busy = alive.size > 0;
      if (changed) setRows(list(m, meta(who, user)));
    };

    const schedule = () => {
      if (stop) return;
      timer = window.setTimeout(tick, busy ? HERE_POLL_MS : HERE_POLL_IDLE_MS);
    };

    const tick = async () => {
      if (stop) return;
      // 見えていないあいだは聞かない。戻ってきたら onVis がその場で呼ぶ
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      ac?.abort();
      ac = new AbortController();
      const got = await readHere(HERE_STALE_MS, ac.signal);
      if (stop) return;
      // 読めなかったときは何もしない。**空配列と区別する。**
      // 圏外を「誰も居ない」と描くと、居た人が消えてまた出てくる
      if (got) apply(got);
      schedule();
    };

    const start = async () => {
      if (stop) return;
      const st = await loadState();
      // 誰なのかはサーバーが本人確認したものから引く。
      // ここに載っていない人は、出す名前も絵も無い（＝画面に出しようがない）
      who = new Map(
        (st?.residents ?? []).filter((r) => r.uid).map((r) => [r.uid as string, r]),
      );
      if (stop || who.size === 0) return;
      onVis = () => {
        if (document.visibilityState === "visible") {
          if (timer) clearTimeout(timer);
          void tick();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      void tick();
    };

    /* 島が出て、落ち着いてから始める。
       通信を節約したい設定の人には、この飾りのために通信させない。 */
    const save = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
    let idle = 0;
    let timer0 = 0;
    if (!save) {
      const ric = (
        window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
      ).requestIdleCallback;
      if (ric) idle = ric(() => void start(), { timeout: 4000 });
      else timer0 = window.setTimeout(() => void start(), 2500);
    }

    return () => {
      stop = true;
      ac?.abort();
      if (timer) clearTimeout(timer);
      if (timer0) clearTimeout(timer0);
      if (onVis) document.removeEventListener("visibilitychange", onVis);
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (idle && cic) cic(idle);
    };
    // user は名札の字にしか使わないので、uid が同じなら組み直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /* 顔ぶれが変わったら、島の rAF が見る配列を組み直す。
     ref はここに来るまでに刺さっているので、DOM もそろっている。 */
  useEffect(() => {
    here.marks = rows.map((r) => marks.current.get(r.uid)!).filter(Boolean);
    return () => {
      here.marks = [];
    };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    /* 読み上げには出さない。**押せないし、行き先でもない。**
       2秒ごとに人が出入りするものを読み上げに流すと、
       いま読んでいるところを何度も邪魔することになる。 */
    <div className="labels is-here" aria-hidden>
      {rows.map((r) => (
        <div
          key={r.uid}
          className={`here${r.self ? " is-me" : ""}`}
          ref={(el) => {
            const m = marks.current.get(r.uid);
            if (m) m.el = el;
          }}
        >
          <span className="here-body">
            <span className="here-av">
              {/* 絵は丸く切り抜く。印は切り抜きの外に出す（中に入れると欠ける） */}
              <span className="here-icon">
                {r.photo ? <img src={r.photo} alt="" referrerPolicy="no-referrer" /> : null}
              </span>
              {/* オンラインの印。右下に1つ。押せないので平ら（`island-world.md` 3.4） */}
              <i className="here-dot" />
            </span>
            {r.name && <b className="here-name">{r.name}</b>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 名前とアイコンの引き先。自分だけは user から、他の人は residents から。 */
function meta(
  who: Map<string, { name?: string | null; photo?: string | null }> | null,
  user: { name?: string; photo?: string } | null | undefined,
) {
  const out: Record<string, { name?: string | null; photo?: string | null }> = {
    [SELF]: { name: user?.name, photo: user?.photo },
  };
  for (const [k, v] of who ?? []) out[k] = v;
  return out;
}

/** React に渡す顔ぶれ。自分がいちばん手前。 */
function list(
  m: Map<string, HereMark>,
  info: Record<string, { name?: string | null; photo?: string | null }>,
): Row[] {
  const out: Row[] = [];
  for (const k of m.keys()) {
    const i = info[k] ?? {};
    out.push({ uid: k, name: i.name, photo: i.photo, self: !!m.get(k)?.self });
  }
  return out;
}
