/**
 * 段の小物（`season/show/items.ts`）。絵の担当が置いた本物の items.json を読めて、
 * 段7の振付けが名指しする小物がそろい、絵が全部あること。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseItems } from "../season/show/items";

const dir = join(__dirname, "../../../public/alert/themes/halloween/items");
const read = (name: string) => JSON.parse(readFileSync(join(dir, name, "items.json"), "utf8"));

describe("小物の約束", () => {
  it("段7（dracula）: 古城と満月・赤じゅうたん3つ・紙吹雪4つがそろい、絵が全部ある", () => {
    const it = parseItems(read("dracula"))!;
    for (const n of ["castle_moon", "carpet_roll", "carpet_strip", "carpet_end", "confetti_star", "confetti_heart", "confetti_ribbon", "confetti_sparkle"]) {
      expect(it[n]).toBeTruthy();
      expect(existsSync(join(dir, "dracula", it[n].file))).toBe(true);
      // 中身の外接矩形は絵の中
      const [x0, y0, x1, y1] = it[n].content;
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(it[n].size[0]);
      expect(y1).toBeLessThanOrEqual(it[n].size[1]);
    }
  });

  it("形の違う小物は捨て、1つも無ければ null。外接矩形が無ければ絵の全体", () => {
    expect(parseItems(null)).toBeNull();
    expect(parseItems({ items: { a: { file: "a.png" } } })).toBeNull();
    const ok = parseItems({ items: { a: { file: "a.png", size: [10, 20] }, b: { size: [1, 1] } } })!;
    expect(Object.keys(ok)).toEqual(["a"]);
    expect(ok.a.content).toEqual([0, 0, 10, 20]);
  });
});
