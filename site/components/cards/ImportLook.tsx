"use client";

import { useEffect, useRef } from "react";
import Icon from "@/components/ui/IconCore";
import type { ImportItem } from "@/lib/cardImport";
import { cardWhen } from "./cards";
import ImportImg from "./ImportImg";

/**
 * 1枚を大きく見る。**左右で隣へ。** その場で外す／戻す。
 *
 * 一覧の 100px 角では、ブレや目つぶりは分からない。拡大は見比べのための
 * 道具なので、開いたまま次々に送れて、外すのもここでできるようにする
 * （閉じて、探して、押して、また開く、を繰り返させない）。
 */
export function ImportViewer({
  list,
  at,
  onMove,
  onClose,
  onToggle,
  groupSize,
  onCompare,
}: {
  /** 送る順（いま一覧に出ている順） */
  list: ImportItem[];
  at: number;
  onMove: (i: number) => void;
  onClose: () => void;
  onToggle: (it: ImportItem) => void;
  groupSize: (it: ImportItem) => number;
  onCompare: (it: ImportItem) => void;
}) {
  const it = list[at];
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const prev = at > 0 ? at - 1 : null;
  const next = at < list.length - 1 ? at + 1 : null;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && prev !== null) onMove(prev);
      else if (e.key === "ArrowRight" && next !== null) onMove(next);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, onMove, prev, next]);

  if (!it) return null;
  const out = it.status === "excluded";
  const n = groupSize(it);

  return (
    <div className="cim-modal" role="dialog" aria-modal="true" aria-label="写真を大きく見る">
      <button className="cim-back" aria-label="閉じる" onClick={onClose} tabIndex={-1} />
      <div className="cim-look">
        <div className="cim-look-head">
          <p>
            <b>{cardWhen(it.day)}</b>
            <span>
              {at + 1} / {list.length}
            </span>
          </p>
          <button ref={closeRef} className="cim-close" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div
          className={`cim-look-pic${out ? " is-out" : ""}`}
          onTouchStart={(e) => {
            const t = e.touches[0];
            touch.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const s = touch.current;
            touch.current = null;
            if (!s) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            /* 横に払ったときだけ送る。縦の払いは画面を送る指なので取らない */
            if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
            if (dx < 0 && next !== null) onMove(next);
            if (dx > 0 && prev !== null) onMove(prev);
          }}
        >
          <ImportImg key={it.sha} sha={it.sha} thumb={false} w={it.w} h={it.h} eager alt="" />
          {out && <span className="cim-stamp">外す</span>}
          {prev !== null && (
            <button className="cim-step is-prev" onClick={() => onMove(prev)} aria-label="前の写真">
              <Icon name="left" size={22} />
            </button>
          )}
          {next !== null && (
            <button className="cim-step is-next" onClick={() => onMove(next)} aria-label="次の写真">
              <Icon name="right" size={22} />
            </button>
          )}
          {/* 隣の2枚を先に取っておく。送った瞬間に白くしない */}
          <span className="cim-pre" aria-hidden>
            {prev !== null && <ImportImg sha={list[prev].sha} thumb={false} eager />}
            {next !== null && <ImportImg sha={list[next].sha} thumb={false} eager />}
          </span>
        </div>
        <div className="cim-look-foot">
          {n > 1 && (
            <button className="cim-btn is-sub" onClick={() => onCompare(it)}>
              似た写真をくらべる（{n}枚）
            </button>
          )}
          <button className={`cim-btn ${out ? "is-back" : "is-out"}`} onClick={() => onToggle(it)}>
            {out ? "登録にもどす" : "この写真を外す"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 似た写真の束を並べて見比べる。**そこから外せる。**
 *
 * 束（`group`）は機械が「似ている」と見たもの。どれを残すかは人が見て決める。
 * いちばん多い使い方は「この1枚だけ残す」なので、それを1回で押せるようにする。
 */
export function ImportCompare({
  items,
  onClose,
  onToggle,
  onOnly,
}: {
  items: ImportItem[];
  onClose: () => void;
  onToggle: (it: ImportItem) => void;
  /** この1枚だけ残して、ほかを外す */
  onOnly: (it: ImportItem) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const keep = items.filter((i) => i.status !== "excluded").length;
  return (
    <div className="cim-modal" role="dialog" aria-modal="true" aria-label="似た写真をくらべる">
      <button className="cim-back" aria-label="閉じる" onClick={onClose} tabIndex={-1} />
      <div className="cim-look is-cmp">
        <div className="cim-look-head">
          <p>
            <b>似た写真</b>
            <span>
              {items.length}枚のうち {keep}枚を登録
            </span>
          </p>
          <button ref={closeRef} className="cim-close" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="cim-cmp">
          {items.map((it) => {
            const out = it.status === "excluded";
            return (
              <div key={it.sha} className={`cim-cmp-one${out ? " is-out" : ""}`}>
                <button
                  className="cim-cmp-pic"
                  aria-pressed={out}
                  aria-label={out ? "外した写真。押すと登録にもどす" : "登録する写真。押すと外す"}
                  onClick={() => onToggle(it)}
                >
                  <ImportImg sha={it.sha} thumb w={it.tw ?? it.w} h={it.th ?? it.h} eager />
                  {out ? <span className="cim-stamp is-sm">外す</span> : <span className="cim-ok"><Icon name="check" size={16} /></span>}
                </button>
                {/* もうこれだけが残っているなら、押しどころは出さない（押しても何も起きない）。
                    背は同じだけ取って、並びをそろえる */}
                {keep === 1 && !out ? (
                  <span className="cim-only is-done">この1枚を登録</span>
                ) : (
                  <button className="cim-only" onClick={() => onOnly(it)}>
                    これだけ残す
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
