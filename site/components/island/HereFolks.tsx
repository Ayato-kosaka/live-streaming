"use client";

import { useEffect, useRef, useState } from "react";
import { firebaseDb } from "@/lib/firebase";
import { loadState } from "@/lib/liveStats";
import { HERE_COL, HERE_STALE_MS, here, type HereMark } from "@/lib/here";
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
 * ## 読み込みを遅らせる
 *
 * firebase/firestore は島でいちばん大きい塊になる。**島が落ち着いてから取りにいく。**
 * ログインしていない人も見えるようにする（それが面白いところなので）が、
 * 島が出るより先に取りにいく理由はない。通信を節約したい設定の人には出さない。
 */

type Row = { uid: string; name?: string | null; photo?: string | null; self?: boolean };

/** 自分の印につける鍵。Firestore から届くどの uid とも当たらない。 */
const SELF = "__me__";

export default function HereFolks() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  /** 顔ぶれと居場所。React の外で持つ */
  const marks = useRef(new Map<string, HereMark>());
  /** その人の便りが最後に届いた時刻。古くなった人を落とすのに使う */
  const seen = useRef(new Map<string, number>());

  /* --- 自分 ---
     自分の姿は Firestore を待たずに出す。**出さないと決めた人にも、自分だけは見える。**
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
    let off: (() => void) | null = null;
    let prune = 0;

    const start = async () => {
      if (stop) return;
      const st = await loadState();
      // 誰なのかはサーバーが本人確認したものから引く。
      // ここに載っていない人は、出す名前も絵も無い（＝画面に出しようがない）
      const who = new Map(
        (st?.residents ?? []).filter((r) => r.uid).map((r) => [r.uid as string, r]),
      );
      if (stop || who.size === 0) return;
      const [db, fs] = await Promise.all([firebaseDb(), import("firebase/firestore")]);
      if (stop) return;
      const q = fs.query(
        fs.collection(db, HERE_COL),
        // 60秒より古い人は、そもそも取ってこない。読む数を抑える
        fs.where("seenAt", ">", fs.Timestamp.fromMillis(Date.now() - HERE_STALE_MS)),
        fs.limit(60),
      );
      off = fs.onSnapshot(
        q,
        (snap) => {
          const m = marks.current;
          const now = Date.now();
          let changed = false;
          const alive = new Set<string>();
          snap.forEach((d) => {
            if (d.id === uid) return; // 自分は上で出している
            const r = who.get(d.id);
            if (!r) return;
            const v = d.data() as { x?: number; y?: number; seenAt?: {toMillis?: () => number} };
            const at = v.seenAt?.toMillis?.() ?? 0;
            if (now - at > HERE_STALE_MS) return;
            const x = Number(v.x);
            const y = Number(v.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            alive.add(d.id);
            seen.current.set(d.id, now);
            const had = m.get(d.id);
            if (had) {
              // 届いた場所を入れるだけ。ここで React は動かさない
              had.tx = x;
              had.ty = y;
            } else {
              m.set(d.id, {uid: d.id, x, y, tx: x, ty: y, el: null});
              changed = true;
            }
          });
          for (const k of [...m.keys()]) {
            if (k !== SELF && !alive.has(k)) {
              m.delete(k);
              seen.current.delete(k);
              changed = true;
            }
          }
          if (changed) setRows(list(m, meta(who, user)));
        },
        () => {
          /* ルールで弾かれた・圏外。島は黙って今までどおり動く */
        },
      );

      /* 便りが途切れた人は、雪だるまのように残る（消し忘れた人の分）。
         スナップショットは向こうが黙ったことを教えてくれないので、こちらで落とす。 */
      prune = window.setInterval(() => {
        const m = marks.current;
        const now = Date.now();
        let changed = false;
        for (const [k, t] of [...seen.current]) {
          if (now - t > HERE_STALE_MS) {
            seen.current.delete(k);
            m.delete(k);
            changed = true;
          }
        }
        if (changed) setRows(list(m, meta(who, user)));
      }, 15_000);
    };

    /* 島が出て、落ち着いてから取りにいく。
       通信を節約したい設定の人には、この飾りのために大きな塊を落とさせない。 */
    const save = (navigator as {connection?: {saveData?: boolean}}).connection?.saveData;
    let idle = 0;
    let timer = 0;
    if (!save) {
      const ric = (window as unknown as {requestIdleCallback?: (f: () => void, o?: {timeout: number}) => number})
        .requestIdleCallback;
      if (ric) idle = ric(start, {timeout: 4000});
      else timer = window.setTimeout(start, 2500);
    }

    return () => {
      stop = true;
      if (off) off();
      if (prune) clearInterval(prune);
      if (timer) clearTimeout(timer);
      const cic = (window as unknown as {cancelIdleCallback?: (h: number) => void}).cancelIdleCallback;
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
  who: Map<string, {name?: string | null; photo?: string | null}>,
  user: {name?: string; photo?: string} | null | undefined,
) {
  const out: Record<string, {name?: string | null; photo?: string | null}> = {
    [SELF]: {name: user?.name, photo: user?.photo},
  };
  for (const [k, v] of who) out[k] = v;
  return out;
}

/** React に渡す顔ぶれ。自分がいちばん手前。 */
function list(
  m: Map<string, HereMark>,
  info: Record<string, {name?: string | null; photo?: string | null}>,
): Row[] {
  const out: Row[] = [];
  for (const k of m.keys()) {
    const i = info[k] ?? {};
    out.push({uid: k, name: i.name, photo: i.photo, self: !!m.get(k)?.self});
  }
  return out;
}
