/**
 * その人のキャラ絵を、名前の札の下の四角に**絵の中身で**収める置き方（`CharFit`）。
 *
 * 字とキャラ絵を1画素も重ねない決まりの、置き方の側の約束:
 * - 中身の外接矩形が四角からはみ出さない（上の辺は四角の上の辺。札のすぐ下）
 * - 余白の多い絵でも、余白ではなく中身で大きさが決まる
 */
import { fitContent } from "../components/CharFit";

const inside = (c: { left: number; top: number; width: number; height: number }, aw: number, ah: number) =>
  c.left >= -1e-6 && c.top >= -1e-6 && c.left + c.width <= aw + 1e-6 && c.top + c.height <= ah + 1e-6;

describe("キャラ絵の置き方（中身の外接矩形で収める）", () => {
  it("横長の中身は幅いっぱい・縦は真ん中", () => {
    const at = fitContent({ natW: 1024, natH: 400, box: { x: 0, y: 0, w: 1, h: 1 } }, 436, 600);
    expect(at.content.width).toBeCloseTo(436);
    expect(at.content.top + at.content.height / 2).toBeCloseTo(300);
    expect(inside(at.content, 436, 600)).toBe(true);
  });

  it("縦長の中身は高さいっぱい・横は真ん中", () => {
    const at = fitContent({ natW: 400, natH: 1254, box: { x: 0, y: 0, w: 1, h: 1 } }, 436, 600);
    expect(at.content.height).toBeCloseTo(600);
    expect(at.content.left + at.content.width / 2).toBeCloseTo(218);
    expect(inside(at.content, 436, 600)).toBe(true);
  });

  it("余白の多い絵は、余白を外して中身を大きく置く（絵の外枠ははみ出してよい）", () => {
    // 1400 四方の台紙の左下に、330×416 の中身
    const fit = { natW: 1400, natH: 1400, box: { x: 105 / 1400, y: 942 / 1400, w: 330 / 1400, h: 416 / 1400 } };
    const at = fitContent(fit, 436, 600);
    expect(inside(at.content, 436, 600)).toBe(true);
    // 中身が四角の幅を使い切る（外枠で収めると 436/1400 倍で、中身の幅は 103px にしかならない）
    expect(at.content.width).toBeCloseTo(436);
    // 絵の外枠は、中身の位置が合うように動いている
    expect(at.img.top).toBeCloseTo(at.content.top - (942 / 1400) * 1400 * at.s);
  });

  it("どんな形でも、中身は四角の中", () => {
    for (const [w, h] of [[1, 1], [3, 1], [1, 3], [1255, 1255], [10, 1000], [1000, 10]]) {
      for (const [aw, ah] of [[436, 500], [664, 900], [436, 120]]) {
        const at = fitContent({ natW: w, natH: h, box: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 } }, aw, ah);
        expect(inside(at.content, aw, ah)).toBe(true);
      }
    }
  });
});
