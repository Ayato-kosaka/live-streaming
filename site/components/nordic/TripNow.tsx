"use client";

import { useEffect, useState } from "react";
import { loadState } from "@/lib/liveStats";
import { setHereSeq } from "./here";
import { placeOutdated, samePlace } from "@/lib/place";
import { planOver, planStop, tripDate } from "./where";
import { Mark } from "./Marks";

/**
 * 旅の司令塔。
 *
 * この企画の芯は「ヒッチハイクで北欧を回る」ではなく、
 * **会いたい人がいるので、スウェーデンまで陸路で会いに行く**こと。
 * 行為ではなく目的なので、「着いたかどうか」という節目があるし、
 * 親指でつなぐ距離（`HITCH_KM`）が、そのまま「会えるまでの遠さ」になる。
 *
 * **着いたら終わり、ではない。** ストックホルムに着くのが9月20日で、
 * そこから7泊して27日に発つまでが北欧旅（あやと 2026-09-06）。
 * だから島から届く日も2つある（`arrivedOn` と `endedOn`）。
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
 * 2つ並べていたころ、出発前の画面には減らないバーが
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
  /**
   * ここを発つ日／ここへ着く日(YYYY-MM-DD)。**旅程表と同じ日付。**
   *
   * いる場所の一次情報がこれ。手打ちの `current.place` は上書きに降りた
   * （`components/nordic/where.ts` に理由）。
   */
  leaveOn?: string;
  arriveOn?: string;
};

function fmt(n: number) {
  return String(n).padStart(2, "0");
}

/** 「2026-09-19」→「9月19日」。書き出しは UTC で走るので、月日は文字列から取る。 */
function when(iso: string) {
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;
}

export default function TripNow({
  stops,
  mainLegs,
  legOrder,
  dayOf,
  dayByDate,
  depart,
  departWhen,
  hitchKm,
  arriveOn,
  until,
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
  /**
   * 区間の id → 旅程表のどの行か（`day-1` `day-after` など）。
   * 何日目か分かっていない行もあるので、数字ではなく行の名前で受け取る。
   */
  dayOf: Record<string, string>;
  /**
   * 日付(YYYY-MM-DD) → 旅程表のどの行か。
   *
   * **動かない日には区間が無い。** `dayOf` は区間から引く表なので、休息日
   * （ヴィリニュス 9/15・リガ 9/17）を引くと**翌日の行**が返る。
   * 日付しか分かっていない日は、日付で引く。
   */
  dayByDate: Record<string, string>;
  /** 出発の日時（ISO） */
  depart: string;
  /** 画面に出す出発の日時 */
  departWhen: string;
  hitchKm: number;
  /** ストックホルムに着くよていの日(YYYY-MM-DD) */
  arriveOn: string;
  /** 旅が終わる日(YYYY-MM-DD)。ここを過ぎたら、旅程からは何も引かない */
  until: string;
}) {
  const [left, setLeft] = useState<number | null>(null);
  /**
   * 旅をしている土地の暦で、きょうの日付。
   *
   * 静的書き出しなので、ビルドの日を焼くわけにいかない（`docs/island-design.md`）。
   * カウントダウンと同じ拍で数え直す。日付は日に1度しか変わらない。
   */
  const [today, setToday] = useState<string | null>(null);
  /**
   * 本人が打った「いまいる場所」。**旅より前のまま**なら受け取らない。
   *
   * 「ジョージア・トビリシ / 2026-09-04」は出発の1週間前に打たれた字で、
   * 旅の17日間そのまま残る（`lib/stay.ts` の `placeOutdated`）。
   */
  const [place, setPlace] = useState<string | null>(null);
  /**
   * ストックホルムに着いた日。**着いた、であって、終わった、ではない。**
   *
   * ここが無かったあいだ、着いたことを言えるのは `current.place` に
   * ストックホルムが入っているあいだだけだった。そこを離れた瞬間に
   * 「ストックホルムまで（数えています）」に戻る（`docs/nordic-depart.md`）。
   */
  const [arrivedOn, setArrivedOn] = useState<string | null>(null);
  /**
   * 旅が終わった日。**ストックホルムを発った日。**
   *
   * あやとの言葉（2026-09-06）「ストックホルム出るまでが北欧旅です」。
   * 着いてから7泊あるので、着いた日で終わりにすると、いちばん長い滞在が
   * まるごと「もう終わったこと」になる。
   */
  const [endedOn, setEndedOn] = useState<string | null>(null);

  useEffect(() => {
    const t = new Date(depart).getTime();
    const tick = () => {
      setLeft(t - Date.now());
      // 日付は日に1度しか変わらない。同じ字なら state を触らない
      setToday((d) => {
        const n = tripDate(new Date());
        return d === n ? d : n;
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [depart]);

  useEffect(() => {
    let alive = true;
    // 島の様子は面のどこか（`components/island/Theme.tsx`）でもう読んでいる。
    // 約束を配ってもらって、同じ面から2回聞きにいかない
    loadState()
      .then((s) => {
        if (!alive) return;
        const p = (s?.current?.place ?? "").trim();
        /* **古い字は「いま」ではない。** ここを素通しにしていたので、旅の17日間
           ずっと「いま ジョージア・トビリシ」と出ていた（`where.ts` に経緯）。
           日付が読めないものも古いものとして扱う（`lib/stay.ts`）。 */
        setPlace(p && !placeOutdated(s?.current?.updatedAt) ? p : null);
        setArrivedOn(s?.nordic?.arrivedOn ?? null);
        setEndedOn(s?.nordic?.endedOn ?? null);
      })
      .catch(() => {
        /* 島の様子が取れなくても、カウントダウンだけは出す */
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 暦で見て、旅がもう終わっている日か（`where.ts` の `planOver`）。
   *
   * **押されなかったときに、旅を閉じるのはここ。** 下の2つ（着いた日・終わった日）は
   * あやとが旅の終わりに島で押す事実で、押されればそちらが勝つ。押されなかった日も
   * 暦で同じ答えになるようにしてある——**押したときと1文字も変わらない。**
   * 閉じていなかったので、旅の1ヶ月後も「ストックホルムまで 数えています」
   * 「いま 移動中 → めざす ストックホルム」と出ていた
   * （`lib/stay.ts` が滞在で決めたのと同じ原則。データではなくコードで閉じる）。
   */
  const over = planOver(today, until);
  /** 着いた日。**事実が先、無ければ旅程。** 旅が終わっているなら、着いてはいる */
  const arrivedDay = arrivedOn ?? (over ? arriveOn : null);
  /** 旅が終わった日（ストックホルムを発った日）。事実が先、無ければ旅程 */
  const endedDay = endedOn ?? (over ? until : null);

  /**
   * 本人の字が指しているルートの街。無ければ -1。
   *
   * 「リガ」でも「ラトビア・リガ」でも当たるように、含んでいるかで見る。
   * **1字ずれても当たるようにする**（`lib/place.ts`）。走っている車の中で
   * 打つので「ヴィリニュス」が「ビリニュス」になるのはふつうに起きる。
   */
  const typedAt = place ? stops.findIndex((st) => st.id && samePlace(place, st.name)) : -1;
  /** 旅程の日付から引いた、きょうの居どころ。**予定であって「いま」ではない。** */
  const planAt = planStop(stops, today, until);
  const at = typedAt >= 0 ? typedAt : planAt;
  /**
   * 居どころを、**旅程の予定ではなく事実で押さえられている**か。
   *
   * 旅程の日付から引いただけのときは false。ヒッチハイクは乗せてもらえなければ
   * その日は進まないので、予定の街を「いま ここ」と言い切ってはいけない。
   * 地図の札・旅程表の印・残り距離の一行が、ここで言い方を変える。
   */
  const sure = typedAt >= 0 || !!arrivedDay;
  const last = stops.length - 1;
  /**
   * 旅程表のどの行に「いま、ここ」を出すか。
   *
   * **分かっているものに合わせて、引く表を変える。**
   * 居どころが分かっていれば、そこを発つ区間の行（＝いま走っている区間）。
   * 日付しか分かっていなければ、その日付の行。区間から引くと、**動かない日が
   * 翌日の行を指す**（9/15 に休むヴィリニュスを発つのは 9/16）。
   */
  const nowRow = sure
    ? at != null && at >= 1 && at < last
      ? (dayOf[mainLegs[at]] ?? null)
      : null
    : (today && dayByDate[today]) || null;

  // 分かった現在地を、同じ画面の地図にも反映する。
  useEffect(() => {
    if (at == null) return;
    const id = stops[at]?.id;
    const svg = document.querySelector<SVGSVGElement>(".nmap");
    if (!svg || !id) return;
    svg.dataset.here = id;
    // 札の字が「いま ここ」と「きょうは ここ」で入れ替わる（`app/css/nordic.css`）
    if (sure) delete svg.dataset.plan;
    else svg.dataset.plan = "1";
    const seq = Number(svg.querySelector(`[data-id="${id}"]`)?.getAttribute("data-seq") ?? -1);
    svg.querySelectorAll<SVGElement>("[data-seq]").forEach((el) => {
      el.classList.toggle("is-done", Number(el.getAttribute("data-seq")) <= seq);
    });
    // 「いま ここ」の札はどの街にもぶら下げてある。出すのは1つだけ。
    // 札は街より上のレイヤ（`.nm-heres`）にいるので、そちらにも付ける。
    svg.querySelectorAll<SVGElement>(".nmap-pin, .nm-here").forEach((el) => {
      el.classList.toggle("is-now", el.getAttribute("data-id") === id);
    });
  }, [at, stops, sure]);

  // 旅程表の「いま、ここ」を、今日の1日にだけ出す。
  //
  // 静的書き出しなので、書き出した時点では誰も走っていない。
  // 場所が分かってから、その日の行に印を付ける（`docs/island-design.md` 3章
  // 「動きは React の外で」。ここで状態を持つと旅程表がまるごと作り直しになる）。
  useEffect(() => {
    if (at == null || at < 1) return;
    /* `.nday` は旅程表の行、`.ndayc` はまとめた行の中の番号の札。
       **ストックホルムの7泊は1行にまとまっていて、あの行に id が無い。**
       札のほうにしか日ごとの id が無いので、両方に付ける。
       付けないと、9/21〜9/26 の6日は旅程表のどこにも「きょう」が出ない。 */
    document.querySelectorAll<HTMLElement>(".nday, .ndayc").forEach((el) => {
      const on = !!nowRow && el.id === nowRow;
      el.toggleAttribute("data-now", on);
      // 旅程から引いただけの日は「きょう」。本人の字があるときだけ「いま、ここ」
      el.toggleAttribute("data-plan", on && !sure);
    });
  }, [at, nowRow, sure]);

  // いま走っているのが何本目かを、下の面にも配る。
  // 越えた日の「まだ決めていないこと」は、そこで閉じる（`here.ts`）。
  useEffect(() => {
    if (at == null || at < 1) return;
    const i = legOrder.indexOf(mainLegs[at]);
    setHereSeq(i >= 0 ? i : null);
  }, [at, mainLegs, legOrder]);

  const departed = left != null && left <= 0;
  /* 着いたあとは、いる場所がどこであっても終点にいるものとして数える。
     友だちの家に約1週間いるので、そのあいだに街を離れることもある。
     そこで「ストックホルムまで、数えています」に戻ったら、旅が
     終わっていないことになってしまう。 */
  const idx = arrivedDay ? last : (at ?? (departed ? null : 0));
  /**
   * 着いた。**島から届いた事実か、本人の字で終点にいるときだけ。**
   *
   * 旅程の日付だけで「着いた」と言わない。9月20日になったからといって
   * 着いているとは限らないし、着いたことは本人が島に一度押せば届く。
   */
  const arrived = idx === last && sure;
  /** 旅程では、もう終点にいる日。**着いたとは言えない。** */
  const goalByPlan = idx === last && !sure;

  // 残りの距離。まだ通っていない区間の、親指で進むぶんを足す。
  const leftKm = stops.slice((idx ?? 0) + 1).reduce((a, b) => a + (b.hitch ?? 0), 0);
  /**
   * 親指で進むぶんが、もう残っていない。**「ストックホルムまで 0km」と言わない。**
   *
   * タリンから先は船が2本（`content/nordic.ts` の ROUTE）。数えているのは
   * ヒッチハイクの距離なので、タリンに立った時点で 0 になる。まだ2日あるのに
   * 「あと0km」と出ていた（本人が「タリン」と打った日に出る、前からの姿）。
   */
  const ferryLeft = !arrived && !goalByPlan && idx != null && idx < last && leftKm === 0;

  const now = idx != null ? stops[idx] : null;
  const next = idx != null && idx < last ? stops[idx + 1] : null;
  const d = left != null && left > 0 ? Math.floor(left / 1000) : 0;

  /**
   * 本人が、いま出している街とは別の街を打っている。**その字をそのまま出す。**
   *
   * 旅程から外れるのはヒッチハイクではふつうに起きる（足止め・寄り道）。
   * 打ってあるのに旅程の街で上書きしたら、また画面が嘘をつく。
   */
  const off = !arrivedDay && !!place && !(now && samePlace(place, now.name));
  /**
   * 出しているのが、**旅程から引いただけの街**か。
   *
   * そのときだけ「きょうは」。本人の字も島からの事実もあれば「いま」、
   * どちらも無く旅程からも引けなければ、今までどおり「いま 移動中」。
   */
  const fromPlan = !place && !arrivedDay && at != null;
  /** 「いま」に出す字 */
  const nowName = arrivedDay
    ? (place ?? stops[last].name)
    : off
      ? place!
      : (now?.name ?? "移動中");
  /* 国の名前は、出している街と食い違ったら出さない。**着いたあとも街は動く。**
     旅が終わってティラナにいる日に、`stops[last].country` をそのまま出していて
     「いま アルバニア・ティラナ / スウェーデン」と書いてあった。
     ルートの外の街も同じで、打った字にはたいてい国が入っている。 */
  const nowCountry =
    off || (arrivedDay && place && !samePlace(place, stops[last].name))
      ? ""
      : (now?.country ?? "");

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
          ポーランドからそこまで、人の車だけで {hitchKm.toLocaleString()}km。
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
        ) : idx == null ? (
          /* 出たのに、いる場所がまだ読めていない。
             **ここで残りの距離を出さない。** 出発前と1文字も変わらない数字を、
             減っていないバーと一緒に出すことになる（旅の9日目でも「あと 1,377km」）。
             足代と同じ決まりで、読めなかった数字はどこにも出さない
             （`components/nordic/fund.ts`）。 */
          <div className="tnow-count is-far">
            <span className="tnow-count-l">ストックホルムまで</span>
            <span className="tnow-count-n is-wait">数えています</span>
            <span className="tnow-count-w">
              ぜんぶで {hitchKm.toLocaleString()}km
            </span>
          </div>
        ) : (
          <div className="tnow-count is-far">
            <span className="tnow-count-l">
              {endedDay
                ? "旅がおわった"
                : arrived
                  ? "着いた"
                  : goalByPlan
                    ? "きょうのよてい"
                    : ferryLeft
                      ? "あとは船で"
                      : "ストックホルムまで"}
            </span>
            <span className="tnow-count-n">
              {arrived || goalByPlan || ferryLeft ? (
                <b>{stops[last].name}</b>
              ) : (
                <em>
                  <b>{leftKm.toLocaleString()}</b>km
                </em>
              )}
            </span>
            <span className="tnow-count-w">
              {endedDay
                ? /* 発った日。**ここでやっと旅が終わる。** */
                  `${when(endedDay)}、ストックホルムを発ちました。ここまでが北欧旅`
                : arrived
                  ? /* 着いた日が届いていれば、それも出す。「着いた」だけだと、
                       いつ着いたのかが旅のあとに読む人に分からない。
                       **旅はまだ終わっていない**ので、発つ日も添える。
                       会えたかどうかは書かない（`docs/nordic-fund.md` 1章）。 */
                    `${arrivedDay ? `${when(arrivedDay)}、` : ""}飛行機のあとは、ぜんぶ人の車と船で来た。ここから7泊して、${when(until)}に発ちます`
                  : goalByPlan
                    ? /* 旅程ではもう着いている日。**着いたとは言わない。**
                         着いたことは本人が島に押せば届く（`arrivedOn`）。 */
                      `${when(arriveOn)}に着いて、${when(until)}に発つよてい。ここから7泊`
                    : ferryLeft
                      ? sure
                        ? `親指で進むぶんは、ここまで。ぜんぶで ${hitchKm.toLocaleString()}km`
                        : `よていでは、ここから先は船。ぜんぶで ${hitchKm.toLocaleString()}km`
                      : sure
                        ? `会いたい人がいる街まで、親指で進むぶん。ぜんぶで ${hitchKm.toLocaleString()}km`
                        : /* 旅程から引いた距離。**進んだ距離ではない。**
                             乗せてもらえなければその日は進まないので、言い切らない。 */
                          `よていどおりなら、会いたい人がいる街まで。ぜんぶで ${hitchKm.toLocaleString()}km`}
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
        <div className={`tnow-at${fromPlan ? " is-plan" : ""}`}>
          {/* **「いま」と「きょうは」を、同じ強さで言わない。**
              本人が打った字か、島から届いた事実（着いた日）で押さえられている
              ときだけ「いま」。旅程の日付から引いただけの日は「きょうは」。
              ヒッチハイクなので、乗せてもらえなければその日は進まない。 */}
          <i>{fromPlan ? "きょうは" : "いま"}</i>
          {/* 着いたあとも、いる街は動く（友だちの家に約1週間）。
              **そこは島が言っているほうを出す。** 終点に着いたことは
              上の大きい字がもう言っているので、ここまで
              「いま ストックホルム → ここまで ストックホルム」と
              同じ名前を2回並べても、分かることが1つも増えない。 */}
          <b>{nowName}</b>
          <em>{nowCountry}</em>
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
          {/* 「ここまで」は**着いた日の字**。いる場所が読めていないだけの日に出すと、
              すぐ左に「移動中」と書いてあるのに、右で旅が終わったことになる
              （実測：旅の4日目に「いま 移動中 → ここまで ストックホルム」）。
              分かっていないときは、めざす先だけを言う。 */}
          <i>{next ? "つぎ" : arrived || goalByPlan ? "ここまで" : "めざす"}</i>
          <b>{next ? next.name : stops[last].name}</b>
          <em>{next ? next.how : "会いたい人がいる街。友だちの家に7泊"}</em>
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
        <a className="tnow-act is-main" href={nowRow ? `#${nowRow}` : "#plan"}>
          {nowRow ? "今日のところへ" : "旅のよていを見る"}
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
