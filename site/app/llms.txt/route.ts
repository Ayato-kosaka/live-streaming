import { APPS, PAST_APPS } from "@/content/apps";
import { COUNTRIES } from "@/content/countries";
import { guidebookOf } from "@/content/guidebook";
import { LEGENDS } from "@/content/legends";
import { headOf } from "@/content/legends/index";
import { PROJECTS } from "@/content/projects";
import { RECIPES } from "@/content/recipes";
import { LINKS, SITE } from "@/content/site";
import { STREAM_TYPES } from "@/content/streamTypes";
import { TRAVEL, publicArticles, publicCities } from "@/content/travel";
import { abs } from "@/lib/jsonld";

/**
 * **`/llms.txt`——AI の読み手に「島が何で、どの面に何があるか」を1枚で渡す。**（#1262）
 *
 * AI の回答のための読み手（GPTBot・ClaudeBot・PerplexityBot ほか）は JS を動かさず、1面ずつ取りに来る。
 * 島には 140面あまりあり、どれが街の案内で、どれが旅の記録かは、面を開くまで分からない。
 * llms.txt（https://llmstxt.org/）の形で、島の説明と面の一覧を Markdown 1枚にする。
 *
 * ## 決めごと
 *
 * - **手で並べない。** 面の名簿（sitemap と同じ `content/*`）から毎回作る。面が増えれば、ここも増える
 *   （手で書いた一覧は、書いた日から古くなる。`docs/island-standards.md` 8章）
 * - 一行の説明は、面に見えている一文（`summary` `note` `lead` `description`）。ここで言い換えない
 * - 公開前の面（`draft`）は載せない（sitemap と同じ `publicCities` `publicArticles`。下書きの企画は `PROJECTS` に入らない）
 * - 数（何本・何カ国）は書かない。読んだ日によって変わる数は、面のほうが持つ
 */
export const dynamic = "force-static";

const line = (name: string, path: string, note?: string) =>
  `- [${name}](${abs(path)})${note ? `: ${note.replace(/\s+/g, " ").trim()}` : ""}`;

export function GET() {
  const youtube = LINKS.find((l) => l.id === "youtube")?.href;
  const guides = publicCities().map((c) => {
    const g = guidebookOf(c.country, c.slug);
    return line(g?.title ?? c.name, c.href, g?.description);
  });
  const articles = publicArticles().map((a) => {
    const city = publicCities(a.country).find((c) => c.slug === a.city);
    return line(`${city?.name ?? a.city}の${a.crumb}`, a.href);
  });
  const out = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    "あやと（配信者）が旅先から毎晩 YouTube で生配信している、その配信の記録を、視聴者さんと一緒に島の形にまとめたサイトです。" +
      "文は配信の記録から「あやと島案内鳥」がまとめています。行った街の案内には、実際に払った額・歩いた道・配信の場面へのリンクと、" +
      "調べた事実の出どころを付けています。",
    "",
    `- あやとのこと: ${abs("/about")}`,
    ...(youtube ? [`- 配信（YouTube のチャンネル）: ${youtube}`] : []),
    `- 島ぜんぶの一覧: ${abs("/all")}`,
    "",
    "## 街の案内（ガイドブック）",
    "",
    "その街で見たいもの・食べたいもの・買いたいもの、基本情報（行き方・お金・治安）、地区ごとの地図。",
    "",
    ...guides,
    ...articles,
    "",
    "## 歩いた国（旅の記録）",
    "",
    line("歩いた国の地図", TRAVEL, "2024年9月に日本を出てから歩いた国と、その線"),
    ...[...COUNTRIES].sort((a, b) => a.order - b.order).map((c) => line(c.name, `${TRAVEL}/${c.slug}`, c.summary)),
    "",
    "## 配信で作った料理",
    "",
    line("クッキング・スタンプ帳", "/kitchen", "旅先の借りたキッチンで、企画会議→買い出し→調理の3日がかりで作ってきた料理"),
    ...RECIPES.map((r) => line(r.name, `/kitchen/${r.slug}`, r.note)),
    "",
    "## 伝説の企画",
    "",
    ...LEGENDS.map((l) => line(l.title, `/legends/${l.slug}`, l.lead)),
    /* 面の印の付いた企画（始まる前から面を持つ。M-8）。**下書きの企画は `PROJECTS` に入らないので載らない**（M-33） */
    ...PROJECTS.filter((p) => p.book).map((p) => line(p.title, `/legends/${p.slug}`, headOf(p.slug).meta.description)),
    "",
    "## 配信の型",
    "",
    ...STREAM_TYPES.map((t) => line(t.name, `/streams/${t.slug}`, t.lead)),
    "",
    "## 月ごとのふりかえり",
    "",
    /* 月の面は1行だけ。`content/months.ts`（額つきの順位を持つ）を読んでよいのは月の面だけなので
       （`docs/island-money.md` 2.1・`python/months_safe_selftest.py`）、ここでは月ごとに並べない */
    line("月ごとのふりかえり", "/months", "ひと月ずつの配信の記録。出席ランキング、投げ銭ありがとう"),
    "",
    "## 作っているアプリ",
    "",
    ...[...APPS, ...PAST_APPS].map((a) => line(a.name, `/apps/${a.slug}`, a.tagline)),
    "",
    "## Optional",
    "",
    line("島をなおしたところ", "/updates", "サイトの更新の記録"),
    line("プライバシーポリシー", "/privacy"),
    "",
  ];
  return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
