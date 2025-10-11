// 依存なし（RN/Expo標準で動きます）

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

/** viewers から nickname に最も一致する Viewer を返す */
export function matchViewerByNickname(
    prepared: { name: string; norm: string; normNoEmoji: string; }[],
    rawNickname?: string | null
) {
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
