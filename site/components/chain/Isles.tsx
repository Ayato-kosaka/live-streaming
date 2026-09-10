"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Icon from "@/components/ui/IconCore";
import { useFund } from "@/components/nordic/fund";
import {
  CHAIN,
  CHAPTERS,
  chapterDays,
  chapterNext,
  chapterNow,
  chapterSpan,
  FUND_GOAL_YEN,
  NEXT_CHAPTER,
  NOW_CHAPTER,
  type Chapter,
} from "@/content/chapters";
import { CHAPTER_STATS } from "@/content/chapterStats";
import { chapterHref } from "./route";
import { islandRadius } from "./shapes";
import Diorama, { buildStage, type BuildStage } from "./Diorama";

import { dio, fit, HOME_BUILDINGS, type AtlasIsle } from "./diorama";

/**
 * 島の地図。**模型を1つずつ見て、選んで、渡る。**
 *
 * あやとの言葉:「島のマップを押すと、今の島が3Dモデル風に出てきて、
 * 左右上矢印が出てきて、押すとその島が出てきて、その島を押すとその島に
 * 移動できるUXがどう森っぽいと思うけどどうだろう？」
 *
 * ## 並べない。1つだけ大きく出す
 *
 * 前は5つの島を縦に並べていた。一覧としては読めるが、**島が模型に見えない。**
 * ここは1つだけを大きく出して、となりの島は左右にはみ出させる。
 * はみ出しているものが「まだ先がある」を言うので、矢印の意味も説明が要らない。
 *
 * ## 上は枝の島
 *
 * イランは本線から逸れて、また戻ってきた（`docs/island-atlas.md` 2章）。
 * 左右は本線、**上はその枝**。コーカサスで上を押すとイランが出て、
 * イランで下を押すとコーカサスに戻る。他の島に上は出ない。
 *
 * ## 主役は寄る。大きさの比べ合いは、下の航路が持つ
 *
 * **島の大きさの式（`islandRadius`）は1文字も変えていない**（同 3章）。
 * 変えたのは、1つだけ主役として出すときのカメラの寄りだけ。日数どおりの縮尺で
 * 17日の北欧を1枚に出すと、大きな水色の皿に小さな茶色い塊が乗っているだけで
 * 島に見えなかった（あやとの判断で寄せた。`docs/island-atlas.md` 8章）。
 *
 * 代わりに、下の航路の丸は**直径が島の半径そのもの**にしてある。
 * 面積が日数に比例するので、島どうしの大きさはそこで読む。
 *
 * ## 動かすのは CSS の transform だけ
 *
 * 島を1枚ずつ包んだ div を動かす。SVG の中は静止画のまま
 * （`CLAUDE.md`「島の SVG の中で動かしたものは、その形の外接矩形ぶんが
 * 毎フレーム描き直される」）。
 */

/** 船が渡りきるまで。長いと待たされ、短いと何が起きたか分からない */
const SAIL_MS = 720;

type Slot = "at" | "left" | "right" | "up" | "down" | "off";

export default function Isles({ isles }: { isles: AtlasIsle[] }) {
  /* 日数も「いまいる島」も**画面が出てから決める。**
     静的書き出しなので、焼いた答えのままだと出発の日をまたいでも変わらない
     （`CLAUDE.md` の「静的書き出し」／`content/chapters.ts`） */
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);
  const nowCh = today ? chapterNow(today) : NOW_CHAPTER;
  const nextCh = today ? chapterNext(today) : NEXT_CHAPTER;

  const main = useMemo(() => CHAPTERS.filter((c) => !c.branchOf), []);
  const branchOf = useMemo(() => {
    const m: Record<string, Chapter> = {};
    for (const c of CHAPTERS) if (c.branchOf) m[c.branchOf] = c;
    return m;
  }, []);

  /* 最初に出るのは**いまいる島**。あやとの「今の島が3Dモデル風に出てきて」。
     焼いた答えでまず描いて、画面が出たら今日の答えに差し替える。
     ただし**人が動かしたあとは差し替えない**（見ている島が勝手に変わる） */
  const [pick, setPick] = useState(NOW_CHAPTER.slug);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setPick(chapterNow(new Date()).slug);
  }, []);

  const cur = CHAPTERS.find((c) => c.slug === pick) ?? nowCh;
  const parent = cur.branchOf ? CHAPTERS.find((c) => c.slug === cur.branchOf) : undefined;
  const mainIdx = main.indexOf(parent ?? cur);
  const branch = parent ? undefined : branchOf[cur.slug];

  const go = useCallback((c?: Chapter) => {
    if (!c) return;
    touched.current = true;
    setPick(c.slug);
  }, []);

  const left = parent ? undefined : main[mainIdx - 1];
  const right = parent ? undefined : main[mainIdx + 1];

  const slotOf = (c: Chapter): Slot => {
    if (c.slug === cur.slug) return "at";
    if (parent) return c.slug === parent.slug ? "down" : "off";
    if (branch && c.slug === branch.slug) return "up";
    if (c === left) return "left";
    if (c === right) return "right";
    return "off";
  };

  /* 矢印キーでも動く。PC で模型を見ている人は、まず矢印キーを押す。
     文字を打っている最中は拾わない */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const to =
        e.key === "ArrowLeft" ? left : e.key === "ArrowRight" ? right : e.key === "ArrowUp" ? branch : e.key === "ArrowDown" ? parent : undefined;
      if (!to) return;
      e.preventDefault();
      go(to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [left, right, branch, parent, go]);

  const days = chapterDays(cur, today ?? undefined);
  const fund = useFund();
  /* **読めなかったことを、0円と同じ絵にしない。**
     `useFund` は読めないときも 0以下のときも null を返す。それを 0% として
     描くと、電波の弱いところで API に届かなかっただけの日に、
     「まだ1円も集まっていない島」が出る。出した人に対して嘘になる。
     額のほうは「読めなかったら出さない」になっているので、**絵もそろえる。** */
  const stage: BuildStage | undefined = !fund
    ? "unknown"
    : buildStage(Math.min(100, Math.round((fund.total / FUND_GOAL_YEN) * 100)));
  /* 舟が渡る高さ。**島ごとに水面の広さが違う**ので、いま出ている島の
     水面の見かけの高さを CSS に渡す（`.atl-boat` が使う） */
  const curArt = isles.find((x) => x.slug === cur.slug)?.art;
  const water = (() => {
    if (!curArt) return 40;
    const d = dio(curArt, days);
    // 模型は枠に合わせて寄せてあるので、寄せたぶんを掛けてから渡す
    return Math.round(d.Dh * fit(d.box) * 10) / 10;
  })();
  const { sail, boat, stageRef } = useSail(nowCh, water);
  /* 指ではらっても島が変わる。**矢印を狙わせない。**
     スマホで模型を見ている人は、まず横に払う */
  const swipe = useSwipe(
    () => go(left),
    () => go(right),
  );

  /* 次の島の予定が、どこまで決まっているか。**日どり（`opensAt`）も見立ての日数
     （`plannedDays`）も無い島は、行き先しか決まっていない。** そういう島に
     「0日の予定」「目標5万円」と出すと、決まっていないことを決まったことのように
     言うことになる（足代の5万円は、北欧へ行くために立てた目標）。
     建設中の区画も同じ理由で置かない。決まったら欄が埋まって、勝手に出る。 */
  const planned = !!nextCh && !!(nextCh.opensAt || nextCh.plannedDays);

  /* まだ始まっていない島は、日数を出さない。**「0日」は「0日いた」に読める。**
     日どりの決まっていない島は日数を持っていないし、予定の日数を持っている島でも、
     始まる前に「17日」とだけ出せば、もう行ってきた島に見える
     （次の島は上の枝で「17日の予定」と出る）。 */
  const begun = chapterSpan(cur, today ?? undefined).from != null;

  const st = CHAPTER_STATS[cur.slug];
  const isNow = cur.slug === nowCh.slug;

  return (
    <div className="atl">
      {/* 端の島は、片側にとなりが無い。**そのぶん空が空くので、寄せて釣り合わせる**
          （あやと「北欧の右側に矢印が無くて、右半分が空いています」） */}
      <div
        className={`atl-stage${!right && left ? " is-end-r" : ""}${!left && right ? " is-end-l" : ""}`}
        ref={stageRef}
        {...swipe}
      >
        {/* 空。雲は動かさない（島ぜんぶを覆う大きさの形なので、動かすと高い） */}
        <span className="atl-cloud is-a" aria-hidden />
        <span className="atl-cloud is-b" aria-hidden />
        <span className="atl-cloud is-c" aria-hidden />

        {isles.map((isle) => {
          const c = CHAPTERS.find((x) => x.slug === isle.slug);
          if (!c) return null;
          const slot = slotOf(c);
          const at = slot === "at";
          const d = chapterDays(c, today ?? undefined);
          return (
            <Link
              key={isle.slug}
              className={`atl-isle is-${slot}`}
              data-ch={isle.slug}
              href={chapterHref(c, nowCh)}
              prefetch={false}
              /* 模型そのものも押せる（**押す場所は物そのもの**）。ただし読み上げに
                 出すのは下の札1枚だけ。同じ行き先のリンクが2つ読み上がると、
                 島が2つあるように聞こえる */
              aria-hidden={true}
              tabIndex={-1}
              onClick={(e) => (at ? sail(e, c) : hop(e, () => go(c)))}
            >
              <span className="atl-bob">
                <Diorama
                  slug={isle.slug}
                  days={d}
                  art={isle.art}
                  /* **いまいる島だけ、渡る先はトップ。** あちらは10軒建って
                     いるので、章の島の作りで描くと模型が嘘をつく */
                  buildings={c.slug === nowCh.slug ? HOME_BUILDINGS : isle.buildings}
                  stage={c === nextCh && planned ? stage : undefined}
                />
              </span>
            </Link>
          );
        })}

        {/* 名前と「わたる」。**「押せる」の合図は厚み1種類だけ**
            （`docs/island-design.md` 3章）。模型に厚みは付けられないので札が持つ。
            島と一緒に動かさないのは、島ごとに絵の大きさが違うから。
            札まで動くと、島を変えるたびに名前の位置が跳ねる */}
        <Link
          className="atl-tag"
          href={chapterHref(cur, nowCh)}
          prefetch={false}
          onClick={(e) => sail(e, cur)}
        >
          <b>{cur.name}</b>
          <i>わたる</i>
        </Link>

        {boat}

        <Arm dir="up" to={branch} onGo={go} />
        <Arm dir="left" to={left} onGo={go} />
        <Arm dir="right" to={right} onGo={go} />
        <Arm dir="down" to={parent} onGo={go} />
      </div>

      {/* 航路。島の連なりぜんぶが、ここに1本で見える。押すとその島の模型が出る。
          **全部押せる並びなので、1つずつに厚みは付けない**
          （`docs/island-design.md` 3章の例外）。並び順は `CHAIN`
          （本線は日付順、枝は親のすぐ後ろ）をそのまま使う */}
      <nav className="atl-route" aria-label="島をえらぶ">
        {CHAIN.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={`atl-pin${c.branchOf ? " is-branch" : ""}${c.slug === cur.slug ? " is-at" : ""}`}
            /* **丸の直径が、島の半径そのもの。** 面積が日数に比例する
               （`docs/island-atlas.md` 3章）。模型のほうは枠いっぱいに寄せて
               あるので、島どうしの大きさを比べられるのはここだけ。
               下駄も上限も足さない——足したら比べる意味が無くなる */
            style={{ "--pin": `${(islandRadius(chapterDays(c, today ?? undefined)) * 0.25).toFixed(1)}px` } as React.CSSProperties}
            onClick={() => go(c)}
            aria-label={`${c.name}を見る`}
            aria-current={c.slug === cur.slug ? "true" : undefined}
          />
        ))}
      </nav>
      {/* 選んでいる島のこと。**押せないので、まっ平らにする** */}
      <div className="atl-card" data-ch={cur.slug}>
        <p className="atl-when">
          {isNow && <em className="atl-here">いまここ</em>}
          {when(cur, today)}
        </p>
        <h2 className="atl-name">{cur.name}</h2>
        <p className="atl-note">{cur.note}</p>
        {cur === nextCh ? (
          planned && (
            <>
              <p className="atl-nums">
                <span>
                  <b>{days}</b>日の予定
                </span>
              </p>
              <Fund total={fund?.total ?? null} />
            </>
          )
        ) : begun ? (
          <p className="atl-nums">
            {/* 日数を先頭に置く。**島の大きさを決めているのはこれ** */}
            <span>
              <b>{days.toLocaleString()}</b>日
            </span>
            {st && (
              <>
                <span>
                  <b>{st.streams}</b>本
                </span>
                <span>
                  <b>{st.people.toLocaleString()}</b>人
                </span>
                <span>
                  <b>{cur.countries.length}</b>カ国
                </span>
              </>
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** となりの島へ向ける矢印。**行き先が無い向きには出さない**（押せない矢印を置かない） */
function Arm({
  dir,
  to,
  onGo,
}: {
  dir: "left" | "right" | "up" | "down";
  to?: Chapter;
  onGo: (c: Chapter) => void;
}) {
  if (!to) return null;
  return (
    <button
      type="button"
      className={`atl-arm is-${dir}`}
      onClick={() => onGo(to)}
      aria-label={`${to.name}を見る`}
    >
      <Icon name={dir === "down" ? "chevron" : dir} size={22} />
    </button>
  );
}

/**
 * 集まった額と目標額（`docs/island-atlas.md` 7章）。
 * **姿だけでは、出した人が自分の1回の効きめを見られない。**
 * 読めなかったら金額をどこにも出さない。0円と出すのがいちばん悪い。
 */
function Fund({ total }: { total: number | null }) {
  const goal = `${(FUND_GOAL_YEN / 10_000).toLocaleString()}万円`;
  if (total === null) return <p className="atl-fund">目標 {goal}</p>;
  const man = total / 10_000;
  const got =
    man >= 1 ? `${man.toFixed(man >= 10 ? 0 : 1).replace(/\.0$/, "")}万円` : `${total.toLocaleString()}円`;
  return (
    <p className="atl-fund">
      <b>{got}</b> / {goal}
    </p>
  );
}

/** 別のタブで開こうとしている人の邪魔をしない */
function hop(e: React.MouseEvent, run: () => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  run();
}

/**
 * 期間の書き方。終わった章は「2024年10月 〜 2025年3月」、いまの章は「〜 いま」。
 *
 * **`from` `to` の字をそのまま読まない。** 旅に出た日に手で書き入れる欄なので、
 * 入れ忘れているあいだ北欧が「これから」のまま、コーカサスが「〜 いま」のままになる。
 */
function when(c: Chapter, today: Date | null): string {
  const { from, to } = chapterSpan(c, today ?? undefined);
  if (from == null) return "これから";
  return `${ym(from)} 〜 ${to == null ? "いま" : ym(to)}`;
}

/** 日本時間の「2024年10月」。書き出しは UTC で走るので、時差を足してから読む */
const ym = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
};

/* ---- 船と、指ではらう操作 --------------------------------------------------
   **押した瞬間に切り替えない**（`docs/island-atlas.md` 6章）。
   舟が手前から出て、模型に着いてから面が変わる。

   動きを減らす設定の人には `preventDefault` すらしない。**素の <a> のまま**に
   しておけば、JS が何をしようと必ず行ける。
   ---------------------------------------------------------------------- */

function useSail(nowCh: Chapter, water: number) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const [trip, setTrip] = useState(false);
  const [moved, setMoved] = useState(false);

  const sail = useCallback(
    (e: React.MouseEvent, c: Chapter) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (trip) return; // もう舟は出ている。2回目は素通し（急ぐ人を待たせない）
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      e.preventDefault();
      setTrip(true);
      // 次のフレームで行き先を書くと、そこまで transition が効く。
      // 同じフレームで書くと、ブラウザは差を見ないので瞬間移動になる
      requestAnimationFrame(() => requestAnimationFrame(() => setMoved(true)));
      window.setTimeout(() => router.push(chapterHref(c, nowCh)), SAIL_MS);
    },
    [router, trip, nowCh],
  );

  const boat = trip ? (
    <span
      className={`atl-boat${moved ? " is-there" : ""}`}
      style={{ "--atl-wy": String(water) } as React.CSSProperties}
      aria-hidden
    >
      <img src="/sprites/canoe.webp" alt="" width={40} height={28} />
    </span>
  ) : null;

  return { sail, boat, stageRef };
}

/**
 * 指ではらって島を変える。
 *
 * **縦に払ったときは拾わない。** あの人は面を送りたいだけなので、
 * そこで島が変わると「勝手に動いた」になる。
 */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      down.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const a = down.current;
      down.current = null;
      if (!a) return;
      const dx = e.clientX - a.x;
      if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(e.clientY - a.y) * 1.4) return;
      (dx < 0 ? onRight : onLeft)();
    },
  };
}
