/**
 * 章ごとの人数・配信の本数と、**その章にいた住人**。
 * **自動生成。手で直さない。**
 * 作り直す: `BQ_PROJECT_ID=... python python/build_chapter_stats.py`
 *
 * `people` はその章のあいだにチャットを1回でも書いた人の数（重複なし）。
 * `streams` はその章のあいだに配信して取り込めたものの数。
 *
 * `residents` は、そのうち**キャラクターの絵が分かっている人**だけ。
 * 絵とチャンネルの対応は、キャラクターの名簿（Firestore の `islandCharacter`）に
 * チャットの名乗りを当てて作る（`python/build_residents.py` の `link()`）。
 * だから `residents.length` は `people` よりずっと少ない。**この2つは別のものを数えている。**
 *
 * **同じ人が複数の島に出てよい**（`docs/island-atlas.md` 3章）。
 * 島ごとに重複を消さない。ずっと来てくれている人は、ずっと島にいる。
 *
 * 数えた日: 2026-09-18
 */
export type ChapterResident = {
  /** キャラクターの絵（Google Drive の id）。`content/residents.ts` の icon と同じ */
  icon: string;
  /** その章のあいだ、チャットを書いた日の数。多い順に並んでいる */
  days: number;
};

export type ChapterStat = {
  /** その章のあいだに来てくれた人の数 */
  people: number;
  /** その章のあいだの配信の本数 */
  streams: number;
  /** そのうち、絵の分かっている住人。多く来た順 */
  residents: ChapterResident[];
};

export const CHAPTER_STATS: Record<string, ChapterStat> = {
  // ヨーロッパ周遊
  "europe": {
    people: 258,
    streams: 128,
    residents: [
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 68 },
      { icon: "18F1UehNd5efpQztgrRqHOGnibXJQYuda", days: 59 },
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 50 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 33 },
      { icon: "1U4OS9WR37dE3rBLZf4oVBpmOZVkPsKfE", days: 29 },
      { icon: "1I_M6D8cTyv3YHJn2WTNSyQrkF8tNTMsZ", days: 25 },
      { icon: "1rkhrzVUpkZGXfSpDbyxzOKoHLUZKy8VL", days: 24 },
      { icon: "1Y1UY-zSP4LrjEvWXvFKXkhJ0JCTD8LFS", days: 16 },
      { icon: "1h8-hyQRdUyqKWSfrQlz55VJLTUN2ibiB", days: 15 },
      { icon: "1TS5HWkC1AmGnn3yLqoppPuhq1V_8p3Q7", days: 12 },
      { icon: "1EjhtLAwDDBF_8sr60802BeCtebKXbc_Y", days: 10 },
      { icon: "1h6oOLYFl6J1jb5_dGWcokkKw_bE78Pt_", days: 6 },
      { icon: "1tfS_fQYCUkkbVCyRwdYeqGPZ3rACU4VX", days: 4 },
      { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", days: 4 },
      { icon: "1TSM9fNbI4Zg8ga6OdDqjPhma-n7W-wLQ", days: 3 },
      { icon: "1fYawzTx6XSW3LHc22AQwkyNHM1kS07WN", days: 3 },
      { icon: "1e3c_PP-qNYQf1B3ZIYX_CoJolVZkCQ2D", days: 1 },
    ],
  },
  // 中東周遊
  "middle-east": {
    people: 177,
    streams: 113,
    residents: [
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 78 },
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 77 },
      { icon: "1rkhrzVUpkZGXfSpDbyxzOKoHLUZKy8VL", days: 60 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 43 },
      { icon: "1Y1UY-zSP4LrjEvWXvFKXkhJ0JCTD8LFS", days: 30 },
      { icon: "1U4OS9WR37dE3rBLZf4oVBpmOZVkPsKfE", days: 29 },
      { icon: "1AzM8uFWB67nZ6SyinVeHHIK9OiWoXR9Y", days: 22 },
      { icon: "18F1UehNd5efpQztgrRqHOGnibXJQYuda", days: 18 },
      { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", days: 9 },
      { icon: "1h6oOLYFl6J1jb5_dGWcokkKw_bE78Pt_", days: 5 },
      { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", days: 5 },
      { icon: "1h8-hyQRdUyqKWSfrQlz55VJLTUN2ibiB", days: 5 },
      { icon: "1cF2q6-hrVZA87JfNiqhFtntT7e0XMcSp", days: 5 },
      { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", days: 3 },
      { icon: "1h-O2B6oLncxDyQYVDwEsELSdGdajIc37", days: 3 },
      { icon: "1TS5HWkC1AmGnn3yLqoppPuhq1V_8p3Q7", days: 2 },
      { icon: "1tfS_fQYCUkkbVCyRwdYeqGPZ3rACU4VX", days: 1 },
      { icon: "1EjhtLAwDDBF_8sr60802BeCtebKXbc_Y", days: 1 },
    ],
  },
  // コーカサス周遊
  "caucasus": {
    people: 1925,
    streams: 476,
    residents: [
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 281 },
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 242 },
      { icon: "1FQFqrRn7Rx8mTT4KOs36_-H2LHeA4uWz", days: 163 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 122 },
      { icon: "18okO58dwMaci-9R1go0Rj1dTqliSWlz3", days: 110 },
      { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", days: 106 },
      { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", days: 84 },
      { icon: "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", days: 70 },
      { icon: "1oRv9hYOkvlbBvDepLcDWEd6CWm19BJkS", days: 64 },
      { icon: "d2ff6294640d4a5aa19bce30dfcbc8840", days: 60 },
      { icon: "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq", days: 58 },
      { icon: "1y17p0D56itwNXWWEzo94jF4ThNETczQg", days: 56 },
      { icon: "1cF2q6-hrVZA87JfNiqhFtntT7e0XMcSp", days: 50 },
      { icon: "1qWjhGcv3Y--7hTEnrzOZk_rzud3qdzqb", days: 48 },
      { icon: "1L3c-p3QtcO5HLqCPUtGisxI-_SpwEaZt", days: 43 },
      { icon: "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp", days: 42 },
      { icon: "1EDpfnUuIpgzv_xTNg1iLYjOSBtxPD8bd", days: 37 },
      { icon: "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm", days: 37 },
      { icon: "1rkhrzVUpkZGXfSpDbyxzOKoHLUZKy8VL", days: 36 },
      { icon: "1t-p13QOO6AKU1hfzLERn9UtQi7KaCkj_", days: 32 },
      { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", days: 25 },
      { icon: "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", days: 25 },
      { icon: "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47", days: 22 },
      { icon: "1QKJBnvPkBcoi235RWZ0THbe4D5Bly4_D", days: 21 },
      { icon: "1Y1UY-zSP4LrjEvWXvFKXkhJ0JCTD8LFS", days: 20 },
      { icon: "1pnLoE5eN_KBshkVkc-im25pkffjC3mwc", days: 19 },
      { icon: "f203e9529b7941c89940a568e03b83b00", days: 19 },
      { icon: "1rKI8QR7dLexTBoM8E3LjTCzQCXvzpHlB", days: 19 },
      { icon: "1h-O2B6oLncxDyQYVDwEsELSdGdajIc37", days: 18 },
      { icon: "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh", days: 18 },
      { icon: "1DcjL-_voO7I_JOlQrlKi2ixieBh7KSBA", days: 16 },
      { icon: "1U4OS9WR37dE3rBLZf4oVBpmOZVkPsKfE", days: 16 },
      { icon: "1h8-hyQRdUyqKWSfrQlz55VJLTUN2ibiB", days: 15 },
      { icon: "1TSM9fNbI4Zg8ga6OdDqjPhma-n7W-wLQ", days: 14 },
      { icon: "10hbypXDmWLEcat6gTZz3TuotslN8EiSb", days: 14 },
      { icon: "1qXh-o-wpSd_lHP6CjiUgsW56QDK9TbDp", days: 14 },
      { icon: "1gq-yA-KAErasYCpLqIxGTqafjv2GCaqJ", days: 14 },
      { icon: "1E8Qm7sgAKmznob7FNDzBEB78zvPfJi86", days: 13 },
      { icon: "1h6oOLYFl6J1jb5_dGWcokkKw_bE78Pt_", days: 13 },
      { icon: "1EjhtLAwDDBF_8sr60802BeCtebKXbc_Y", days: 13 },
      { icon: "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz", days: 12 },
      { icon: "0c8468a6411842cdb144f70eefee5b7b0", days: 12 },
      { icon: "1Ngr31whwrzOnlOah0MctMlsACXsMbIgM", days: 10 },
      { icon: "1xsgHUd1SDC049DHL7yLWAIfal8DQvT8Z", days: 10 },
      { icon: "18F1UehNd5efpQztgrRqHOGnibXJQYuda", days: 9 },
      { icon: "1yzAcYk81VKiWiONNJnyLvTTjIv5VgpDO", days: 9 },
      { icon: "1p46JvC_wbKo-rDEzE2pRMZh2neekNvta", days: 7 },
      { icon: "1_G_v2sdY7ByT2Cp5C5E8wZKiAv3FzBZT", days: 7 },
      { icon: "1F9mvP0wZ0hjX4S3bzcfytUd4jBxKuAXk", days: 6 },
      { icon: "1cLFhOOGK9vHibsqRwbMcqXE9-28bELI1", days: 6 },
      { icon: "12NyHkOji0ABdZtMPS1WAMoyfF_iKCZaj", days: 6 },
      { icon: "1itaFtShGqKKOPGGFVYzdSJC-kFMCmHus", days: 5 },
      { icon: "1vGDZvd5HVIcMuRvmWRySHZrby1u_otDV", days: 5 },
      { icon: "1PBmqkQtcTeuNPIfILna1FLh9W7VtNliX", days: 4 },
      { icon: "1E73m2i7IyzhqXKYMDCbM0_nSSQpKRE4w", days: 4 },
      { icon: "1kp3UJGRiwJsLqoZ97zjmc0RZcChX6Eo5", days: 3 },
      { icon: "1TS5HWkC1AmGnn3yLqoppPuhq1V_8p3Q7", days: 3 },
      { icon: "1xBrE8SUvCt4P9jwrrVv-Ok1dA0AaXCf4", days: 3 },
      { icon: "1AzM8uFWB67nZ6SyinVeHHIK9OiWoXR9Y", days: 3 },
      { icon: "1T0NAqeh241mWWnQlV6zmnbflznFtxLkr", days: 3 },
      { icon: "1SOyFgrSquG1pFNDYj_A8-vn6E_yC49xi", days: 3 },
      { icon: "1mh-UiLxDgcMIpuIhbPmQ1Br3JSC9cRR-", days: 3 },
      { icon: "1Xe4pfpOYsRBZqnZtZpXnydZiOm-ijzn9", days: 3 },
      { icon: "1NylyE8cpHLq-Mw_ehq2OpBlbYmcLmKIw", days: 3 },
      { icon: "18-GR9oQLMF6V_qEY2q9D0HO2ggdXsCsC", days: 2 },
      { icon: "1tfS_fQYCUkkbVCyRwdYeqGPZ3rACU4VX", days: 2 },
      { icon: "1e3c_PP-qNYQf1B3ZIYX_CoJolVZkCQ2D", days: 2 },
      { icon: "1vSGLidkOCS4jkjbBrUYbJETo3wkGd3yD", days: 2 },
      { icon: "5cc99a90acad4e7997d92b27c5207c6c0", days: 2 },
      { icon: "1RAzLmaR8Kk8UZYDqUl85uNQEdd4QFu9C", days: 1 },
      { icon: "c3cca678865a4021a048e617fab35db30", days: 1 },
      { icon: "16YSWedIKcZkW3LIDqF3A3lNLSP2uJMfK", days: 1 },
      { icon: "1AGGCwvD2ZSwlL69Gff_EvVnunRvKq9qp", days: 1 },
      { icon: "1TuP7g7puRFr5geCJpi6II9YFBeQrWXYN", days: 1 },
      { icon: "1lMatgwohGSKOXMGRMO0UFrusGh8D9KgN", days: 1 },
      { icon: "02e7cc3109ef45e2bc56aaf7f520ef7c0", days: 1 },
      { icon: "1fYawzTx6XSW3LHc22AQwkyNHM1kS07WN", days: 1 },
      { icon: "1iulEsJGApOYA9XtHb4bwhJKljDHOcA4Q", days: 1 },
    ],
  },
  // イランまで歩く
  "iran-walk": {
    people: 502,
    streams: 17,
    residents: [
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 7 },
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 6 },
      { icon: "1cLFhOOGK9vHibsqRwbMcqXE9-28bELI1", days: 4 },
      { icon: "1_G_v2sdY7ByT2Cp5C5E8wZKiAv3FzBZT", days: 4 },
      { icon: "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq", days: 4 },
      { icon: "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz", days: 3 },
      { icon: "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp", days: 3 },
      { icon: "1NylyE8cpHLq-Mw_ehq2OpBlbYmcLmKIw", days: 3 },
      { icon: "1p46JvC_wbKo-rDEzE2pRMZh2neekNvta", days: 3 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 3 },
      { icon: "1qXh-o-wpSd_lHP6CjiUgsW56QDK9TbDp", days: 3 },
      { icon: "1gq-yA-KAErasYCpLqIxGTqafjv2GCaqJ", days: 2 },
      { icon: "18-GR9oQLMF6V_qEY2q9D0HO2ggdXsCsC", days: 2 },
      { icon: "1PBmqkQtcTeuNPIfILna1FLh9W7VtNliX", days: 2 },
      { icon: "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh", days: 2 },
      { icon: "1mh-UiLxDgcMIpuIhbPmQ1Br3JSC9cRR-", days: 2 },
      { icon: "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", days: 2 },
      { icon: "1TSM9fNbI4Zg8ga6OdDqjPhma-n7W-wLQ", days: 2 },
      { icon: "1EjhtLAwDDBF_8sr60802BeCtebKXbc_Y", days: 2 },
      { icon: "1T0NAqeh241mWWnQlV6zmnbflznFtxLkr", days: 2 },
      { icon: "1h6oOLYFl6J1jb5_dGWcokkKw_bE78Pt_", days: 2 },
      { icon: "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", days: 2 },
      { icon: "d2ff6294640d4a5aa19bce30dfcbc8840", days: 2 },
      { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", days: 2 },
      { icon: "1SOyFgrSquG1pFNDYj_A8-vn6E_yC49xi", days: 2 },
      { icon: "1xBrE8SUvCt4P9jwrrVv-Ok1dA0AaXCf4", days: 2 },
      { icon: "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm", days: 2 },
      { icon: "1xsgHUd1SDC049DHL7yLWAIfal8DQvT8Z", days: 1 },
      { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", days: 1 },
      { icon: "1kp3UJGRiwJsLqoZ97zjmc0RZcChX6Eo5", days: 1 },
      { icon: "1EDpfnUuIpgzv_xTNg1iLYjOSBtxPD8bd", days: 1 },
      { icon: "1vGDZvd5HVIcMuRvmWRySHZrby1u_otDV", days: 1 },
      { icon: "1E73m2i7IyzhqXKYMDCbM0_nSSQpKRE4w", days: 1 },
      { icon: "1iulEsJGApOYA9XtHb4bwhJKljDHOcA4Q", days: 1 },
      { icon: "1itaFtShGqKKOPGGFVYzdSJC-kFMCmHus", days: 1 },
      { icon: "1Xe4pfpOYsRBZqnZtZpXnydZiOm-ijzn9", days: 1 },
    ],
  },
};
