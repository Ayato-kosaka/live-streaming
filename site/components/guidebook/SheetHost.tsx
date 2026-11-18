"use client";

import { useEffect } from "react";

/**
 * **窓（`Sheet`）の開け閉めを、面に1つで持つ。** 窓の中身はサーバで焼いてあり、ここは振る舞いだけ。
 *
 * ## 決まり（#1228）
 *
 * | | |
 * | --- | --- |
 * | 開く | 窓を指す `#…` のリンクを押したとき。URL のハッシュが窓の id になる（`#do-rila`）。**そのまま貼れば直に開く** |
 * | 閉じる | 閉じるボタン・Esc・窓の外（背景）を押す・ブラウザの戻る |
 * | 閉じたあと | **元の位置に戻る**（開く前の高さと、押した札にフォーカス）。直に開いて来た人は、その札の所へ |
 * | 窓から窓へ | 窓の中の別の窓へのリンクは、**履歴を積まずに入れ替える**（戻る1回で面に戻れる） |
 *
 * 開くときに履歴を1つ積む（`pushState`）ので、スマホの「戻る」で窓だけが閉じる。
 * `hashchange` は起きない（`components/ui/HashJump.tsx` が窓へ面を送りに行かない）。
 *
 * ## 背景を押して閉じる
 *
 * 窓（`<dialog>`）そのものには余白を持たせず、中身は内側の箱（`.gb-dlg-in`）に入れてある。
 * だから**押した先が `<dialog>` 自身なら、それは背景**。
 */
export default function SheetHost() {
  useEffect(() => {
    const root = document.documentElement;
    let current: HTMLDialogElement | null = null;
    let opener: HTMLElement | null = null;
    let savedY = 0;
    let pushed = false;
    /** 直に開いて来た（開く前の位置を持っていない） */
    let direct = false;
    /** 閉じたあと、元の位置ではなくここへ送る（窓の中から面の錨へのリンク） */
    let goTo: HTMLElement | null = null;

    const sheetOf = (id: string) => {
      const el = id ? document.getElementById(id) : null;
      return el instanceof HTMLDialogElement && el.classList.contains("gb-dlg") ? el : null;
    };
    const hashId = () => {
      try {
        return decodeURIComponent(location.hash.slice(1));
      } catch {
        return "";
      }
    };
    const openerOf = (id: string) =>
      document.querySelector<HTMLElement>(`main a[href="#${CSS.escape(id)}"]:not(.gb-dlg a)`);

    function open(d: HTMLDialogElement, how: "push" | "replace" | "none", from?: HTMLElement | null) {
      if (current && current !== d) {
        /* 窓から窓へ。**開いた元（面の札）と高さは最初の1回のものを持ち越す** */
        const prev = current;
        current = null;
        prev.close();
      } else if (!current) {
        savedY = window.scrollY;
        opener = from ?? openerOf(d.id);
        direct = how === "none";
      }
      if (how === "push") {
        history.pushState({ gbSheet: d.id }, "", `#${d.id}`);
        pushed = true;
      } else if (how === "replace") {
        history.replaceState(history.state, "", `#${d.id}`);
      }
      current = d;
      root.classList.add("gb-lock");
      if (!d.open) d.showModal();
      d.querySelector<HTMLElement>(".gb-dlg-in")?.scrollTo(0, 0);
    }

    /** 閉じる。**履歴の始末は `closed` が1か所で持つ**（Esc は `<dialog>` が自分で閉じるので、どの道でも同じにする） */
    function close() {
      current?.close();
    }

    /** 自分で戻した1回ぶんの `popstate` を読み流す */
    let ignorePop = false;

    /** 窓が閉じた（閉じるボタン・Esc・背景・戻る。どの道で閉じても、ここを1回通る） */
    function closed(e: Event) {
      const d = e.target as HTMLDialogElement;
      if (current && current !== d) return; // 窓から窓へ入れ替えた、前の窓
      current = null;
      root.classList.remove("gb-lock");
      if (pushed) {
        /* 開くときに積んだ1つを戻す。戻ると、ブラウザは積む前の高さに面を戻す */
        pushed = false;
        ignorePop = true;
        history.back();
      } else if (location.hash === `#${d.id}`) {
        history.replaceState(history.state, "", location.pathname + location.search);
      }
      if (goTo) {
        goTo.scrollIntoView({ block: "start" });
        goTo = null;
      } else if (direct && opener) {
        opener.scrollIntoView({ block: "center" });
      } else {
        window.scrollTo(0, savedY);
      }
      opener?.focus({ preventScroll: true });
      direct = false;
    }

    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      /* 背景（窓そのもの）か、閉じるボタン */
      if (current && t === current) {
        e.preventDefault();
        return close();
      }
      if (t.closest("[data-gb-close]")) {
        e.preventDefault();
        return close();
      }
      const a = t.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
      const d = sheetOf(id);
      if (d) {
        e.preventDefault();
        return open(d, current ? "replace" : "push", a);
      }
      /* 窓の中から、面の錨（`#budget` など）へ。窓を閉じてからそこへ送る */
      const target = id ? document.getElementById(id) : null;
      if (current && target && current.contains(a)) {
        e.preventDefault();
        goTo = target;
        pushed = false;
        history.replaceState(history.state, "", `#${id}`);
        current.close();
      }
    }

    function onPop() {
      if (ignorePop) {
        ignorePop = false;
        return;
      }
      const d = sheetOf(hashId());
      if (d) {
        if (d !== current) open(d, "none");
        return;
      }
      if (current) {
        /* 戻るで来た。履歴はもう戻っている */
        pushed = false;
        current.close();
      }
    }

    const dialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog.gb-dlg")];
    for (const d of dialogs) {
      d.addEventListener("close", closed);
    }
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    root.classList.add("gb-js");

    /* 直に開いて来た（`/travel/bulgaria/sofia#do-rila` を貼られた） */
    const first = sheetOf(hashId());
    if (first) open(first, "none");

    return () => {
      for (const d of dialogs) {
        d.removeEventListener("close", closed);
      }
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  return null;
}
