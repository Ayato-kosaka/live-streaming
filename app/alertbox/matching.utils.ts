// 依存なし（RN/Expo標準で動きます）

import type { AlertViewer, AlertboxCharacter } from "./types";

/** ゼロ幅系や制御文字など、目に見えない文字を除去 */
const INVISIBLE_CHARS_RE =
    /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C]/g; // ZWSP, ZWJ, FEFF, WJ, 他

/** 絵文字・絵文字修飾（拡張絵文字含む）を大まかに除去（候補生成用） */
const EMOJI_RE = /\p{Extended_Pictographic}(\uFE0F|\uFE0E)?/gu;

/** 異体字セレクタだけ落とす */
const VARIATION_SELECTOR_RE = /[\uFE0E\uFE0F]/g;

/** 連続ホワイトスペースを単一スペースへ（\s には改行/タブ含む） */
const COLLAPSE_WS_RE = /\s+/g;

/** 幅と大小を吸収する正規化（NFKC）＋前後空白除去＋ゼロ幅/異体字除去＋空白正規化 */
export function normalizeName(input?: string | null): string {
    if (!input) return "";
    return String(input)
        .normalize("NFKC")
        .replace(VARIATION_SELECTOR_RE, "")
        .replace(INVISIBLE_CHARS_RE, "")
        .trim()
        .replace(COLLAPSE_WS_RE, " ")
        .toLocaleLowerCase("ja"); // 大小を吸収（日本語でも安全）
}

/** 絵文字を落として再正規化したバリアント（候補の幅を広げる用） */
export function normalizeNameNoEmoji(input?: string | null): string {
    return normalizeName(String(input || "").replace(EMOJI_RE, ""));
}

/** 低コストなレーベンシュタイン距離（短いニックネーム向け） */
export function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
        let prev = i - 1;
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j];
            dp[j] = Math.min(
                dp[j] + 1, // delete
                dp[j - 1] + 1, // insert
                prev + (a[i - 1] === b[j - 1] ? 0 : 1) // replace
            );
            prev = tmp;
        }
    }
    return dp[n];
}

/** Collator は全角/半角や濁点の差を吸収して比較できる */
const collator = new Intl.Collator("ja", { sensitivity: "base", usage: "search", ignorePunctuation: true });

/**
 * viewers から nickname に最も一致する Viewer を返す。
 *
 * **渡したものの型のまま返す**（`<T extends …>`）。呼ぶ側は絵や絵文字まで
 * 付いた行を渡してくるので、ここで `{name, norm, normNoEmoji}` に痩せると
 * 受け取った側が `as` で太らせ直すことになる。そうすると、行の形を変えた
 * 日に**型が何も言わずに通る**。
 */
export function matchViewerByNickname<
    T extends { name: string; norm: string; normNoEmoji: string }
>(
    prepared: T[],
    rawNickname?: string | null
): T | null {
    if (!rawNickname || prepared.length === 0) return null;

    const target = normalizeName(rawNickname);
    const targetNoEmoji = normalizeNameNoEmoji(rawNickname);

    // 1) 完全一致（正規化前後）
    let hit = prepared.find(p => p.name === rawNickname)
    if (hit) return hit;
    hit = prepared.find(p => p.norm === target);
    if (hit) return hit;

    // 2) Collator で一致（全角/半角やアクセント違いを吸収）
    hit = prepared.find(p => collator.compare(p.norm, target) === 0);
    if (hit) return hit;

    // 3) 絵文字除去同士の一致
    hit = prepared.find(p => p.normNoEmoji === targetNoEmoji);
    if (hit) return hit;

    // 4) Collator + 絵文字除去
    hit = prepared.find(p => collator.compare(p.normNoEmoji, targetNoEmoji) === 0);
    if (hit) return hit;

    // 意図せず誤マッチを拾うリスクが高いので一旦コメントアウト
    // // 5) 近似（レーベンシュタイン距離）— 短い名なら許容閾値を小さく
    // const threshold = Math.max(1, Math.floor(Math.min(target.length, 8) * 0.25)); // 例: 4〜8文字で 1〜2
    // let best = { d: Number.POSITIVE_INFINITY, v: null as null | typeof prepared[number] };
    // for (const p of prepared) {
    //     const d = Math.min(
    //         levenshtein(p.norm, target),
    //         levenshtein(p.normNoEmoji, targetNoEmoji)
    //     );
    //     if (d < best.d) best = { d, v: p };
    // }
    // if (best.v && best.d <= threshold) return best.v;

    // // 6) 前後一致（末尾/先頭に謎スペース・記号が付くケース）
    // hit = prepared.find(p => p.norm && (target.startsWith(p.norm) || target.endsWith(p.norm)));
    // if (hit) return hit;

    return null;
}

/**
 * 名簿を、**名前ごとの並び**に開く。
 *
 * 口が返すのは人ごと（1人がチャンネル名と呼び名を持つ）。当てるほうは
 * 名前ごとに見るので、ここで開く。スプレッドシートが141行で97人だったのと
 * 同じ形に戻している。
 *
 * **絵は縮める前のものを出す。** ドライブから取っていたときも原寸だった。
 * 置き場に原寸が無い人（移行の途中でこけた人）は、焼いてあるいちばん
 * 大きいものに落とす。
 *
 * @param {AlertboxCharacter[]} chars 口が返した人
 * @return {AlertViewer[]} 名前ごとの並び
 */
export function toViewers(chars: AlertboxCharacter[]): AlertViewer[] {
  const out: AlertViewer[] = [];
  for (const c of chars) {
    const p = c.plain;
    const iconUrl = p?.full ?? p?.sizes?.["640"] ?? p?.sizes?.["256"] ?? null;
    /* 名前の重複はここで落とさない。**同じ名前を2人が持っていたら、
       どちらが当たるか決まらない。** それは口のほうで断る話なので、
       ここは表と同じく「並んでいるものを順に見る」だけにする。 */
    for (const name of [c.channelName, ...(c.aliases ?? [])]) {
      if (!name) continue;
      out.push({
        name,
        norm: normalizeName(name),
        normNoEmoji: normalizeNameNoEmoji(name),
        emoji: c.emoji ?? "",
        iconUrl,
        videoUrl: c.videoUrl ?? null,
      });
    }
  }
  return out;
}

/** 当たらなかった名前の「形」。**字そのものは入っていない。** */
export interface NicknameShape {
  /** 生の名前の長さ。符号位置で数える（絵文字を2と数えない） */
  len: number;
  /** 正規化したあとの長さ。`len` と違えば、何かが落ちている */
  normLen: number;
  /** ゼロ幅スペースなどの見えない字が入っていたか */
  invisible: boolean;
  /** 異体字セレクタが入っていたか */
  variation: boolean;
  /** 前後に空白が付いていたか */
  padded: boolean;
  /** 全角英数など、NFKC で形の変わる字が入っていたか */
  widened: boolean;
  /** 絵文字が入っていたか */
  emoji: boolean;
}

/**
 * 当たらなかったときに、**名前の形だけ**を残す。
 *
 * 名簿に当たらなくても画面には何も出ない（配信に映るので）。あやとから
 * 見えるのは「キャラクターが出ない」だけで、**名簿が0人（取り直しが
 * こけた）なのか、名簿は居るのに字が違うのか**が分からない。その差を、
 * 次に起きたときログだけで分けられるようにする。
 *
 * **字そのものは返さない。** ログは誰でも読める（`island-misses.md` #96）。
 * 返すのは長さと「何が混ざっていたか」の真偽だけ。
 *
 * **当て方には使わない。** 当てるのは `matchViewerByNickname` だけで、
 * ここは見るだけの道具。
 *
 * @param {string|null} raw 投げ銭に載っていた生の名前
 * @return {NicknameShape} 長さと、混ざっていたものの有無
 */
export function describeNickname(raw?: string | null): NicknameShape {
  const s = String(raw ?? "");
  /* `test()` は `g` 付きの正規表現だと前に当たった位置を覚えていて、
     同じものを2回見ると false になる。`replace` は毎回先頭から見て
     位置を戻すので、「置き換えたら変わったか」で見る。 */
  return {
    len: [...s].length,
    normLen: [...normalizeName(s)].length,
    invisible: s.replace(INVISIBLE_CHARS_RE, "") !== s,
    variation: s.replace(VARIATION_SELECTOR_RE, "") !== s,
    padded: s.trim() !== s,
    widened: s.normalize("NFKC") !== s,
    emoji: s.replace(EMOJI_RE, "") !== s,
  };
}
