/**
 * アラートボックスが「誰から来た投げ銭か」を当てるところ。
 *
 * **ここを外すと、配信の画面に別人の絵が出る。** しかもあやとは配信中なので
 * その場では直せない。表（スプシ）から口（`/alertbox/{k}/characters`）へ
 * 移し替えたので（#284）、移したことで当たらなくなっていないかを見る。
 *
 *   npx jest app/alertbox
 *
 * 名簿の形が変わったのは2つ。
 *   1. 1人が名前を何個も持つ（前は表が1名前1行だった）
 *   2. 絵が URL そのもので返る（前はドライブの画像IDだった）
 */
import { matchViewerByNickname, toViewers } from "../matching.utils";
import type { AlertboxCharacter } from "../types";

/** 置き場が返す絵。焼いてある幅は人によって違う。 */
const pic = (sizes: Record<string, string>, full: string | null = null) => ({
  full,
  sizes,
  w: null,
  h: null,
});

const CHARS: AlertboxCharacter[] = [
  {
    id: "aaa",
    emoji: "🍣",
    channelName: "@sushi",
    aliases: ["すし", "スシ太郎"],
    plain: pic({ "128": "u128", "640": "u640" }, "ufull"),
    scene: null,
  },
  {
    // 原寸が無い人（移行の途中でこけた人）。**焼いたものに落ちる**
    id: "bbb",
    emoji: "🐟",
    channelName: "@さかな",
    aliases: [],
    plain: pic({ "256": "b256" }),
    scene: null,
  },
  {
    // 絵がまだ無い人。当たっても既定の絵になる
    id: "ccc",
    emoji: "🎃",
    channelName: "",
    aliases: ["かぼちゃ"],
    plain: null,
    scene: null,
  },
];

describe("toViewers（名簿を名前ごとに開く）", () => {
  const vs = toViewers(CHARS);

  it("1人が持っている名前の数だけ行になる", () => {
    // 3 + 1 + 1。channelName が空の人は、その1つを数えない
    expect(vs).toHaveLength(5);
    expect(vs.map((v) => v.name)).toEqual([
      "@sushi",
      "すし",
      "スシ太郎",
      "@さかな",
      "かぼちゃ",
    ]);
  });

  it("同じ人の行は、同じ絵と同じ絵文字を持つ", () => {
    const sushi = vs.filter((v) => v.emoji === "🍣");
    expect(sushi).toHaveLength(3);
    expect(new Set(sushi.map((v) => v.iconUrl)).size).toBe(1);
  });

  it("絵は縮める前のものを選ぶ。無ければ焼いたいちばん大きいもの", () => {
    expect(vs[0].iconUrl).toBe("ufull");
    expect(vs[3].iconUrl).toBe("b256");
  });

  it("絵の無い人は null。**空文字にしない**（`<img src=\"\">` で面が瞬く）", () => {
    expect(vs[4].iconUrl).toBeNull();
  });
});

describe("matchViewerByNickname（投げ銭の名前から当てる）", () => {
  const vs = toViewers(CHARS);
  const hit = (n: string) => matchViewerByNickname(vs, n);

  it("チャンネル名そのままで当たる", () => {
    expect(hit("@sushi")?.emoji).toBe("🍣");
  });

  it("他の呼び名でも当たる", () => {
    expect(hit("すし")?.emoji).toBe("🍣");
    expect(hit("スシ太郎")?.emoji).toBe("🍣");
  });

  it("全角・大小・前後の空白は吸収する", () => {
    expect(hit("＠ＳＵＳＨＩ")?.emoji).toBe("🍣");
    expect(hit("  @Sushi  ")?.emoji).toBe("🍣");
  });

  it("目に見えない字が紛れても当たる（ゼロ幅スペース）", () => {
    expect(hit("す​し")?.emoji).toBe("🍣");
  });

  it("絵文字が付いていても当たる", () => {
    expect(hit("すし🍣")?.emoji).toBe("🍣");
  });

  it("知らない名前は当てない。**近そうな人を返さない**", () => {
    expect(hit("まったく知らない人")).toBeNull();
    expect(hit("")).toBeNull();
  });

  it("名簿が空でも落ちない（口が落ちていた日）", () => {
    expect(matchViewerByNickname([], "@sushi")).toBeNull();
  });
});
