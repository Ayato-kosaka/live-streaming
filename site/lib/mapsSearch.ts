/**
 * **Google マップを「名前で検索した状態」で開く道。面の側で組むのはここ1か所。**
 *
 * あやと（2026-11-15・ソフィア滞在中）:
 *
 * > Google マップで開くボタンを押すと、座標に飛ばされてよく分かりにくい。
 * > 店が分かるように、Google マップで検索をかけた状態で渡してほしい。
 *
 * 座標で開くと名前の無い点が1つ立つだけで、何の店か・開いているかが出ない。
 * 名前で検索すれば Google の店の札（写真・営業時間・口コミ）がそのまま開く。
 * 字は **現地の綴りの名前 ＋（要れば通り）＋ 街の現地の名前**。
 *
 * 焼くほうの Python は `python/maps_link.py`。**同じ形にしてある**（片方だけ直さない）。
 * `?api=1` の形は、アプリが入っていればアプリ、無ければブラウザの地図が開く（iPhone / Android とも）。
 * `hl=ja` を付けないと、現地の端末の言葉で開く。
 */
export const mapsSearch = (...parts: (string | undefined | null)[]): string => {
  const query = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query, hl: "ja" })}`;
};
