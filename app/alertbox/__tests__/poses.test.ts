/**
 * あやとの仮装のポーズ絵（`season/show/poses.ts`）。絵の担当が置いた本物の poses.json を読めて、
 * 振付けが名指しするポーズがそろっていること。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePoses } from "../season/show/poses";

const dir = join(__dirname, "../../../public/alert/themes/halloween/poses");
const read = (name: string) => JSON.parse(readFileSync(join(dir, name, "poses.json"), "utf8"));

describe("ポーズ絵の約束", () => {
  it("魔法使い: 飛ぶ・杖を振り上げる・待機がそろい、待機だけ左向き（振付けが反転する）", () => {
    const p = parsePoses(read("wizard"))!;
    expect(Object.keys(p.poses).sort()).toEqual(["cast", "fly", "idle"]);
    expect(p.poses.fly.facing).toBe("right");
    expect(p.poses.cast.facing).toBe("right");
    expect(p.poses.idle.facing).toBe("left");
  });

  it("ドラキュラ: 起き上がる・マントを広げる・待機がそろう（段7の振付けが名指しする3枚）", () => {
    const p = parsePoses(read("dracula"))!;
    expect(Object.keys(p.poses).sort()).toEqual(["idle", "rise", "spread"]);
    for (const d of Object.values(p.poses)) {
      expect(Math.abs(d.face[2] - d.face[0] - p.faceW)).toBeLessThanOrEqual(p.faceW * 0.02);
      expect(existsSync(join(dir, "dracula", d.file))).toBe(true);
    }
  });

  it("どのポーズも顔の幅がそろっている（切り替えても顔の大きさが跳ねない）", () => {
    const p = parsePoses(read("wizard"))!;
    for (const d of Object.values(p.poses)) {
      const w = d.face[2] - d.face[0];
      expect(Math.abs(w - p.faceW)).toBeLessThanOrEqual(p.faceW * 0.02);
      // 顔の中心と足元は絵の中
      expect(d.faceCenter[0]).toBeGreaterThan(0);
      expect(d.faceCenter[0]).toBeLessThan(d.size[0]);
      expect(d.bottom[1]).toBeLessThanOrEqual(d.size[1]);
    }
  });

  it("形の違うポーズは捨て、1つも無ければ null", () => {
    expect(parsePoses({ poses: { a: { file: "a.png" } } })).toBeNull();
    expect(parsePoses(null)).toBeNull();
    const ok = parsePoses({
      faceW: 300,
      poses: {
        a: { file: "a.png", size: [10, 10], content: [0, 0, 10, 10], face: [0, 0, 5, 5], faceCenter: [2, 2], bottom: [5, 10] },
        b: { file: "b.png" },
      },
    })!;
    expect(Object.keys(ok.poses)).toEqual(["a"]);
  });
});
