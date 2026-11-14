"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import ReadAgain, { ReadAgainPanel, WaitingPanel } from "@/components/me/ReadAgain";
import Icon from "@/components/ui/IconCore";
import { useAuth } from "@/lib/auth";
import type { ImportItem } from "@/lib/cardImport";
import { cardWhen } from "./cards";
import ImportCalib from "./ImportCalib";
import ImportImg from "./ImportImg";
import { ImportCompare, ImportViewer } from "./ImportLook";
import ImportRegister from "./ImportRegister";
import { KEEP, SHOWN, byDay, useImport } from "./importState";

type Filter = "all" | "out" | "in";

/**
 * 写真の取り込み（`/cards/import`）。**あやとだけ。**
 *
 * Google フォトから機械が選んだ数百枚を見て、**要らないものだけ外し**、
 * 残りを一括で「あやと島カード」に登録する（`docs/card-import.md`）。
 *
 * ## 最初は全部「登録予定」。押すと「外す」
 *
 * 機械は迷ったら候補に残す（4章の終わり）。だから人の仕事は**引き算**で、
 * 1枚押せば外れ、もう一度押せば戻る。押した瞬間に見た目を変え、
 * 送るのは裏でまとめて（`importState.ts`）。
 *
 * ## 少ない手数で、まとめて外す
 *
 * - 日の見出しの「この日を全部外す」
 * - 「まとめて選ぶ」→「はんい」で、押した2枚のあいだを全部
 * - 似た写真の束は並べて比べ、「これだけ残す」で残りを1回で外す
 *
 * ## 並びのマスに厚みを付けない
 *
 * マスは全部押せる（`docs/island-design.md` 3章の3の例外）。
 * 拡大と「似た写真」は、マスの角に乗せた別の押しどころ。
 */
export default function ImportDesk() {
  const { owner, meRead, reloadMe } = useAuth();
  if (owner === "unknown")
    return meRead === "down" ? <ReadAgainPanel what="島の手入れ" onRetry={reloadMe} /> : <WaitingPanel />;
  /* あやと以外には、何も出さない。口も叩かない */
  if (owner !== "yes") return null;
  return <Desk />;
}

function Desk() {
  const { list, items, read, reload, decide, answer, mark, flush, sync } = useImport();
  const [filter, setFilter] = useState<Filter>("all");
  /** 拡大している1枚（いまの並びの中の位置） */
  const [look, setLook] = useState<number | null>(null);
  /** 比べている束 */
  const [cmp, setCmp] = useState<string | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  /** まとめて選んでいる最中 */
  const [picking, setPicking] = useState(false);
  const [range, setRange] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  /** 「はんい」の始まり */
  const [from, setFrom] = useState<string | null>(null);

  const shown = useMemo(() => items.filter((i) => SHOWN.has(i.status)), [items]);
  const calib = useMemo(() => items.filter((i) => i.status === "calib"), [items]);
  const calibLeft = calib.filter((i) => !i.calibAnswer).length;
  const nOut = shown.filter((i) => i.status === "excluded").length;
  const nKeep = shown.filter((i) => KEEP.has(i.status)).length;
  const nDone = items.filter((i) => i.status === "registered").length;

  const visible = useMemo(
    () =>
      shown.filter((i) =>
        filter === "all" ? true : filter === "out" ? i.status === "excluded" : i.status !== "excluded",
      ),
    [shown, filter],
  );
  const days = useMemo(() => byDay(visible), [visible]);
  /** 送る順。拡大の左右と「はんい」はこの順 */
  const order = useMemo(() => days.flatMap((d) => d.items), [days]);
  const at = useMemo(() => new Map(order.map((i, n) => [i.sha, n])), [order]);
  const groups = useMemo(() => {
    const g = new Map<string, ImportItem[]>();
    for (const i of shown) {
      if (!i.group) continue;
      const l = g.get(i.group) ?? [];
      l.push(i);
      g.set(i.group, l);
    }
    return g;
  }, [shown]);
  const groupSize = useCallback((i: ImportItem) => (i.group ? groups.get(i.group)?.length ?? 1 : 1), [groups]);

  const toggle = useCallback((i: ImportItem) => decide([i.sha], i.status !== "excluded"), [decide]);

  const endPick = () => {
    setPicking(false);
    setPicked(new Set());
    setFrom(null);
  };

  const tap = (i: ImportItem) => {
    if (!picking) return toggle(i);
    if (range && from && from !== i.sha) {
      const a = at.get(from) ?? 0;
      const b = at.get(i.sha) ?? 0;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setPicked((p) => {
        const n = new Set(p);
        for (let k = lo; k <= hi; k++) n.add(order[k].sha);
        return n;
      });
      setFrom(null);
      return;
    }
    if (range) setFrom(i.sha);
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(i.sha) && !range) n.delete(i.sha);
      else n.add(i.sha);
      return n;
    });
  };

  if (read === "wait" && !list) return <WaitingPanel />;
  if (read === "down" && !list) return <ReadAgainPanel what="取り込んだ写真" onRetry={reload} />;
  if (!list) return null;

  /* 認識合わせが残っていれば、そちらを先に */
  if (calibLeft > 0) return <ImportCalib items={calib} onAnswer={answer} />;

  if (!shown.length)
    return (
      <section className="panel paper">
        <div className="blank">
          <b>{nDone > 0 ? `${nDone.toLocaleString()}枚を登録しました` : "いま選ぶ写真はありません"}</b>
          <Link prefetch={false} className="blank-go" href="/cards">
            あやと島カードを見る
            <Icon name="right" size={15} />
          </Link>
        </div>
      </section>
    );

  const pickedList = shown.filter((i) => picked.has(i.sha));
  const pickedOut = pickedList.filter((i) => i.status === "excluded").length;

  return (
    <>
      {/* 上に常に。数そのものが絞り込みの札 */}
      <div className="cim-bar">
        <div className="cim-counts" role="group" aria-label="どれを見ますか">
          <button className={`cim-count${filter === "all" ? " is-on" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            <span>候補</span>
            <b>{shown.length.toLocaleString()}</b>
          </button>
          <button className={`cim-count is-out${filter === "out" ? " is-on" : ""}`} aria-pressed={filter === "out"} onClick={() => setFilter("out")}>
            <span>外す</span>
            <b>{nOut.toLocaleString()}</b>
          </button>
          <button className={`cim-count is-in${filter === "in" ? " is-on" : ""}`} aria-pressed={filter === "in"} onClick={() => setFilter("in")}>
            <span>登録予定</span>
            <b>{nKeep.toLocaleString()}</b>
          </button>
        </div>
        <div className="cim-tools">
          {picking ? (
            <>
              <button className={`cim-chip${range ? "" : " is-on"}`} aria-pressed={!range} onClick={() => { setRange(false); setFrom(null); }}>
                1枚ずつ
              </button>
              <button className={`cim-chip${range ? " is-on" : ""}`} aria-pressed={range} onClick={() => setRange(true)}>
                はんい
              </button>
            </>
          ) : (
            <button className="cim-chip" onClick={() => setPicking(true)}>
              まとめて選ぶ
            </button>
          )}
          {sync === "down" && (
            <span className="cim-sync" role="status">
              外したのを送れていません
              <button className="cim-link" onClick={() => void flush()}>
                もう一度
              </button>
            </span>
          )}
          {!picking && (
            <button className="cim-chip is-go" onClick={() => setRegOpen(true)} disabled={nKeep === 0}>
              登録へ
              <Icon name="right" size={14} />
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 && (
        <div className="blank">
          <b>{filter === "out" ? "外した写真はありません" : "登録予定の写真はありません"}</b>
          <button className="blank-go" onClick={() => setFilter("all")}>
            候補をぜんぶ見る
          </button>
        </div>
      )}

      {days.map((d) => {
        const out = d.items.filter((i) => i.status === "excluded").length;
        const allOut = out === d.items.length;
        return (
          <section key={d.day} className="panel paper cim-day">
            <h2>{cardWhen(d.day)}</h2>
            <div className="cim-day-head">
              <p className="cim-day-n">
                {d.items.length}枚{out > 0 && <span>（外す {out}）</span>}
              </p>
              {!picking && (
                <button
                  className="cim-chip is-day"
                  onClick={() => decide(d.items.map((i) => i.sha), !allOut)}
                >
                  {allOut ? "この日を全部もどす" : "この日を全部外す"}
                </button>
              )}
            </div>
            <div className="cim-grid">
              {d.items.map((i) => {
                const isOut = i.status === "excluded";
                const isPick = picked.has(i.sha);
                const n = groupSize(i);
                return (
                  <div
                    key={i.sha}
                    className={`cim-tile${isOut ? " is-out" : ""}${picking ? " is-picking" : ""}${isPick ? " is-picked" : ""}${from === i.sha ? " is-from" : ""}${i.status === "failed" ? " is-fail" : ""}`}
                  >
                    <button
                      className="cim-tile-main"
                      aria-pressed={picking ? isPick : isOut}
                      aria-label={
                        picking
                          ? `${cardWhen(i.day)}の写真。${isPick ? "選んでいる" : "選ぶ"}`
                          : `${cardWhen(i.day)}の写真。${isOut ? "外す。押すと登録にもどす" : "登録予定。押すと外す"}`
                      }
                      onClick={() => tap(i)}
                    >
                      <ImportImg sha={i.sha} thumb w={i.tw ?? i.w} h={i.th ?? i.h} />
                      {isOut && <span className="cim-stamp is-sm">外す</span>}
                      {i.status === "failed" && <span className="cim-fail">失敗</span>}
                      {picking && <span className="cim-box" aria-hidden>{isPick && <Icon name="check" size={16} />}</span>}
                    </button>
                    {!picking && (
                      <button className="cim-zoom" aria-label="大きく見る" onClick={() => setLook(at.get(i.sha) ?? 0)}>
                        <Icon name="search" size={15} />
                      </button>
                    )}
                    {!picking && n > 1 && (
                      <button className="cim-group" aria-label={`似た写真 ${n}枚をくらべる`} onClick={() => setCmp(i.group!)}>
                        似た{n}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* 最後のボタン。**残りの数を言ってから押させる** */}
      {!picking && (
        <div className="cim-end">
          <button className="cim-btn is-go is-big" onClick={() => setRegOpen(true)} disabled={nKeep === 0}>
            残り {nKeep.toLocaleString()}枚をあやと島カードに登録
          </button>
          {nDone > 0 && (
            <p className="cim-done">
              登録ずみ {nDone.toLocaleString()}枚
              <Link prefetch={false} className="cim-link" href="/cards">
                あやと島カードを見る
              </Link>
            </p>
          )}
        </div>
      )}

      {read === "down" && <ReadAgain what="取り込んだ写真" onRetry={reload} quiet />}

      {/* まとめて選んでいるあいだの帯。**選んだものに何をするか**だけ */}
      {picking && (
        <div className="cim-pickbar" role="region" aria-label="選んだ写真">
          <p>
            {range && from ? "終わりの1枚を押す" : <><b>{picked.size}</b>枚を選んでいます</>}
          </p>
          <div className="cim-pickbar-row">
            <button className="cim-btn is-sub" onClick={endPick}>
              やめる
            </button>
            {pickedOut > 0 && (
              <button
                className="cim-btn is-back"
                onClick={() => {
                  decide(pickedList.filter((i) => i.status === "excluded").map((i) => i.sha), false);
                  endPick();
                }}
              >
                {pickedOut}枚をもどす
              </button>
            )}
            <button
              className="cim-btn is-out"
              disabled={pickedList.length - pickedOut === 0}
              onClick={() => {
                decide(pickedList.filter((i) => i.status !== "excluded").map((i) => i.sha), true);
                endPick();
              }}
            >
              {pickedList.length - pickedOut}枚を外す
            </button>
          </div>
        </div>
      )}

      {look !== null && order[look] && (
        <ImportViewer
          list={order}
          at={look}
          onMove={setLook}
          onClose={() => setLook(null)}
          onToggle={toggle}
          groupSize={groupSize}
          onCompare={(i) => {
            setLook(null);
            setCmp(i.group ?? null);
          }}
        />
      )}

      {cmp && groups.get(cmp) && (
        <ImportCompare
          items={groups.get(cmp)!}
          onClose={() => setCmp(null)}
          onToggle={toggle}
          onOnly={(keep) =>
            {
              const g = groups.get(cmp) ?? [];
              decide(g.filter((x) => x.sha !== keep.sha && x.status !== "excluded").map((x) => x.sha), true);
              if (keep.status === "excluded") decide([keep.sha], false);
            }
          }
        />
      )}

      {regOpen && list.batch && (
        <ImportRegister
          batch={list.batch}
          keep={nKeep}
          items={items}
          flush={flush}
          mark={mark}
          reload={reload}
          onClose={() => setRegOpen(false)}
        />
      )}
    </>
  );
}
