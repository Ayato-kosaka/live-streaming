/** 直近90日で島に来てくれている仲間のうち、キャラクター登録済みの人。
 *  名前は出さない方針なので、アイコン/絵文字と「一緒にいた日数」、
 *  島に出るえらばれやすさだけを持つ。
 *
 *  **手で直さない。** `python/build_residents.py` が BigQuery から焼く。
 *  日ごとに数える。**チャットが取り込めていない日は、出席にも分母にも入れない**
 *  （読めていない日を「居た」ことにすると、1回来ただけの人が常連になる）。
 *
 *  **`score`（0〜1）が、島に出ている人を日替わりで選ぶ重み**
 *  （`components/island/roster.ts` の rosterOf）。中身は2つだけ:
 *  **直近90日の投げ銭の総額の順位**と、**同じ期間の出席日数の順位**を
 *  それぞれ 0〜1 に直して足して2で割ったもの。**足す**ので、額0の人も
 *  出席だけで島に出られるし、額1位は皆勤とおなじだけ強い（あやとの決め）。
 *  **何回に分けて投げたかは見ていない**（総額の順位しか見ない）。
 *  同着は全員そのかたまりの「いちばん下」の点。投げ銭0円の人は額の点が 0。
 *
 *  **生の金額はここに無い。** このリポジトリは公開なので、焼いてあるのは
 *  0〜1 に直した点だけ。「誰がいくら投げたか」はここからは読めない。
 *
 *  **画面に出る日数は、ここの値ではない（#91）。** `/friends` の図鑑は
 *  `/state` の `residentDays` を出す。あちらは毎晩 `islandChannels` に
 *  入り直すので、旅の途中でも古くならない。**ここの値は、それが読めなかった
 *  ときの受け皿**と、上の抽選の重み（書き出し時に1回決まる）。
 *  数え方が2つあるのは承知のうえ。ここは直近90日、あちらは全期間。
 *
 *  **並んでいるのは、キャラクターの名簿（Firestore の `islandCharacter`）
 *  そのもの。** 島を歩く候補はここが決める。前は python 側の手書きの表（22行）が
 *  決めていて、名簿に絵があるのに一度も島に立てない人がそのぶん居た。
 *
 *  `channel` は YouTube のチャンネル id。**まず名簿の `channelId` で結び、
 *  持っていない人だけチャットの名乗りを `lookupKeys` に当てて結ぶ**
 *  （カードの絵と同じ引き方）。**決められないもの（同じ `channelId` や
 *  同じ鍵が2人に付いている・1つの絵に2つのチャンネルが当たる）は結ばない。**
 *  結べなかった人は `channel` が無く、`days` は 0。絵は島に立つ。
 *  本人にログイン画面で選ばせない。他人の絵を自分のものにできてしまうため。
 */
export type Resident = {
  icon?: string;
  emoji?: string;
  days: number;
  /** 島に出るえらばれやすさ（0〜1）。額の順位＋出席の順位 */
  score: number;
  channel?: string;
};

export const RESIDENTS: Resident[] = [
  { icon: "18okO58dwMaci-9R1go0Rj1dTqliSWlz3", emoji: "💙", days: 85, score: 0.934, channel: "UCNTxy7hXktoG4V6jT6A3M9A" },
  { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", emoji: "🐟", days: 80, score: 0.995, channel: "UCTXgxriwnTlJ0y1tff0yU5A" },
  { icon: "1qWjhGcv3Y--7hTEnrzOZk_rzud3qdzqb", emoji: "🧩", days: 57, score: 0.893, channel: "UCQEkHcVktFFDrFJRSaN_40w" },
  { icon: "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", emoji: "🍃", days: 49, score: 0.980, channel: "UCfhX-rOzBe-QhWPPv03FtQA" },
  { icon: "1L3c-p3QtcO5HLqCPUtGisxI-_SpwEaZt", emoji: "🐼", days: 48, score: 0.964, channel: "UCceC2uQXoN9wt2POovos37Q" },
  { icon: "1oRv9hYOkvlbBvDepLcDWEd6CWm19BJkS", emoji: "🐕", days: 46, score: 0.959, channel: "UCEw49OqT87MZEDQJVkjWNRA" },
  { icon: "d2ff6294640d4a5aa19bce30dfcbc8840", emoji: "🐠", days: 46, score: 0.847, channel: "UCe7Vv25PNHDvDgDS5jB6Nrg" },
  { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", emoji: "🪟", days: 45, score: 0.939, channel: "UCaHTatQmUMV4TEkSDIeSzHw" },
  { icon: "1y17p0D56itwNXWWEzo94jF4ThNETczQg", emoji: "🍑", days: 35, score: 0.918, channel: "UCJPDZ4SQYonw3vZvyxVKrjg" },
  { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", emoji: "🇨🇦", days: 33, score: 0.449, channel: "UCsBjGz8D3lLxUhV_eNxN0CQ" },
  { icon: "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47", emoji: "🐀", days: 33, score: 0.918, channel: "UCyct2GK_RiW5Ji3Y0gd9MMg" },
  { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", emoji: "🦔", days: 30, score: 0.903, channel: "UCHdRx9BTg6q_SF5y-4Wg5WQ" },
  { icon: "f203e9529b7941c89940a568e03b83b00", emoji: "🫘", days: 30, score: 0.842, channel: "UCgCbojfalXxkRW9XPdoX6pQ" },
  { icon: "1FQFqrRn7Rx8mTT4KOs36_-H2LHeA4uWz", emoji: "🪆", days: 28, score: 0.857, channel: "UCbz2F3GGD_EpBzrWb8WM-cg" },
  { icon: "1t-p13QOO6AKU1hfzLERn9UtQi7KaCkj_", emoji: "🍄", days: 22, score: 0.872, channel: "UCEFc53GW9WOuIauCdV5G3dA" },
  { icon: "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", emoji: "🐯", days: 17, score: 0.903, channel: "UCL08aPtZiZQ5wigmTKlUjeg" },
  { icon: "1pnLoE5eN_KBshkVkc-im25pkffjC3mwc", emoji: "🪐", days: 14, score: 0.418, channel: "UCO1YuQIwotwvoS9zad6ZI9w" },
  { icon: "0c8468a6411842cdb144f70eefee5b7b0", emoji: "🐂", days: 13, score: 0.796, channel: "UCsMubXzZi2kznysLnAv5kQQ" },
  { icon: "1yzAcYk81VKiWiONNJnyLvTTjIv5VgpDO", emoji: "🏀", days: 13, score: 0.408, channel: "UCszUt4VHX0G1qRJ-MJF8HNg" },
  { icon: "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq", emoji: "🪻", days: 12, score: 0.770, channel: "UCn4EuDFdAfeYGhuFOxpj-NA" },
  { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", emoji: "🤤", days: 9, score: 0.760, channel: "UCPPWcswbh9XAkE7CWV0QLUg" },
  { icon: "1qXh-o-wpSd_lHP6CjiUgsW56QDK9TbDp", emoji: "🟣", days: 8, score: 0.811, channel: "UCwmvel3_YWKhDHgt8MFmykA" },
  { icon: "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp", emoji: "😴", days: 7, score: 0.388, channel: "UCCfYV72nvXIrU_TL4h-HJtA" },
  { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", emoji: "🦄", days: 6, score: 0.821, channel: "UCTcaoWz0ZBjeCF07p4YO-oQ" },
  { icon: "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz", emoji: "🍊", days: 6, score: 0.786, channel: "UCwx9wGMxJo8G6Dw-dZH1b-Q" },
  { icon: "5cc99a90acad4e7997d92b27c5207c6c0", emoji: "🦆", days: 6, score: 0.801, channel: "UCjiF-3vPERhqlWe5VzLBENw" },
  { icon: "1vSGLidkOCS4jkjbBrUYbJETo3wkGd3yD", emoji: "🛡️", days: 5, score: 0.362, channel: "UCVdbtqSsMClCKKnPRxuQ1cA" },
  { icon: "a43e965774df4900b7c8724c66f5deba0", emoji: "🦐", days: 5, score: 0.801, channel: "UCrfV94VGIIo6irYh5F_T0Gw" },
  { icon: "1p46JvC_wbKo-rDEzE2pRMZh2neekNvta", emoji: "🥤", days: 4, score: 0.740, channel: "UCMaBoTnnQ5DNmdvqSZrmeMw" },
  { icon: "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh", emoji: "🧢", days: 4, score: 0.347, channel: "UCiCJBaQiVs_78Mdw_gWNjAw" },
  { icon: "1rBAIvw3q0oxlgnGd9TJUNHKnIrYwr-bE", emoji: "👂", days: 4, score: 0.347, channel: "UCGOz2sfccDEHoH-sQKhPSgw" },
  { icon: "02e7cc3109ef45e2bc56aaf7f520ef7c0", emoji: "🌱", days: 3, score: 0.684, channel: "UC_XH7WpZiMgGbaqcPYyQslQ" },
  { icon: "1F9mvP0wZ0hjX4S3bzcfytUd4jBxKuAXk", emoji: "⭐️", days: 3, score: 0.316, channel: "UCD3zlvGSjgtrX5FFtXef6PA" },
  { icon: "1h-O2B6oLncxDyQYVDwEsELSdGdajIc37", emoji: "🇧🇷", days: 3, score: 0.316, channel: "UC2YyGjvZk1SHNS7OTUbJXDA" },
  { icon: "1itaFtShGqKKOPGGFVYzdSJC-kFMCmHus", emoji: "🐦", days: 3, score: 0.316, channel: "UCQoW4IamHAH_1P0Br9D64gQ" },
  { icon: "c3cca678865a4021a048e617fab35db30", emoji: "🐗", days: 3, score: 0.699, channel: "UCwUzB4cF-QIotFBaHpCIEvg" },
  { icon: "f003927aa7df4f5599a6bd58e2d324450", emoji: "🦌", days: 3, score: 0.770, channel: "UCKxaGApuZlFo23kMN_NZBvw" },
  { icon: "1cLFhOOGK9vHibsqRwbMcqXE9-28bELI1", emoji: "🛻", days: 2, score: 0.311, channel: "UC-jySjSFJkR0DRFgnhr4JfQ" },
  { icon: "14yZusInfAgY955RYurL3ADJ9hN6H2Bac", emoji: "🌞", days: 1, score: 0.265, channel: "UC6C3luOVskj7e-GGgG3mrKA" },
  { icon: "1QKJBnvPkBcoi235RWZ0THbe4D5Bly4_D", emoji: "⛰️", days: 1, score: 0.265, channel: "UC0ti1WZH58d-R7kJ_CsoQvQ" },
  { icon: "1TuP7g7puRFr5geCJpi6II9YFBeQrWXYN", emoji: "🌺", days: 1, score: 0.663, channel: "UCjTFjPteJGQzOzj8072SvbA" },
  { icon: "1Xe4pfpOYsRBZqnZtZpXnydZiOm-ijzn9", emoji: "🍍", days: 1, score: 0.265, channel: "UCb27SIfCVPfYOQE3xJscTWQ" },
  { icon: "1e3c_PP-qNYQf1B3ZIYX_CoJolVZkCQ2D", emoji: "🐻", days: 1, score: 0.265, channel: "UCj0wRI6A_uhjLGcU9utX7CQ" },
  { icon: "1gq-yA-KAErasYCpLqIxGTqafjv2GCaqJ", emoji: "👤", days: 1, score: 0.265, channel: "UC7PlEUhCCiy7eS86wrNmpOA" },
  { icon: "1h6oOLYFl6J1jb5_dGWcokkKw_bE78Pt_", emoji: "📚", days: 1, score: 0.265, channel: "UC3rWREGwCM8G4smBF5RsaUQ" },
  { icon: "1m_QE_hV46Ppy50vh5ic2H89AdkRVWMLG", emoji: "🥨", days: 1, score: 0.265, channel: "UCCqqpILZ4PF5SPJvPIpxUQg" },
  { icon: "1vGDZvd5HVIcMuRvmWRySHZrby1u_otDV", emoji: "🧱", days: 1, score: 0.265, channel: "UCu9y3Pld7ecPXYBzhu57iWw" },
  { icon: "10hbypXDmWLEcat6gTZz3TuotslN8EiSb", emoji: "✝️", days: 0, score: 0.000, channel: "UCnmWRDfZZVvzdYJnJ9WzyoA" },
  { icon: "12NyHkOji0ABdZtMPS1WAMoyfF_iKCZaj", emoji: "🍙", days: 0, score: 0.000, channel: "UCIEACzbUbkniQWDWOh39vmA" },
  { icon: "151HenpNq4kKoXxiccsiALtKGPIDIxGGl", emoji: "🥊", days: 0, score: 0.000 },
  { icon: "16YSWedIKcZkW3LIDqF3A3lNLSP2uJMfK", emoji: "🛸", days: 0, score: 0.000, channel: "UCzJUrz_S6xeqwmwwEb-Knlg" },
  { icon: "18-GR9oQLMF6V_qEY2q9D0HO2ggdXsCsC", emoji: "🪽", days: 0, score: 0.000, channel: "UCcVFy6IRhQgPraC-LveO9nw" },
  { icon: "18F1UehNd5efpQztgrRqHOGnibXJQYuda", emoji: "🎩", days: 0, score: 0.000, channel: "UCB_ocY2WJO1_Uxk_OJMUeOQ" },
  { icon: "18wPo2-X4hht-JKaX0Vnk-SwryEP3INL3", emoji: "❄️", days: 0, score: 0.000 },
  { icon: "1AGGCwvD2ZSwlL69Gff_EvVnunRvKq9qp", emoji: "🎨", days: 0, score: 0.000, channel: "UCo86vKGrHoyWQC82JdFnYtQ" },
  { icon: "1AzM8uFWB67nZ6SyinVeHHIK9OiWoXR9Y", emoji: "🐈‍⬛", days: 0, score: 0.000, channel: "UCX9cGbxxPCDJx9N9-lCaXmg" },
  { icon: "1Cz7Cr3eJl2lODLngdjVTTjIX34yrcq5k", emoji: "🐩", days: 0, score: 0.000 },
  { icon: "1E73m2i7IyzhqXKYMDCbM0_nSSQpKRE4w", emoji: "🏎️", days: 0, score: 0.000, channel: "UClkRFzwXiSwLdMplcN2Sgqw" },
  { icon: "1E8Qm7sgAKmznob7FNDzBEB78zvPfJi86", emoji: "🏷️", days: 0, score: 0.000, channel: "UCk18XobqxyNsU9RLJAl21ew" },
  { icon: "1EDpfnUuIpgzv_xTNg1iLYjOSBtxPD8bd", emoji: "🕺", days: 0, score: 0.000, channel: "UC0mcwX_omBl1Q89BEfmqMnA" },
  { icon: "1EjhtLAwDDBF_8sr60802BeCtebKXbc_Y", emoji: "🍣", days: 0, score: 0.000, channel: "UCbiHS3Dv_0Qq5749MFtQr1Q" },
  { icon: "1FAAUlc3rR5uYgM7PiZbpjodmsi9iMKY7", emoji: "🍔", days: 0, score: 0.000 },
  { icon: "1I_M6D8cTyv3YHJn2WTNSyQrkF8tNTMsZ", emoji: "😏", days: 0, score: 0.000, channel: "UCp5U13-U2LLzo3uAiYPFKWw" },
  { icon: "1Ngr31whwrzOnlOah0MctMlsACXsMbIgM", emoji: "🌻", days: 0, score: 0.000, channel: "UCspzvbWjHHOEDQ2sJwzsXDQ" },
  { icon: "1NylyE8cpHLq-Mw_ehq2OpBlbYmcLmKIw", emoji: "🍣🥢", days: 0, score: 0.000, channel: "UCFUCoyG1Xty8So7Obk5bgPw" },
  { icon: "1PBmqkQtcTeuNPIfILna1FLh9W7VtNliX", emoji: "🧞‍♀️", days: 0, score: 0.000, channel: "UCFCqf7xXISyOWuc2DfWDlbQ" },
  { icon: "1Pnz3C3qVkoCCF7aAeqJqYJS3BQcv5kpG", emoji: "🍯", days: 0, score: 0.000, channel: "UC6GCSBNT4zx7n1Wx_6Dl9jQ" },
  { icon: "1RAzLmaR8Kk8UZYDqUl85uNQEdd4QFu9C", emoji: "🪭", days: 0, score: 0.000, channel: "UCBbEFzN-y-7C60mfSler8Yw" },
  { icon: "1SOyFgrSquG1pFNDYj_A8-vn6E_yC49xi", emoji: "😸", days: 0, score: 0.000, channel: "UCcrPc226JzMv4qj8Q_iSLSw" },
  { icon: "1T0NAqeh241mWWnQlV6zmnbflznFtxLkr", emoji: "💦", days: 0, score: 0.000, channel: "UCUvhDQvVaHKkQuIP5UaHFYQ" },
  { icon: "1TS5HWkC1AmGnn3yLqoppPuhq1V_8p3Q7", emoji: "🎭", days: 0, score: 0.000, channel: "UC-Ad9SIUHzNPvQoLrn8OJTA" },
  { icon: "1TSM9fNbI4Zg8ga6OdDqjPhma-n7W-wLQ", emoji: "🎲", days: 0, score: 0.000, channel: "UCiA-9N1qcnWeRHwq1ZgZpPQ" },
  { icon: "1U4OS9WR37dE3rBLZf4oVBpmOZVkPsKfE", emoji: "🦊", days: 0, score: 0.000, channel: "UCjUPT6TfQ0U6iw9dJcS9ZDQ" },
  { icon: "1Y1UY-zSP4LrjEvWXvFKXkhJ0JCTD8LFS", emoji: "🌸", days: 0, score: 0.000, channel: "UCVuT-UuRU7s27w7elqaWBZg" },
  { icon: "1Y8b2L9Y6uZSNFcv9PVLR6aDqKuAdnZE7", emoji: "🧠", days: 0, score: 0.000, channel: "UCsMDy8Y6VRBqA_SkqU7AQiA" },
  { icon: "1Ypw31n_0wRri-oEhRpqAB3p6jZFtN7BN", emoji: "🇬🇧", days: 0, score: 0.000, channel: "UCOgFBHR9UazkeIUtf1Cq9wg" },
  { icon: "1_G_v2sdY7ByT2Cp5C5E8wZKiAv3FzBZT", emoji: "🫎", days: 0, score: 0.000, channel: "UCcxXd9myzAyJOFtunR6dZ7Q" },
  { icon: "1a5RFkHtQVQhVENchDxOEWbrQnJpRozM_", emoji: "🃏", days: 0, score: 0.000, channel: "UCyhOs_qFIfsbpo8uXnX9LKA" },
  { icon: "1bGBB3GDn6UUEwC0sjhuFXjs3FllDHV12", emoji: "🧟‍♀️", days: 0, score: 0.000 },
  { icon: "1cF2q6-hrVZA87JfNiqhFtntT7e0XMcSp", emoji: "1️⃣", days: 0, score: 0.000, channel: "UCdlSepAnnXnvLGp1felspxg" },
  { icon: "1dr5dfJRm-nozyGBLyiTSFPSxo8Fl_624", emoji: "🕰️", days: 0, score: 0.000, channel: "UCG41DFIcTUwZah9-rZQmf6w" },
  { icon: "1fYawzTx6XSW3LHc22AQwkyNHM1kS07WN", emoji: "🎃", days: 0, score: 0.000, channel: "UCWXudUkhSH67rb2dZw-tX-A" },
  { icon: "1gLXDXki9i7UGr83PQ_DyluvwNtXz7S16", emoji: "🍌", days: 0, score: 0.000 },
  { icon: "1h8-hyQRdUyqKWSfrQlz55VJLTUN2ibiB", emoji: "🍷", days: 0, score: 0.000, channel: "UCO7GHm27ZesCTJ6qmfCXV_w" },
  { icon: "1iulEsJGApOYA9XtHb4bwhJKljDHOcA4Q", emoji: "🐻‍❄️", days: 0, score: 0.000, channel: "UCWDoqsza1J9skfzXcPRQv2Q" },
  { icon: "1kp3UJGRiwJsLqoZ97zjmc0RZcChX6Eo5", emoji: "❌", days: 0, score: 0.000, channel: "UCsOVOpSpeRk_gnuR2O0NRfw" },
  { icon: "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm", emoji: "😺", days: 0, score: 0.000, channel: "UCa9utHa4ky3ZD2nOP0K0iEQ" },
  { icon: "1lMatgwohGSKOXMGRMO0UFrusGh8D9KgN", emoji: "🥙", days: 0, score: 0.000, channel: "UC2GkbgqukvPzMICIwKCQGyg" },
  { icon: "1m9fsDVHh22IM1L6QFc3MohhmF-hGPrlf", emoji: "📢", days: 0, score: 0.000 },
  { icon: "1mh-UiLxDgcMIpuIhbPmQ1Br3JSC9cRR-", emoji: "🇮🇱", days: 0, score: 0.000, channel: "UCCkN2HZoIWGifAEb2M37qMg" },
  { icon: "1nF1nRExuVTiueUaYIXNRR9tijr564qNV", emoji: "🐰", days: 0, score: 0.000 },
  { icon: "1oiHs-Ayika6g2ePt2Y4AIfgrWrMMJQf7", emoji: "🤟", days: 0, score: 0.000 },
  { icon: "1q2o_EF4oe2MgyDBzZj3sB52n_jcf-QWk", emoji: "🧘‍♂️", days: 0, score: 0.000 },
  { icon: "1rKI8QR7dLexTBoM8E3LjTCzQCXvzpHlB", emoji: "☕", days: 0, score: 0.000, channel: "UCS52b9CXsTrQZbxOUfthXsg" },
  { icon: "1rkhrzVUpkZGXfSpDbyxzOKoHLUZKy8VL", emoji: "🐘", days: 0, score: 0.000, channel: "UC8GrmKcy6CxUcI_r80sPGeg" },
  { icon: "1tfS_fQYCUkkbVCyRwdYeqGPZ3rACU4VX", emoji: "🧳", days: 0, score: 0.000, channel: "UCOJZIEvlwOzPvxWSSydBS1g" },
  { icon: "1wj98nVodWV6j-5pPdrP4YVQUEJsO072j", emoji: "🐱", days: 0, score: 0.000, channel: "UCOahybIxvBNMnYxgSYvL1lQ" },
  { icon: "1xBrE8SUvCt4P9jwrrVv-Ok1dA0AaXCf4", emoji: "🚛", days: 0, score: 0.000, channel: "UCmc220QsNWhlXXAJh7AC04w" },
  { icon: "1xsgHUd1SDC049DHL7yLWAIfal8DQvT8Z", emoji: "🐮", days: 0, score: 0.000, channel: "UCdlbt_zdvVU4xqCd4x3VMEA" },
];

/** 直近90日で5日以上コメントしてくれた人の総数(キャラ未登録も含む) */
export const ACTIVE_FRIENDS = 67;

/** 出席の分母。期間内に**読めた**配信日の数
 *  （配信はあったのに取り込めていない3日は、出席にも分母にも入れていない） */
export const STREAM_DAYS = 86;
