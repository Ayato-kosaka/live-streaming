/**
 * 街ごとの配信。python/build_city_streams.py が BigQuery から作る。
 * 滞在期間の配信のうち、タイトルにその街の名前が出てくるものを選んでいる。
 * 手で書き換えず、スクリプトを流し直すこと。
 */
export type CityStream = { videoId: string; title: string; date: string };

export const CITY_STREAMS: Record<string, Record<string, CityStream[]>> =
  {
  "armenia": {
    "エレバン": [
      {
        "videoId": "rHUoWeMPa1o",
        "title": "【帰路ヒッチハイク①】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。12日目ヒッチハイクでエレバンに帰る",
        "date": "2026-05-10"
      },
      {
        "videoId": "IjcyQPvmdeI",
        "title": "エレバンカムバック！！色々体のガタがきた",
        "date": "2026-05-11"
      }
    ],
    "カパン": [
      {
        "videoId": "ed8voejW_3M",
        "title": "【9日目①】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。カパン 45キロ",
        "date": "2026-05-07"
      },
      {
        "videoId": "r72uWC2eMz0",
        "title": "【9日目②】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。9日目 カパン 45キロ",
        "date": "2026-05-07"
      }
    ],
    "ゴリス": [
      {
        "videoId": "Q-k3eH7JNq8",
        "title": "ジョージアからアルメニアのバス乗ります",
        "date": "2026-04-19"
      },
      {
        "videoId": "jTpvux9mM44",
        "title": "アルメニアでございます",
        "date": "2026-04-19"
      }
    ],
    "セヴァン湖": [
      {
        "videoId": "Aea0S3WIZLU",
        "title": "友達ともめるショート動画が100万再生越えたよーん！明日は１３時からセヴァン湖",
        "date": "2026-05-19"
      }
    ],
    "タテフ": [
      {
        "videoId": "aYXWyg1ANh0",
        "title": "アルメニアが雨降るわけあるめーにぁ",
        "date": "2026-04-20"
      },
      {
        "videoId": "k-3fN6Ynsok",
        "title": "アルメニアに慣れてくるわけあるめーにぁ",
        "date": "2026-04-21"
      }
    ],
    "メグリ": [
      {
        "videoId": "TFiFG8lrcpA",
        "title": "【最終日】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。10日目 メグリ 70キロ",
        "date": "2026-05-08"
      },
      {
        "videoId": "HfH1RooVuEQ",
        "title": "【ゴール１時間前】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。10日目 メグリ 70キロ",
        "date": "2026-05-08"
      }
    ]
  },
  "austria": {
    "ウィーン": [
      {
        "videoId": "lTOC9aBctq0",
        "title": "遂にウィーンなのでチャンネル登録300人目指します",
        "date": "2024-11-26"
      },
      {
        "videoId": "6RFpzPt0mt0",
        "title": "ウィーンでスリに遭ったので卵茹でます",
        "date": "2024-11-27"
      },
      {
        "videoId": "koEV5cYVgfA",
        "title": "ウィーンが綺麗すぎたので、ライブします",
        "date": "2024-11-27"
      },
      {
        "videoId": "PwnIyPj2tj4",
        "title": "ウィーンに一生住みたいので卵茹でます",
        "date": "2024-11-29"
      }
    ]
  },
  "azerbaijan": {
    "バクー": [
      {
        "videoId": "-arvqz0yAPM",
        "title": "なんとか、、アゼルバイジャン🇦🇿に到着しました、、、天国です😇",
        "date": "2025-06-29"
      },
      {
        "videoId": "c47TW6GtOCA",
        "title": "いやぁ〜アゼルバイジャン、物価安すぎだわぁ〜",
        "date": "2025-06-29"
      },
      {
        "videoId": "XjZU6PKL_Zs",
        "title": "アゼルバイジャン🇦🇿でSIMを手に入れました〜",
        "date": "2025-06-30"
      },
      {
        "videoId": "scPjfmFsnrk",
        "title": "【緊急】アゼルバイジャン🇦🇿が親日すぎます",
        "date": "2025-07-01"
      }
    ]
  },
  "belgium": {
    "ブリュッセル": [
      {
        "videoId": "aQ42ie5xAN4",
        "title": "【ヨーロッパ週3ひとり旅】ベルギー1日目、疲れたぁ。。少しだけ",
        "date": "2024-11-15"
      },
      {
        "videoId": "CYktl2-uhwE",
        "title": "【ヨーロッパ週3ひとり旅】ベルギー暇や！",
        "date": "2024-11-16"
      },
      {
        "videoId": "dv4gajX38SU",
        "title": "【ヨーロッパ週3ひとり旅】ベルギー2日目終了しました",
        "date": "2024-11-17"
      }
    ],
    "リエージュ": [
      {
        "videoId": "cIEa-dFtCZU",
        "title": "ベルギー🇧🇪リエージュ着きましたんで少し。ホステルが綺麗すぎました。",
        "date": "2025-03-21"
      },
      {
        "videoId": "V6lxgRozDJk",
        "title": "前編【神回】ベルギーのワッフルはここから始まった！？リエージュで本物の味に出会う旅🧇",
        "date": "2025-03-22"
      },
      {
        "videoId": "_Crl6Z-HlBA",
        "title": "後編【神回】ベルギーのワッフルはここから始まった！？リエージュで本物の味に出会う旅🧇",
        "date": "2025-03-22"
      }
    ]
  },
  "cyprus": {
    "ニコシア": [
      {
        "videoId": "2ia-7g3Nt4g",
        "title": "キプロスコーヒー吹きこぼしました。🇨🇾ニコシア Hiiiii。",
        "date": "2025-04-14"
      },
      {
        "videoId": "DRw8ZsNHvms",
        "title": "キプロス🇨🇾ニコシアでスーパーマーケットに行ってみた",
        "date": "2025-04-15"
      },
      {
        "videoId": "zB7LHQkGmXM",
        "title": "【㊗️スパチャ開始】キプロス🇨🇾ニコシアで、コーヒーとケーキでお祝いしました🥂🍰",
        "date": "2025-04-16"
      }
    ],
    "パフォス": [
      {
        "videoId": "F0lai32IZqU",
        "title": "キプロス🇨🇾パフォスつきました〜",
        "date": "2025-05-23"
      },
      {
        "videoId": "GEthwfE5_vU",
        "title": "【神回】キプロス・パフォス街歩き！古代遺跡から地中海サンセットまで🌅パフォスの名所ぜんぶ詰め込んで歩いてみた",
        "date": "2025-05-24"
      }
    ],
    "ラルナカ": [
      {
        "videoId": "_2byU9nMCi0",
        "title": "キプロス🇨🇾ラルナカつきました",
        "date": "2025-04-20"
      },
      {
        "videoId": "ouCH9DYvTAA",
        "title": "キプロス🇨🇾ラルナカの海を見に行こう",
        "date": "2025-04-21"
      },
      {
        "videoId": "QrgoRk4F-D4",
        "title": "一ヶ月ぶりのヨーロッパに涙が止まりません。キプロス🇨🇾ラルナカで、エジプトとヨーロッパの違いを100個探しました",
        "date": "2025-05-22"
      }
    ]
  },
  "czech": {
    "プラハ": [
      {
        "videoId": "uylUHvF_1WM",
        "title": "チェコに着いたので、魅力を探りませう",
        "date": "2024-12-03"
      },
      {
        "videoId": "eSBp2SkzuKw",
        "title": "チェコの街並み見てきたので、コメント読みます",
        "date": "2024-12-07"
      },
      {
        "videoId": "3zScjzMxmc4",
        "title": "チェコの夜景が綺麗すぎたので、質問コーナーします！",
        "date": "2024-12-09"
      }
    ]
  },
  "egypt": {
    "アスワン": [
      {
        "videoId": "zlgM1S0yl2Q",
        "title": "GWエジプト祭り3日目 - アスワン巡り",
        "date": "2025-05-05"
      }
    ],
    "アブ・シンベル": [
      {
        "videoId": "EulWB4cVngk",
        "title": "GWエジプト祭り最終日 - アブ・シンベル神殿",
        "date": "2025-05-06"
      }
    ],
    "カイロ": [
      {
        "videoId": "RfOyZTBI5zw",
        "title": "エジプト🇪🇬カイロのスーパーマーケットを見てみよう",
        "date": "2025-04-24"
      },
      {
        "videoId": "z5ihh0UZrng",
        "title": "エジプト🇪🇬カイロのホテル紹介します",
        "date": "2025-04-25"
      },
      {
        "videoId": "hwJOAa5Kt8U",
        "title": "【神回】エジプト🇪🇬 ラクダで行くピラミッドの絶景！エジプト料理で謝肉祭！博物館で古代ロマン旅！",
        "date": "2025-04-26"
      }
    ],
    "シワ": [
      {
        "videoId": "jX6NIopOoLY",
        "title": "エジプト🇪🇬シワ着きました〜",
        "date": "2025-05-09"
      },
      {
        "videoId": "TI2MBw1UTEQ",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-10"
      }
    ],
    "ルクソール": [
      {
        "videoId": "kNWqxeh732U",
        "title": "エジプト🇪🇬ルクソール 着いたら、想像以上にウザかった",
        "date": "2025-05-01"
      },
      {
        "videoId": "QPTKsGZ1oCM",
        "title": "エジプト🇪🇬ルクソールでファラフェル食べに行きます",
        "date": "2025-05-01"
      },
      {
        "videoId": "NgRP5qSJry0",
        "title": "GWエジプト祭り1日目-ルクソール西岸 王家の谷エリア",
        "date": "2025-05-03"
      }
    ]
  },
  "france": {
    "パリ": [
      {
        "videoId": "OtrhMpDgxSQ",
        "title": "【ヨーロッパ週3ひとり旅】パリ最終日…",
        "date": "2024-11-05"
      },
      {
        "videoId": "2fdbFpZgWVs",
        "title": "ひとり旅が再び始まりました。パリを少し歩きます。",
        "date": "2025-03-13"
      },
      {
        "videoId": "jCwf-vlnEiM",
        "title": "グッズ販売開始しました〜パリのホステルで少し。",
        "date": "2025-03-14"
      }
    ],
    "モン・サン・ミシェル": [
      {
        "videoId": "Lmk2lp9iFQ8",
        "title": "モン・サン・ミシェルが青空の中、海に浮いてます🥺",
        "date": "2025-03-05"
      }
    ],
    "ルーアン": [
      {
        "videoId": "NWVWtIVn-pg",
        "title": "フランス、ルーアンで少し",
        "date": "2025-03-04"
      }
    ],
    "南フランス": [
      {
        "videoId": "hPZ2hAggOLE",
        "title": "南フランスめちゃくちゃ綺麗やなぁ〜",
        "date": "2025-03-08"
      },
      {
        "videoId": "qtUIaqhIg9Y",
        "title": "リル=シュル=ラ=ソルギュ(南フランス)きてもーた",
        "date": "2025-03-09"
      },
      {
        "videoId": "hB1jT4Nl4II",
        "title": "レ・ボー＝ド＝プロヴァンスのフレンチ三ツ星、別格でした",
        "date": "2025-03-10"
      }
    ]
  },
  "georgia": {
    "カズベキ": [
      {
        "videoId": "1QyrfgL0Tek",
        "title": "カズベキで企画会議や！ホステル紹介も！",
        "date": "2026-08-05"
      },
      {
        "videoId": "dkmw3DHDMX4",
        "title": "カズベキでアクアパッツァつくるぞー！",
        "date": "2026-08-07"
      },
      {
        "videoId": "lPCx2VMe4pc",
        "title": "カズベキの滝見に行こ！カズ滝",
        "date": "2026-08-12"
      }
    ],
    "トビリシ": [
      {
        "videoId": "CivhSffnPXE",
        "title": "トビリシ海まで歩きます",
        "date": "2026-06-07"
      },
      {
        "videoId": "Pnbi01M0t0I",
        "title": "土曜やしトビリシ海まで歩こか！",
        "date": "2026-07-11"
      },
      {
        "videoId": "Td0AVFbSLk8",
        "title": "トビリシカムバックやぁーー",
        "date": "2026-08-17"
      }
    ]
  },
  "germany": {
    "ケルン": [
      {
        "videoId": "4oxRIi6G798",
        "title": "ドイツ🇩🇪ケルン着きましたー",
        "date": "2025-03-28"
      },
      {
        "videoId": "W5Q-wKTzflY",
        "title": "前編【神回】ドイツのケルン街歩き！チョコ博物館から始めたら、ケルン大聖堂が想像の3倍デカかった件！",
        "date": "2025-03-28"
      },
      {
        "videoId": "-5Ihju_Nzgc",
        "title": "後編【神回】ドイツのケルン街歩き！チョコ博物館から始めたら、ケルン大聖堂が想像の3倍デカかった件！",
        "date": "2025-03-29"
      }
    ],
    "ベルリン": [
      {
        "videoId": "HQXyYrE4Wgw",
        "title": "ベルリンついてウキウキなので、質問コーナーします！",
        "date": "2024-12-11"
      },
      {
        "videoId": "dv6acJbB49A",
        "title": "ベルリンの壁を並走したので話しましょう",
        "date": "2024-12-12"
      },
      {
        "videoId": "DTljNSFHQvE",
        "title": "ベルリンで変な髪型にされたので、チャンネル登録お願いします",
        "date": "2024-12-12"
      },
      {
        "videoId": "hw5qLPIV3bM",
        "title": "ベルリンのスイーツが美味すぎたのでお裾分けします。",
        "date": "2024-12-17"
      }
    ]
  },
  "hungary": {
    "ブダペスト": [
      {
        "videoId": "rwHiAPXhpwE",
        "title": "【ヨーロッパ週3ひとり旅】ハンガリーにやってきた！！",
        "date": "2024-11-19"
      },
      {
        "videoId": "uJo3u6CRyMo",
        "title": "【ヨーロッパ週3ひとり旅】ハンガリーってクソ陽キャな国…",
        "date": "2024-11-21"
      },
      {
        "videoId": "p-3tglZzEiw",
        "title": "【ヨーロッパ週3ひとり旅】ハンガリー最高だぜ",
        "date": "2024-11-21"
      }
    ]
  },
  "iran-border": {
    "メグリ（国境）": [
      {
        "videoId": "M11XX1oeng8",
        "title": "【1日目①】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。アルタシャト23キロ",
        "date": "2026-04-29"
      },
      {
        "videoId": "GTIftto0kjk",
        "title": "【2日目】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。Urtsadzor 29キロ",
        "date": "2026-04-30"
      },
      {
        "videoId": "fH13PheJneU",
        "title": "【3日目】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。アレニ 50キロ",
        "date": "2026-05-01"
      }
    ]
  },
  "jordan": {
    "アンマン": [
      {
        "videoId": "IWposViqyKw",
        "title": "ヨルダン🇯🇴アンマンのピザが最高すぎた",
        "date": "2025-05-28"
      },
      {
        "videoId": "Wdk-RIQ0fzg",
        "title": "ヨルダン🇯🇴アンマンで少し",
        "date": "2025-05-29"
      },
      {
        "videoId": "f9j0z_OcZpo",
        "title": "【神回】ヨルダンの古都アンマン街歩き！城塞遺跡から激ウマグルメまで全部盛り☕🍴",
        "date": "2025-06-07"
      }
    ],
    "ペトラ": [
      {
        "videoId": "IHLIhNV_y_k",
        "title": "ヨルダン🇯🇴ペトラつきました",
        "date": "2025-05-29"
      },
      {
        "videoId": "dUkZa7NUwxs",
        "title": "ペトラ観光の予定を立てます",
        "date": "2025-05-30"
      },
      {
        "videoId": "tQvjhxMivZQ",
        "title": "【神回】ペトラ遺跡で限界街歩き！ペトラでシークを抜け、秘境モナストリー、ペトラ飯、夕日まで全部盛り！！",
        "date": "2025-05-31"
      }
    ],
    "死海": [
      {
        "videoId": "GEBiHHPB5VM",
        "title": "ヨルダン🇯🇴アンマンで死海の魅力を探りました",
        "date": "2025-06-08"
      },
      {
        "videoId": "Gj9w3wu3jfQ",
        "title": "【神回】ヨルダンの死海×絶景リゾート街歩き＆贅沢ランチLIVE！",
        "date": "2025-06-14"
      }
    ]
  },
  "netherlands": {
    "アムステルダム": [
      {
        "videoId": "9d5fKfP0XCU",
        "title": "オランダでクルーズなう。少しだけ",
        "date": "2024-11-07"
      }
    ]
  },
  "slovakia": {
    "ブラチスラバ": [
      {
        "videoId": "SkOXq_X94zg",
        "title": "スロバキアに行くので、チャンネル登録してください",
        "date": "2024-12-02"
      }
    ]
  },
  "turkey": {
    "イスタンブール": [
      {
        "videoId": "6cRyzHIezD4",
        "title": "イスタンブール🇹🇷サビハ・ギョクチェン空港着きましたー",
        "date": "2025-03-30"
      },
      {
        "videoId": "aUpMiuFhaMk",
        "title": "トルコ🇹🇷イスタンブール がウザすぎました",
        "date": "2025-03-30"
      },
      {
        "videoId": "Q2nn9RXxN7Q",
        "title": "【祝8万投げ銭】トルコ🇹🇷イスタンブールでスーパーの買い物紹介をしました",
        "date": "2025-04-01"
      }
    ]
  },
  "uae": {
    "アブダビ": [
      {
        "videoId": "aNWaUilNWbU",
        "title": "UAE🇦🇪付きました〜、携帯がぶっ壊れました〜😭",
        "date": "2025-06-26"
      },
      {
        "videoId": "Y0CV6Idu-hU",
        "title": "携帯治ったぁぁ🙌アブダビ🇦🇪がサウナすぎました🧖",
        "date": "2025-06-26"
      },
      {
        "videoId": "UbbfjRJ6KTM",
        "title": "【神回】🇦🇪アブダビ街歩き！白モスク→ローカル飯→夕暮れビーチまで🌇",
        "date": "2025-06-27"
      }
    ]
  }
};

export const streamsOfCity = (country: string, city: string): CityStream[] =>
  CITY_STREAMS[country]?.[city] ?? [];
