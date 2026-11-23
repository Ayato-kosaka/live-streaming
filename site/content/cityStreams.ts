/**
 * 街ごとの配信。python/build_city_streams.py が BigQuery から作る。
 * 街が2つ以上ある滞在は、議事録の `- 場所:` に出る街（議事録も facts も無い回だけ題名）。
 * 街が1つの滞在は、その期間の配信ぜんぶ（題名が国名で書かれている時期があるため）。
 * 手で編集せず、スクリプトを流し直すこと。
 */
export type CityStream = { videoId: string; title: string; date: string };

export const CITY_STREAMS: Record<string, Record<string, CityStream[]>> =
  {
  "france": {
    "パリ": [
      {
        "videoId": "Tbzv8ZWnZ-I",
        "title": "【ヨーロッパひとり旅】日本語を話したい...",
        "date": "2024-10-28"
      },
      {
        "videoId": "_5WeTBID_q8",
        "title": "【ヨーロッパ週3ひとり旅】日本語話したい…",
        "date": "2024-11-04"
      },
      {
        "videoId": "OtrhMpDgxSQ",
        "title": "【ヨーロッパ週3ひとり旅】 パリ最終日…",
        "date": "2024-11-05"
      },
      {
        "videoId": "gcc3xTG6zNo",
        "title": "パリ戻ってきてモーター",
        "date": "2025-03-13"
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
      },
      {
        "videoId": "RFpKH_hIKcw",
        "title": "前編【神回】思い出のパリ🥖を歩き尽くす！✨ #エッフェル塔 #凱旋門 #シャンゼリゼ通り #ノートルダム大聖堂 #セーヌ川 #ルーブル美術館 #ヴァンヴ蚤の市 #カヌレ",
        "date": "2025-03-15"
      },
      {
        "videoId": "zhpKovQTr24",
        "title": "後編【神回】思い出のパリ🥖を歩き尽くす！✨ #エッフェル塔 #凱旋門 #シャンゼリゼ通り #ノートルダム大聖堂 #セーヌ川 #ルーブル美術館 #ヴァンヴ蚤の市 #カヌレ",
        "date": "2025-03-15"
      },
      {
        "videoId": "3a8oVqCfd7A",
        "title": "パリの公園にミモザと桜咲いてたよ〜",
        "date": "2025-03-16"
      },
      {
        "videoId": "lJas9qr789s",
        "title": "パリで髪切ったら悪ガキにされました × フランスのスーパーでバケット買いました",
        "date": "2025-03-17"
      },
      {
        "videoId": "NEUlRGbj4lg",
        "title": "パリラスト歩き。ホステルでバケットと共に語りました。",
        "date": "2025-03-19"
      }
    ],
    "ルーアン": [
      {
        "videoId": "NWVWtIVn-pg",
        "title": "フランス、ルーアンで少し",
        "date": "2025-03-04"
      }
    ],
    "モン・サン・ミシェル": [
      {
        "videoId": "Lmk2lp9iFQ8",
        "title": "モン・サン・ミシェルが青空の中、海に浮いてます🥺",
        "date": "2025-03-05"
      }
    ],
    "南フランス": [
      {
        "videoId": "9H5ZzwTB2V4",
        "title": "北仏バイバイ、南仏にやってきました〜",
        "date": "2025-03-07"
      },
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
        "videoId": "sSpOtvWjbEY",
        "title": "リル=シュル=ラ=ソルギュ(南フランス)が悪天候すぎて泣いた",
        "date": "2025-03-10"
      },
      {
        "videoId": "hB1jT4Nl4II",
        "title": "レ・ボー＝ド＝プロヴァンスのフレンチ三ツ星、別格でした",
        "date": "2025-03-10"
      },
      {
        "videoId": "weSZaHeQVlI",
        "title": "南フランスにあるローマ時代の橋、ポンデュガールに来てもうた",
        "date": "2025-03-11"
      },
      {
        "videoId": "u64xGgMIvh4",
        "title": "ほぼスペインのフランスの港町collioure にきてもーた",
        "date": "2025-03-12"
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
  "belgium": {
    "ブリュッセル": [
      {
        "videoId": "03MtRZsY28k",
        "title": "【ヨーロッパ週3ひとり旅】 やっとWi-Fi繋がったぁぁぁぁ",
        "date": "2024-11-13"
      },
      {
        "videoId": "aQ42ie5xAN4",
        "title": "【ヨーロッパ週3ひとり旅】 ベルギー1日目、疲れたぁ。。少しだけ",
        "date": "2024-11-15"
      },
      {
        "videoId": "0AnHLfWQUfc",
        "title": "【ヨーロッパ週3ひとり旅】 やべ、今起きた。少しだけ配信する！",
        "date": "2024-11-15"
      },
      {
        "videoId": "CYktl2-uhwE",
        "title": "【ヨーロッパ週3ひとり旅】 ベルギー暇や！",
        "date": "2024-11-16"
      },
      {
        "videoId": "dv4gajX38SU",
        "title": "【ヨーロッパ週3ひとり旅】 ベルギー2日目終了しました",
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
      },
      {
        "videoId": "bTIkiuHw4LQ",
        "title": "【ヨーロッパ編のこり６日】ベルギー🇧🇪リエージュのホステルで少し 3/23",
        "date": "2025-03-23"
      },
      {
        "videoId": "C1OZn_OPv6M",
        "title": "ベルギー🇧🇪リエージュでバケットとフムス食べながらピクニックしました",
        "date": "2025-03-24"
      },
      {
        "videoId": "JpChMMLo8aQ",
        "title": "ベルギー🇧🇪リエージュで念願の焼き立てワッフル食べました！そしてお花見と運河見できました",
        "date": "2025-03-25"
      },
      {
        "videoId": "mnI9zAyPBTU",
        "title": "ベルギー🇧🇪リエージュでトルティーヤを作りました。スネちゃま誕生日おめでとう🎩🎉",
        "date": "2025-03-26"
      },
      {
        "videoId": "BTl89GOp-QU",
        "title": "ベルギー🇧🇪リエージュからドイツ🇩🇪ケルンに移動します 21:30~",
        "date": "2025-03-27"
      }
    ]
  },
  "hungary": {
    "ブダペスト": [
      {
        "videoId": "rwHiAPXhpwE",
        "title": "【ヨーロッパ週3ひとり旅】 ハンガリーにやってきた！！",
        "date": "2024-11-19"
      },
      {
        "videoId": "uJo3u6CRyMo",
        "title": "【ヨーロッパ週3ひとり旅】 ハンガリーってクソ陽キャな国…",
        "date": "2024-11-21"
      },
      {
        "videoId": "p-3tglZzEiw",
        "title": "【ヨーロッパ週3ひとり旅】 ハンガリー最高だぜ",
        "date": "2024-11-21"
      },
      {
        "videoId": "A8mJh2RU2Dc",
        "title": "ハンガリー、寒すぎ。。。",
        "date": "2024-11-23"
      },
      {
        "videoId": "X5-DqDhs9jY",
        "title": "この配信で目指せ、登録者300人！",
        "date": "2024-11-24"
      },
      {
        "videoId": "aencgvAwwn4",
        "title": "ハンガリー最終日、別れはいつも突然に😢",
        "date": "2024-11-24"
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
        "videoId": "koEV5cYVgfA",
        "title": "ウィーンが綺麗すぎたので、ライブします",
        "date": "2024-11-27"
      },
      {
        "videoId": "6RFpzPt0mt0",
        "title": "ウィーンでスリに遭ったので卵茹でます",
        "date": "2024-11-27"
      },
      {
        "videoId": "8WG7ilvRePs",
        "title": "約2ヶ月ぶりにリア友に会えたので涙を止めてください",
        "date": "2024-11-29"
      },
      {
        "videoId": "PwnIyPj2tj4",
        "title": "ウィーンに一生住みたいので卵茹でます",
        "date": "2024-11-29"
      },
      {
        "videoId": "A-5gn9cQM34",
        "title": "日本は深夜やけど、オーストリアは良い時間なので靴磨きします",
        "date": "2024-12-01"
      },
      {
        "videoId": "_kilNXNTTeI",
        "title": "ウィーンのお菓子が美味しすぎたので、卵茹でます",
        "date": "2024-12-01"
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
  "czech": {
    "プラハ": [
      {
        "videoId": "uylUHvF_1WM",
        "title": "チェコに着いたので、魅力を探りませう",
        "date": "2024-12-03"
      },
      {
        "videoId": "bvAnOtEPXls",
        "title": "チェコを少し見たので、カサ・アヤトの住人たち集合！！！",
        "date": "2024-12-05"
      },
      {
        "videoId": "OoEq3gKRcKM",
        "title": "【祝アラサー🎈】日本時間でバースデーを跨ごう！",
        "date": "2024-12-05"
      },
      {
        "videoId": "eSBp2SkzuKw",
        "title": "チェコの街並み見てきたので、コメント読みます",
        "date": "2024-12-07"
      },
      {
        "videoId": "KON8im0U6Tk",
        "title": "遂にWi-Fiが復活したので、積もる話しをしましょう！",
        "date": "2024-12-07"
      },
      {
        "videoId": "3zScjzMxmc4",
        "title": "チェコの夜景が綺麗すぎたので、質問コーナーします！",
        "date": "2024-12-09"
      },
      {
        "videoId": "QzkTER4Tml4",
        "title": "チェコ最終日なので、質問コーナーします",
        "date": "2024-12-09"
      }
    ]
  },
  "germany": {
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
        "videoId": "PuSFBmBq9kE",
        "title": "【深夜配信】ヨーロッパ周遊国ランキング9位〜6位",
        "date": "2024-12-14"
      },
      {
        "videoId": "tP4tSr0vEpw",
        "title": "土曜の夕方やから全員来れるよな！！",
        "date": "2024-12-14"
      },
      {
        "videoId": "hw5qLPIV3bM",
        "title": "ベルリンのスイーツが美味すぎたのでお裾分けします。",
        "date": "2024-12-17"
      },
      {
        "videoId": "e6D2cId1SSo",
        "title": "あと7日😇",
        "date": "2024-12-17"
      },
      {
        "videoId": "ceSScIFdVuE",
        "title": "ヨーロッパ旅が終わってしまったので1時間配信します😕",
        "date": "2024-12-25"
      }
    ],
    "ケルン": [
      {
        "videoId": "4oxRIi6G798",
        "title": "ドイツ🇩🇪ケルン着きましたー",
        "date": "2025-03-28"
      },
      {
        "videoId": "BXd429Z19uo",
        "title": "思い出が溢れてきた😭",
        "date": "2025-03-28"
      },
      {
        "videoId": "Y88M0M-pL0U",
        "title": "なにこのホステル🙃",
        "date": "2025-03-28"
      },
      {
        "videoId": "W5Q-wKTzflY",
        "title": "前編【神回】ドイツのケルン街歩き！チョコ博物館から始めたら、ケルン大聖堂が想像の3倍デカかった件！ライブも見れて1日が濃すぎた…",
        "date": "2025-03-28"
      },
      {
        "videoId": "-5Ihju_Nzgc",
        "title": "後編【神回】ドイツのケルン街歩き！チョコ博物館から始めたら、ケルン大聖堂が想像の3倍デカかった件！ライブも見れて1日が濃すぎた…",
        "date": "2025-03-29"
      },
      {
        "videoId": "8WsaJ2j_iHk",
        "title": "ヨーロッパ周遊完了。半年間ありがとうございました😭",
        "date": "2025-03-29"
      },
      {
        "videoId": "iv2max-f4QU",
        "title": "ケルン・ボン空港着きました",
        "date": "2025-03-30"
      },
      {
        "videoId": "6cRyzHIezD4",
        "title": "イスタンブール🇹🇷サビハ・ギョクチェン空港着きましたー",
        "date": "2025-03-30"
      }
    ]
  },
  "uk": {
    "ロンドン": [
      {
        "videoId": "N7fpxgb1OMI",
        "title": "ロンドンを見せたかったけど、SIMがぶっ壊れたので、カフェで回復するのを待ちます。",
        "date": "2025-01-03"
      },
      {
        "videoId": "HYgAYdRWlZM",
        "title": "【神回】魔女の書店に来たらSIMが復活したので、かっこよすぎるロンドンを案内します。",
        "date": "2025-01-03"
      },
      {
        "videoId": "CgW9Nzqvix4",
        "title": "ひょんなことからバッキンガム宮殿に行きました。",
        "date": "2025-01-03"
      },
      {
        "videoId": "1SyclE3VJ08",
        "title": "【神回】ロンドンが奇跡的に晴れてるので、衛兵交代式見せます💂",
        "date": "2025-01-03"
      },
      {
        "videoId": "rS3dnYLfUEM",
        "title": "貯金なしでイギリスを放浪しながら生きていくにはどうすれば良いかトークしてみた",
        "date": "2025-01-04"
      },
      {
        "videoId": "fqk0KVAqMps",
        "title": "【神回】ロンドン街散策！！ノッティングヒルから、アフタヌーンティー、冬のワンダーランドへ！",
        "date": "2025-01-05"
      },
      {
        "videoId": "GZjeibPxjlQ",
        "title": "ロンドンホステルで雑談配信でイギリスのスーパーの買い物を紹介しました。",
        "date": "2025-01-06"
      },
      {
        "videoId": "jsmLfqwAI7c",
        "title": "【祝100本目】遂にホームステイ先と面談することになりました。ロンドンで風邪を引き始めたかも知れないので少しだけ。",
        "date": "2025-01-07"
      },
      {
        "videoId": "b5i449L5UwE",
        "title": "イギリスホームステイの面談落ちました。ロンドンで風邪引いたけど自力で直さないと行けないそうです。",
        "date": "2025-01-08"
      },
      {
        "videoId": "mhw2n8CLiOM",
        "title": "ロンドンついてウキウキしてきたので少し",
        "date": "2025-02-25"
      },
      {
        "videoId": "CWUem6wsuq0",
        "title": "桜咲いてた公園から始まる、ロンドンのショボホステルで少し🤏",
        "date": "2025-02-26"
      },
      {
        "videoId": "_vsZP29JsNo",
        "title": "【あと４日】テムズ川沿い歩き〜コヴェントガーデン行こうと思ったけど電池切れました。",
        "date": "2025-02-27"
      },
      {
        "videoId": "eiGpNEDFIe4",
        "title": "【あと3日】ロンドン適当歩き",
        "date": "2025-02-28"
      },
      {
        "videoId": "mUrzbMDosaI",
        "title": "ロンドンブリッジからロンドンアイまで歩きました。",
        "date": "2025-03-01"
      },
      {
        "videoId": "At9H2OwVyAc",
        "title": "【神回】ロンドン街歩き！名物市場から、博物館、ハリー・ポッターの聖地、絶景庭園まで一気に回る！",
        "date": "2025-03-02"
      }
    ],
    "エディンバラ": [
      {
        "videoId": "DOVZ-SqlER0",
        "title": "昨日の観光の振り返り。健康的な食事の紹介。イギリス・エディンバラのホステルで少し🤏",
        "date": "2025-01-20"
      },
      {
        "videoId": "DaNVPKIz7Ys",
        "title": "スコットランド名物「ショートブレッド」「ハギス」紹介。イギリス・エディンバラのホステルで少し🤏",
        "date": "2025-01-21"
      },
      {
        "videoId": "uo_bFhXjla8",
        "title": "イギリス・エディンバラのホステルで少し🤏",
        "date": "2025-01-22"
      }
    ],
    "グラスゴー": [
      {
        "videoId": "soIuHx1--BI",
        "title": "グラスゴー到着！不気味なホステル体験とジンジャーショットの衝撃。",
        "date": "2025-01-23"
      },
      {
        "videoId": "bW2PJln-5mA",
        "title": "イギリス・グラスゴー、一生に一度の嵐で大災害。。幽霊ホステルで少し🤏",
        "date": "2025-01-24"
      },
      {
        "videoId": "1qGn9cUznOM",
        "title": "【神回】イギリス・グラスゴー街歩き！ライブ感あふれる街で、博物館、ストリートアート、グルメを満喫！",
        "date": "2025-01-25"
      },
      {
        "videoId": "8wp0Ae4F6ks",
        "title": "スカスカクッキー食べながら精神と時の部屋でお絵描き⛄️イギリス・グラスゴーの幽霊ホステルで少し🤏",
        "date": "2025-01-26"
      },
      {
        "videoId": "QTlQ34SCEEs",
        "title": "イギリス・グラスゴーのホステル鍵が壊れてて中に入れませんでした。有給取得代行サービス開始します。老後は桜を追いかけたい。",
        "date": "2025-01-27"
      },
      {
        "videoId": "3BGhCOanPbA",
        "title": "寝れんから深夜のヨーロッパを散策",
        "date": "2025-01-28"
      },
      {
        "videoId": "iaz-gO_NK8M",
        "title": "元気になった視聴者さんおかえり！元気じゃなくなった視聴者さんお大事に、、イギリス・グラスゴーの幽霊ホステルで少し🤏",
        "date": "2025-01-28"
      },
      {
        "videoId": "YycnZT-cMeo",
        "title": "奇跡が起きました。グラスゴーが晴れてます",
        "date": "2025-01-29"
      },
      {
        "videoId": "SwiwzGx_y-0",
        "title": "Glasgow 最後の配信😢 1月の総括と2月の予定",
        "date": "2025-01-30"
      }
    ],
    "リバプール": [
      {
        "videoId": "zDQm0D-YmGA",
        "title": "【神回】イギリスの港町リバプール街歩き！元世界遺産のドックと美術館・カフェを巡る旅！",
        "date": "2025-01-31"
      },
      {
        "videoId": "AEgScSlJ-h8",
        "title": "【緊急】ホステル、ミスりました",
        "date": "2025-02-01"
      },
      {
        "videoId": "J6e9dGj8KYQ",
        "title": "【感動】イギリスが綺麗すぎます",
        "date": "2025-02-07"
      }
    ],
    "チェスター": [
      {
        "videoId": "nKTakrtzWM8",
        "title": "イギリスの古都チェスターを歩く！城壁に囲まれた、黒白の美しい街並み、絶景リバーサイド散歩！",
        "date": "2025-02-01"
      },
      {
        "videoId": "u9jY4KyIHKQ",
        "title": "イギリス・チェスターのホステル、キッチンにコンロ無かったけど、卵サンド食べてみた",
        "date": "2025-02-03"
      },
      {
        "videoId": "uJW8td9_qzY",
        "title": "バイバイ愛靴👞！イギリスで日本に国際郵送してみた。",
        "date": "2025-02-04"
      },
      {
        "videoId": "Cn24SbkDqG0",
        "title": "ドイツに行くことになりました。ひめひめありがとう。ゴッドさん夜中に川遊び危ないよ。1000年後にこの時代は何といわれてるでしょう。イギリス・チェスターのホステルで少し🤏",
        "date": "2025-02-05"
      },
      {
        "videoId": "lbK3rhH7ksw",
        "title": "イギリス・バーミンガムに移動前に少し🤏",
        "date": "2025-02-06"
      }
    ],
    "バーミンガム": [
      {
        "videoId": "kf8ZLyVf4t8",
        "title": "イギリスの大阪・バーミンガム来たけど、今のところ嫌いです",
        "date": "2025-02-07"
      },
      {
        "videoId": "8aRncmOfBL8",
        "title": "【神回】イギリスの第二の都市、バーミンガムを歩く！#カレーの聖地  #運河 #美術館 #ネオゴシック建築",
        "date": "2025-02-08"
      },
      {
        "videoId": "5_zIl5EvcMo",
        "title": "イギリスで鶏肉買いにいこー",
        "date": "2025-02-09"
      },
      {
        "videoId": "5D_7RU9cX8A",
        "title": "ほな、イギリス鶏、丸ごと焼いたので食べていきまーす！",
        "date": "2025-02-10"
      },
      {
        "videoId": "G0v78SOLkJM",
        "title": "イギリスで知り合った友達とバーミンガールを探しに行きました。綺麗な運河をご覧あれ😯",
        "date": "2025-02-11"
      },
      {
        "videoId": "ARqKYfJv5lA",
        "title": "イギリス・バーミンガムでバスに乗る前に少し",
        "date": "2025-02-12"
      }
    ],
    "バース": [
      {
        "videoId": "ReLkkIUogWM",
        "title": "バース着いたけど、結構街並み綺麗やん！",
        "date": "2025-02-13"
      },
      {
        "videoId": "8Hhmi6vk0QY",
        "title": "前編【神回】イギリスの温泉街、バースが美しすぎた！ローマ時代の遺跡、世界遺産の街、絶品アフタヌーンティーが最高すぎた。",
        "date": "2025-02-15"
      },
      {
        "videoId": "2lSA1CP1NK8",
        "title": "後編【神回】イギリスの温泉街、バースが美しすぎた！ローマ時代の遺跡、世界遺産の街、絶品アフタヌーンティーが最高すぎた。",
        "date": "2025-02-15"
      },
      {
        "videoId": "lm4dJAF5Szs",
        "title": "【祝400人】イギリス・バースを歩きながら、昨日の観光の思い出に浸ります😌",
        "date": "2025-02-16"
      },
      {
        "videoId": "UvnLjPgMqas",
        "title": "イギリス・バースで すねちゃま タワーが建設されました。",
        "date": "2025-02-17"
      },
      {
        "videoId": "mQGd2ExytYI",
        "title": "イギリス・バースをお散歩してたら、海外初マクドに行きました",
        "date": "2025-02-18"
      },
      {
        "videoId": "GRybphC3mkg",
        "title": "イギリスのバースからブリストルに移動します",
        "date": "2025-02-19"
      }
    ],
    "ブリストル": [
      {
        "videoId": "GRybphC3mkg",
        "title": "イギリスのバースからブリストルに移動します",
        "date": "2025-02-19"
      },
      {
        "videoId": "sZJugOI_Zj0",
        "title": "イギリス・ブリストルのネズミホステルを紹介します🐀",
        "date": "2025-02-20"
      },
      {
        "videoId": "RrvA0YA7SdQ",
        "title": "イギリス・ブリストルのネズミホステルで少し🐀",
        "date": "2025-02-21"
      },
      {
        "videoId": "iI35QPmp8x8",
        "title": "【神回】イギリスの港町ブリストルへ！バンクシーの壁画巡り＆絶景の吊橋が映えすぎた！？🎨🕵️‍♂️",
        "date": "2025-02-22"
      },
      {
        "videoId": "SkT5fy70EcM",
        "title": "イギリス編終了まであと8日。イギリス・ブリストルのネズミホステルで少し🐀",
        "date": "2025-02-23"
      },
      {
        "videoId": "9MS46IgQsWs",
        "title": "快晴と共に、バイバイブリストル😢バス乗る前に少し🤏",
        "date": "2025-02-24"
      }
    ]
  },
  "turkey": {
    "イスタンブール": [
      {
        "videoId": "iv2max-f4QU",
        "title": "ケルン・ボン空港着きました",
        "date": "2025-03-30"
      },
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
        "videoId": "vbagkjbCw4Q",
        "title": "トルコ🇹🇷 でおじさんとデートしたけどブチギレて帰った話をします",
        "date": "2025-03-31"
      },
      {
        "videoId": "Q2nn9RXxN7Q",
        "title": "【祝8万投げ銭】トルコ🇹🇷イスタンブールでスーパーの買い物紹介をしました",
        "date": "2025-04-01"
      },
      {
        "videoId": "N_fP2AHIfis",
        "title": "トルコ🇹🇷イスタンブールでスーパーマーケットに行ってみた",
        "date": "2025-04-02"
      },
      {
        "videoId": "Far6D8kifM4",
        "title": "トルコ🇹🇷イスタンブールでアヤソフィアに行きました。",
        "date": "2025-04-03"
      },
      {
        "videoId": "x8Kbm9dDpYg",
        "title": "【祝500人🎊】トルコ🇹🇷イスタンブールでブルーモスクを見に行きます",
        "date": "2025-04-04"
      },
      {
        "videoId": "hhW0LTh3xIw",
        "title": "【神回】トルコの渋谷？タクシム広場から、空と街が交差するガラタ塔まで！イスタンブール街歩き配信！",
        "date": "2025-04-05"
      },
      {
        "videoId": "6_2Pw1uIDqI",
        "title": "トルコ🇹🇷イスタンブールでチャンネル登録500人を祝います",
        "date": "2025-04-06"
      },
      {
        "videoId": "J_l0cVwfMPo",
        "title": "トルコ🇹🇷イスタンブールで中東周遊の予定が決まりました。そしてブルーモスクリベンジします。",
        "date": "2025-04-07"
      },
      {
        "videoId": "t0VuytEmnaI",
        "title": "トルコ🇹🇷イスタンブールでグランドバザールに行ってみた",
        "date": "2025-04-08"
      },
      {
        "videoId": "itQ8b_XeK0U",
        "title": "トルコアイス食べてみた",
        "date": "2025-04-09"
      },
      {
        "videoId": "OwYKr6Hc8V4",
        "title": "トルコ石💎を見に行きました",
        "date": "2025-04-10"
      },
      {
        "videoId": "UULcHjBHSJM",
        "title": "【神回】トルコ🇹🇷イスタンブールでアジア側にいってみた",
        "date": "2025-04-11"
      },
      {
        "videoId": "nJzo0OMugaM",
        "title": "トルコ🇹🇷イスタンブールで エジプシャン・バザール行ってみた",
        "date": "2025-04-12"
      },
      {
        "videoId": "7Amy9E2U7wo",
        "title": "バイバイ👋トルコ🇹🇷",
        "date": "2025-04-13"
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
      },
      {
        "videoId": "esevUsePhMQ",
        "title": "キプロス🇨🇾ニコシアで朝まで山本太郎と経済議論しました",
        "date": "2025-04-17"
      },
      {
        "videoId": "BQ48Dr5peDI",
        "title": "キプロス🇨🇾ニコシアで少し",
        "date": "2025-04-18"
      },
      {
        "videoId": "VB1x0w4ejdo",
        "title": "【神回】ヨーロッパ最後の分断都市キプロスの首都ニコシアをガチで歩いたら…古代遺物と絶品グリルで満腹＆満足の1日だった🇨🇾",
        "date": "2025-04-19"
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
        "videoId": "RmJDoe6U5Yw",
        "title": "ホットドッグを食べながら、キプロス🇨🇾ラルナカ の思い出に浸りました。",
        "date": "2025-04-22"
      },
      {
        "videoId": "Yt9CxWsY0iE",
        "title": "キプロス🇨🇾ラルナカバイバイ。空港へ向かいます。",
        "date": "2025-04-23"
      },
      {
        "videoId": "WKfpFfA1OI4",
        "title": "キプロス🇨🇾ラルナカ空港着きました",
        "date": "2025-04-23"
      },
      {
        "videoId": "QrgoRk4F-D4",
        "title": "一ヶ月ぶりのヨーロッパに涙が止まりません。キプロス🇨🇾ラルナカで、エジプトとヨーロッパの違いを100個探しました",
        "date": "2025-05-22"
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
      },
      {
        "videoId": "QeD5XWpAzRc",
        "title": "キプロス🇨🇾パフォスで糸電話語りました",
        "date": "2025-05-26"
      }
    ]
  },
  "egypt": {
    "カイロ": [
      {
        "videoId": "pXWS_86re8c",
        "title": "エジプト🇪🇬着いたらトラブルだらけでした😢",
        "date": "2025-04-24"
      },
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
        "videoId": "jU-GSP8M4Q8",
        "title": "エジプト🇪🇬で詐欺に遭いました",
        "date": "2025-04-26"
      },
      {
        "videoId": "hwJOAa5Kt8U",
        "title": "【神回】エジプト🇪🇬 ラクダで行くピラミッドの絶景！エジプト料理で謝肉祭！博物館で古代ロマン旅！",
        "date": "2025-04-26"
      },
      {
        "videoId": "GKLTbjA32MI",
        "title": "エジプト🇪🇬カイロのホテルを紹介します",
        "date": "2025-04-27"
      },
      {
        "videoId": "xuC2Qbr3wpE",
        "title": "エジプト🇪🇬料理のコシャリを食べました",
        "date": "2025-04-28"
      },
      {
        "videoId": "Y-EvbeBomrU",
        "title": "【長時間】㊗️なにこれオーディオガイド、お試し版公開！！！エジプト🇪🇬ぷらり",
        "date": "2025-04-29"
      },
      {
        "videoId": "yDU1TxMH31c",
        "title": "エジプトで友達が出来たので、コシャリ食べながらコラボします。",
        "date": "2025-05-08"
      },
      {
        "videoId": "Sw9gFWCvsfk",
        "title": "エジプト🇪🇬腐敗寿司🍣食べてみた",
        "date": "2025-05-15"
      },
      {
        "videoId": "ZcnUMu_O5Hw",
        "title": "エジプト🇪🇬カイロのローカルスーパー行ってみた",
        "date": "2025-05-16"
      },
      {
        "videoId": "mdua-Zf4tGU",
        "title": "【神回】エジプト・カイロ街歩き！ツタンカーメンに会ってきた！夜のハーン・ハリーリまで満喫する濃厚7時間LIVE",
        "date": "2025-05-17"
      },
      {
        "videoId": "w-37bBsF4w0",
        "title": "エジプト🇪🇬カイロでお遊び",
        "date": "2025-05-18"
      },
      {
        "videoId": "CcGFm1W6o44",
        "title": "エジプト🇪🇬カイロでiPhoneバッテリー交換しました〜",
        "date": "2025-05-19"
      },
      {
        "videoId": "MQqphJVUquc",
        "title": "エジプト🇪🇬最後に一ヶ月の思い出を振り返りました",
        "date": "2025-05-20"
      },
      {
        "videoId": "MR3dMdQG-6c",
        "title": "エジプト🇪🇬出国の航空券を間違えました。バイバイ👋",
        "date": "2025-05-21"
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
        "videoId": "iLNWFjrdVFw",
        "title": "GWエジプト祭前夜！エジプト🇪🇬ピザ🍕食べました",
        "date": "2025-05-02"
      },
      {
        "videoId": "NgRP5qSJry0",
        "title": "GWエジプト祭り1日目-ルクソール西岸 王家の谷エリア",
        "date": "2025-05-03"
      },
      {
        "videoId": "2zzbFQe52cc",
        "title": "GWエジプト祭り1日目-ルクソール西岸 王家の谷エリア",
        "date": "2025-05-03"
      },
      {
        "videoId": "cK0tttTZ3as",
        "title": "GWエジプト祭り2日目 - ルクソール東側 神殿巡りとラクダ飯",
        "date": "2025-05-04"
      },
      {
        "videoId": "plsWXBi4MVA",
        "title": "GW エジプト祭り、ありがとうございました！バイバイ🇪🇬ルクソール",
        "date": "2025-05-07"
      }
    ],
    "アスワン": [
      {
        "videoId": "bL9GKNX0J8M",
        "title": "GWエジプト祭り3日目 - アスワン巡り",
        "date": "2025-05-05"
      },
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
    "シワ": [
      {
        "videoId": "jX6NIopOoLY",
        "title": "エジプト🇪🇬シワ着きました〜",
        "date": "2025-05-09"
      },
      {
        "videoId": "h8mxqPKtVoo",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-10"
      },
      {
        "videoId": "TI2MBw1UTEQ",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-10"
      },
      {
        "videoId": "dRodwhG8esg",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-10"
      },
      {
        "videoId": "b0j3eqiK4jY",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-10"
      },
      {
        "videoId": "8jKvOuhS-Wc",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-10"
      },
      {
        "videoId": "QmUl3HrOOC4",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-10"
      },
      {
        "videoId": "x6s9FF_lNlI",
        "title": "【神回】エジプト・シワの隠れ塩湖とサハラ砂漠の夕焼けが神すぎた🌊",
        "date": "2025-05-11"
      },
      {
        "videoId": "cisSYeOGDUE",
        "title": "㊗️なにこれオーディオガイド リリース🎊",
        "date": "2025-05-11"
      },
      {
        "videoId": "oQaJUJLzRf8",
        "title": "エジプト🇪🇬パスタがうますぎたぁ🤤",
        "date": "2025-05-12"
      },
      {
        "videoId": "DldXnHtl2RI",
        "title": "エジプト🇪🇬シワで少し🤏",
        "date": "2025-05-13"
      },
      {
        "videoId": "AVJG-lUAZ8A",
        "title": "エジプト🇪🇬シワ ばいばい👋",
        "date": "2025-05-14"
      }
    ]
  },
  "jordan": {
    "アンマン": [
      {
        "videoId": "G6MZgV1kYeE",
        "title": "ヨルダン🇯🇴アマンの物価が高すぎた",
        "date": "2025-05-27"
      },
      {
        "videoId": "IWposViqyKw",
        "title": "ヨルダン🇯🇴アンマンのピザが最高すぎた",
        "date": "2025-05-28"
      },
      {
        "videoId": "NRQKj5-QcmQ",
        "title": "みんなで外食のお悩みを考えて、解決するアプリを作ろう〜",
        "date": "2025-06-06"
      },
      {
        "videoId": "f9j0z_OcZpo",
        "title": "【神回】ヨルダンの古都アンマン街歩き！城塞遺跡から激ウマグルメまで全部盛り☕🍴",
        "date": "2025-06-07"
      },
      {
        "videoId": "GEBiHHPB5VM",
        "title": "ヨルダン🇯🇴アンマンで死海の魅力を探りました",
        "date": "2025-06-08"
      },
      {
        "videoId": "sPY3pI3anw8",
        "title": "ヨルダン🇯🇴アンマンで激うまサンドイッチ食べてみた",
        "date": "2025-06-09"
      },
      {
        "videoId": "NZrmlN6SsL0",
        "title": "ヨルダン🇯🇴アンマン でファラフェル食べました",
        "date": "2025-06-10"
      },
      {
        "videoId": "29oBRzeiYek",
        "title": "ヨルダン🇯🇴アンマンで激うまピザ畳み食べました",
        "date": "2025-06-11"
      },
      {
        "videoId": "ecV-NgNSPKU",
        "title": "ヨルダン🇯🇴の首都で最大のモスク行ってみた",
        "date": "2025-06-12"
      },
      {
        "videoId": "P83YQna7Rns",
        "title": "もくもくアプリ作り配信を始めました〜👏",
        "date": "2025-06-13"
      },
      {
        "videoId": "BXmAc-rhfac",
        "title": "ヨルダン🇯🇴アンマンでこれからの配信について話してみた",
        "date": "2025-06-15"
      },
      {
        "videoId": "FFul9N286ts",
        "title": "緊急、ヨルダン🇯🇴から出国できなくなったのでケバブ食べます",
        "date": "2025-06-17"
      },
      {
        "videoId": "Z1kBaSiCJnk",
        "title": "ヨルダン🇯🇴アイスクリーム🍨食べてみた！",
        "date": "2025-06-20"
      },
      {
        "videoId": "Zbq3spq4aNI",
        "title": "【神回】イスラエルの隣国ヨルダンに行ってみた！緊張感MAXの首都アンマンに潜入街歩きしてみた。",
        "date": "2025-06-21"
      },
      {
        "videoId": "JsGBdZGn9PE",
        "title": "【神回】イスラエルの隣国ヨルダンに行ってみた！緊張感MAXの首都アンマンに潜入街歩きしてみた。",
        "date": "2025-06-21"
      },
      {
        "videoId": "i84NTPVAsu0",
        "title": "ヨルダン🇯🇴首都でホットドッグ（ビーフ🐮）食べました",
        "date": "2025-06-23"
      },
      {
        "videoId": "OFopb6KUWuc",
        "title": "ヨルダン🇯🇴アンマンでトーク配信",
        "date": "2025-06-24"
      }
    ],
    "ペトラ": [
      {
        "videoId": "IHLIhNV_y_k",
        "title": "ヨルダン🇯🇴ペトラつきました",
        "date": "2025-05-29"
      },
      {
        "videoId": "Wdk-RIQ0fzg",
        "title": "ヨルダン🇯🇴アンマンで少し",
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
      },
      {
        "videoId": "Jk8jWqh1iQU",
        "title": "【神回】ペトラ遺跡で限界街歩き！ペトラでシークを抜け、秘境モナストリー、ペトラ飯、夕日まで全部盛り！！",
        "date": "2025-05-31"
      },
      {
        "videoId": "_kEWvunKOfo",
        "title": "ヨルダン🇯🇴ペトラでお菓子探しました！",
        "date": "2025-06-01"
      },
      {
        "videoId": "j9I6IVo86w8",
        "title": "ヨルダン🇯🇴ペトラで中菓子食べてみた",
        "date": "2025-06-02"
      },
      {
        "videoId": "LLwAoluAk5I",
        "title": "ヨルダン🇯🇴中東菓子 part3",
        "date": "2025-06-03"
      },
      {
        "videoId": "WQoPrnF_x70",
        "title": "ヨルダン🇯🇴おもれえ",
        "date": "2025-06-04"
      },
      {
        "videoId": "X9aD51kD00Y",
        "title": "㊗️300本目、ヨルダン🇯🇴ペトラの大家族で飯食った話しました",
        "date": "2025-06-05"
      }
    ],
    "死海": [
      {
        "videoId": "Gj9w3wu3jfQ",
        "title": "【神回】ヨルダンの死海×絶景リゾート街歩き＆贅沢ランチLIVE！",
        "date": "2025-06-14"
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
      },
      {
        "videoId": "J3n_LknJ1Bs",
        "title": "アゼルバイジャン🇦🇿首都着きました〜",
        "date": "2025-07-01"
      },
      {
        "videoId": "znswyyM9yMQ",
        "title": "アゼルバイジャン🇦🇿首都を歩いてみました",
        "date": "2025-07-02"
      },
      {
        "videoId": "5NocPi8ceUE",
        "title": "アゼルバイジャン🇦🇿で重大発表します",
        "date": "2025-07-03"
      },
      {
        "videoId": "I-9ORIGJG-w",
        "title": "なにこれの新バージョンの紹介します。スーパー行きました。",
        "date": "2025-07-04"
      },
      {
        "videoId": "YvdLoprqbqE",
        "title": "アゼルバイジャン🇦🇿で詐欺に遭いました。最後の長時間配信は断念します。",
        "date": "2025-07-05"
      },
      {
        "videoId": "9Q1ghbbZDqs",
        "title": "アゼルバイジャン🇦🇿でニンニクましましましましましトマト作りました",
        "date": "2025-07-06"
      },
      {
        "videoId": "FkH518od11k",
        "title": "アゼルバイジャン🇦🇿でほりにしの悪口言いました",
        "date": "2025-07-07"
      },
      {
        "videoId": "CjTL9CgWP5I",
        "title": "アゼバイ🇦🇿フルーツ尽くし",
        "date": "2025-07-08"
      },
      {
        "videoId": "-gaULSsv63Y",
        "title": "㊗️なにこれオーディオガイド 大型アップデート！！！",
        "date": "2025-07-09"
      },
      {
        "videoId": "sI0UxhygwHg",
        "title": "アゼルバイジャン🇦🇿でトーク配信",
        "date": "2025-07-10"
      },
      {
        "videoId": "5RdUgq87ROI",
        "title": "アゼルバイジャン🇦🇿で華金しよう",
        "date": "2025-07-11"
      },
      {
        "videoId": "4fOkTVpRVpo",
        "title": "なにこれ2の不具合治りました〜🎉",
        "date": "2025-07-12"
      },
      {
        "videoId": "GggUxa1x9ig",
        "title": "アゼルバイジャン🇦🇿でケバブ食べました〜",
        "date": "2025-07-13"
      },
      {
        "videoId": "Iiu5ahlrso0",
        "title": "アゼルバイジャン🇦🇿でトーク配信",
        "date": "2025-07-14"
      },
      {
        "videoId": "hqWuJyxghfQ",
        "title": "まーた、海外の散髪、失敗されましたので、ピラフ食べました",
        "date": "2025-07-15"
      },
      {
        "videoId": "MS6fQfPDsDo",
        "title": "アゼルバイジャン🇦🇿風サラダ作りました",
        "date": "2025-07-16"
      },
      {
        "videoId": "_0MiXG6Qwsw",
        "title": "アゼルバイジャン🇦🇿風チキン無水スパイスカレー作りました",
        "date": "2025-07-17"
      },
      {
        "videoId": "eTs5G-G_4VQ",
        "title": "アゼルバイジャン国境越え part1 バス停までが辛すぎた",
        "date": "2025-07-18"
      },
      {
        "videoId": "FpyyOkxRjtc",
        "title": "アゼルバイジャン国境越え part2 平和な田舎車窓",
        "date": "2025-07-18"
      },
      {
        "videoId": "qCE9UhZb0xg",
        "title": "アゼルバイジャン国境越え part3 国境着きました",
        "date": "2025-07-18"
      }
    ]
  },
  "georgia": {
    "トビリシ": [
      {
        "videoId": "YP9D8CihaXg",
        "title": "【㊗️350本】ジョージア着いたけど最高すぎた",
        "date": "2025-07-19"
      },
      {
        "videoId": "NCb2zLT5s2A",
        "title": "ジョージア🇬🇪歩いたら、かなり綺麗な街でした",
        "date": "2025-07-20"
      },
      {
        "videoId": "zUfANoFB3Ao",
        "title": "ジョージア🇬🇪マーケットいきました",
        "date": "2025-07-21"
      },
      {
        "videoId": "YkGHXQywuUE",
        "title": "ジョージア🇬🇪で水餃子作りました",
        "date": "2025-07-22"
      },
      {
        "videoId": "LjAd3POCxtY",
        "title": "新アプリのデザイン初版ができました〜",
        "date": "2025-07-25"
      },
      {
        "videoId": "DEtaZ7dq2j4",
        "title": "ジョージア🇬🇪トビリシの旧市街行きました",
        "date": "2025-07-26"
      },
      {
        "videoId": "9y2f2W28dS0",
        "title": "アプリのデザインもっと良くしたいなぁ、、、",
        "date": "2025-07-27"
      },
      {
        "videoId": "d3sT8klxpf0",
        "title": "ジョージア🇬🇪でハンドスピナー買いました",
        "date": "2025-07-29"
      },
      {
        "videoId": "woTaKTXvVSk",
        "title": "ジョージア🇬🇪でひょんなことから街歩き",
        "date": "2025-07-30"
      },
      {
        "videoId": "cq4f4hH-1ak",
        "title": "アプリデザイン完成！このアプリの思い話しました。",
        "date": "2025-07-31"
      },
      {
        "videoId": "3yQH1ZKAte8",
        "title": "８月なってもーたなー",
        "date": "2025-08-01"
      },
      {
        "videoId": "_iPSj2D0Qk8",
        "title": "ジョージア🇬🇪の本当は言いたくない散歩ルート",
        "date": "2025-08-02"
      },
      {
        "videoId": "Mu7E2wfXNqU",
        "title": "最強の公園現る！？老若男女が遊び心と情熱を踊らせる",
        "date": "2025-08-03"
      },
      {
        "videoId": "aL_ApWXgWoM",
        "title": "カルボナーラの具材買いに行こ！",
        "date": "2025-08-04"
      },
      {
        "videoId": "GIyGaIhXt2M",
        "title": "カルボナーラつくろぞーー",
        "date": "2025-08-05"
      },
      {
        "videoId": "4XOOlEqbcQM",
        "title": "ギリギリ、トビリシ🇬🇪つきました",
        "date": "2025-08-13"
      },
      {
        "videoId": "w58l2PJu838",
        "title": "トビリシ🇬🇪の新しい場所歩いててみる",
        "date": "2025-08-14"
      },
      {
        "videoId": "KAgYIsACo50",
        "title": "㊗️700人ジョージア🇬🇪でパーティしました",
        "date": "2025-08-15"
      },
      {
        "videoId": "QieWHVc69q8",
        "title": "新アプリ「なにたべよ」の英語名が決まりました",
        "date": "2025-08-16"
      },
      {
        "videoId": "6bi2gCN4_dQ",
        "title": "なに食べよの アプリアイコン 完成しました〜",
        "date": "2025-08-17"
      },
      {
        "videoId": "yx0GnorR28s",
        "title": "トビリシに引っ越ししました〜",
        "date": "2026-02-18"
      },
      {
        "videoId": "WHltKU2sr3g",
        "title": "電波いい場所見つけたい。料理ランキングのご協力ありがとうございました！",
        "date": "2026-02-19"
      },
      {
        "videoId": "-SuFBcb2n4w",
        "title": "なに食べよ🍽️料理文言を綺麗にしよう！",
        "date": "2026-02-20"
      },
      {
        "videoId": "8SyKyMPpWNE",
        "title": "ここ景色いいんじゃない？",
        "date": "2026-02-21"
      },
      {
        "videoId": "YybNMUq8mpY",
        "title": "役所孝二デー",
        "date": "2026-02-23"
      },
      {
        "videoId": "Ihmf2aZru2Q",
        "title": "ホステルからこんばんは",
        "date": "2026-02-24"
      },
      {
        "videoId": "_fKdIvPAb3Y",
        "title": "暫定一位のMVSみっけ！",
        "date": "2026-02-25"
      },
      {
        "videoId": "Vo6jWb-cRys",
        "title": "風邪は寝て治せ！！！！",
        "date": "2026-02-27"
      },
      {
        "videoId": "WvBt6Smzezw",
        "title": "サンキュー二月",
        "date": "2026-02-28"
      },
      {
        "videoId": "Q7It0Xsv0so",
        "title": "三月突き進むぞーーー！！！タップタップ結果発表",
        "date": "2026-03-01"
      },
      {
        "videoId": "wGPUZ6qj-08",
        "title": "10万タップありがとうございました🏆",
        "date": "2026-03-02"
      },
      {
        "videoId": "RItASEhIuic",
        "title": "ここきれーやろ〜",
        "date": "2026-03-03"
      },
      {
        "videoId": "xXgh5RcI7Zk",
        "title": "チャットGPTプロになったよー",
        "date": "2026-03-04"
      },
      {
        "videoId": "3rKxNKHTzIc",
        "title": "ショート動画の議論ポイント思いついた！",
        "date": "2026-03-05"
      },
      {
        "videoId": "a47b3QbCPp8",
        "title": "いっぬとローラースケート",
        "date": "2026-03-07"
      },
      {
        "videoId": "6xXbt7j8eMk",
        "title": "5分だけ。携帯の充電がこわれたぁぁぁ😢",
        "date": "2026-03-08"
      },
      {
        "videoId": "65cHXjYLotA",
        "title": "そして復活",
        "date": "2026-03-08"
      },
      {
        "videoId": "FKwbdN7YOaw",
        "title": "ソラが治ったで〜",
        "date": "2026-03-09"
      },
      {
        "videoId": "JJ3Wooni8iQ",
        "title": "どうも寝坊太郎です",
        "date": "2026-03-10"
      },
      {
        "videoId": "aWFNSGUPGjg",
        "title": "㊗️10万再生行ってた笑 時代は鬼嫁かぁ",
        "date": "2026-03-11"
      },
      {
        "videoId": "cu9nnVyTnGk",
        "title": "やはり時代は鬼嫁かぁ🤨",
        "date": "2026-03-12"
      },
      {
        "videoId": "WlqTeMt4_80",
        "title": "動画作りたのぴーー",
        "date": "2026-03-13"
      },
      {
        "videoId": "cVfym8WxMK8",
        "title": "はっぴーほわいとでー、いつも感謝",
        "date": "2026-03-14"
      },
      {
        "videoId": "cH-oHRqut_k",
        "title": "世界で一番人気な観光地はどこでしょう？",
        "date": "2026-03-15"
      },
      {
        "videoId": "L1STwTHxrrw",
        "title": "三月も半分過ぎたけど、順調やなぁ〜",
        "date": "2026-03-16"
      },
      {
        "videoId": "_IY3uYK7PTs",
        "title": "アプリのインストールしてくれい",
        "date": "2026-03-18"
      },
      {
        "videoId": "RnVDTL-Rydc",
        "title": "やっとチャッピープロ使いこなしてきた！優秀すぎる！",
        "date": "2026-03-19"
      },
      {
        "videoId": "-e92y31em14",
        "title": "60本くらい量産したで。投稿できてなかったけど",
        "date": "2026-03-20"
      },
      {
        "videoId": "F7p6B99pLgA",
        "title": "コメントが止まらへん。鬼嫁が可哀想😢",
        "date": "2026-03-21"
      },
      {
        "videoId": "vj__iCxuq2c",
        "title": "夫婦喧嘩のリアリティを突き詰めたい",
        "date": "2026-03-22"
      },
      {
        "videoId": "47-oT3RFBd0",
        "title": "100万再生いったぞ〜〜〜",
        "date": "2026-03-23"
      },
      {
        "videoId": "c8MuA-kJ27E",
        "title": "なんとか、１アカウントしかバズらない壁超えた",
        "date": "2026-03-24"
      },
      {
        "videoId": "wptmmBCQwyk",
        "title": "そろそろ6時間配信が近づいてきた（土曜日）",
        "date": "2026-03-25"
      },
      {
        "videoId": "X2yZdY--NU4",
        "title": "水治ったーぞぉー",
        "date": "2026-03-26"
      },
      {
        "videoId": "H9NWRe8ZSPU",
        "title": "明日19時から6時間配信やぁー",
        "date": "2026-03-27"
      },
      {
        "videoId": "fSYAepSlDLI",
        "title": "三月の6時間配信やぁー",
        "date": "2026-03-28"
      },
      {
        "videoId": "Yh6XVwHP5_w",
        "title": "結果発表ーーー",
        "date": "2026-03-29"
      },
      {
        "videoId": "VaHG34v5NkY",
        "title": "なに食べたいでマクドナルドってありですか？",
        "date": "2026-03-30"
      },
      {
        "videoId": "qDZgufMBneg",
        "title": "なに食べたい？",
        "date": "2026-04-02"
      },
      {
        "videoId": "C3seZQMQW-4",
        "title": "ショート動画のターゲット年齢層を下げたい",
        "date": "2026-04-03"
      },
      {
        "videoId": "XxbBjIRAAjg",
        "title": "自分へのご褒美の外食教えて",
        "date": "2026-04-06"
      },
      {
        "videoId": "D9laHqPK-2c",
        "title": "今食べたい外食教えて",
        "date": "2026-04-07"
      },
      {
        "videoId": "Jlw1LU4mc10",
        "title": "アルメニアバス探し",
        "date": "2026-04-08"
      },
      {
        "videoId": "d9phGPq13ZU",
        "title": "アルメニアは4月19日から！",
        "date": "2026-04-09"
      },
      {
        "videoId": "SX2E0nu46wI",
        "title": "アルメニア料理が美味いらしい",
        "date": "2026-04-10"
      },
      {
        "videoId": "Uq75BH43Uug",
        "title": "半世紀ぶりに人類が月を周回したらしい",
        "date": "2026-04-11"
      },
      {
        "videoId": "6xJcC1XELZo",
        "title": "海外１．５周年！",
        "date": "2026-04-12"
      },
      {
        "videoId": "0H3Ub8AE7ho",
        "title": "アルメニア料理が気になる第二弾",
        "date": "2026-04-13"
      },
      {
        "videoId": "Wkv9JwnXV94",
        "title": "靴探してたらこんな時間や",
        "date": "2026-04-14"
      },
      {
        "videoId": "OeptOBqm1dY",
        "title": "ショッピングモールなう",
        "date": "2026-04-15"
      },
      {
        "videoId": "Ok9A9TwRm40",
        "title": "日向ぼっこしてたらこんな時間や",
        "date": "2026-04-15"
      },
      {
        "videoId": "Viq9Nn-Q2Eo",
        "title": "やらかした！ジムが無くなった",
        "date": "2026-04-15"
      },
      {
        "videoId": "K3Ox6Yf0LWc",
        "title": "【失敗】シュクメルリパスタ作って大食いして見た",
        "date": "2026-04-16"
      },
      {
        "videoId": "xTRLyM9Pzxg",
        "title": "今度こそシュクメルリパスタ作って大食いして見た",
        "date": "2026-04-17"
      },
      {
        "videoId": "yab3DX7lsRM",
        "title": "散歩配信1日目　自分探し",
        "date": "2026-04-18"
      },
      {
        "videoId": "ozaA0GxFsF8",
        "title": "トビリシラスト",
        "date": "2026-04-18"
      },
      {
        "videoId": "yigfotjv218",
        "title": "ジョージア帰ってきました！！！",
        "date": "2026-05-23"
      },
      {
        "videoId": "nzf06yFqIkk",
        "title": "ジョージア風フレンチトーストの材料探しにマーケットいきます",
        "date": "2026-05-24"
      },
      {
        "videoId": "Ub1u-839v48",
        "title": "ジョージアの独立記念日らしい",
        "date": "2026-05-26"
      },
      {
        "videoId": "PPV__MJmo8A",
        "title": "月末配信の企画会議やぁ",
        "date": "2026-05-27"
      },
      {
        "videoId": "rhbmk1Cx-5Q",
        "title": "なに食べよ 料理提案アップデート 2,000本ノック",
        "date": "2026-05-28"
      },
      {
        "videoId": "ZNe1ip-3SFg",
        "title": "りりーすできた！",
        "date": "2026-05-29"
      },
      {
        "videoId": "zLIQ9yySAas",
        "title": "5月の月末配信！良い1ヶ月だった！",
        "date": "2026-05-31"
      },
      {
        "videoId": "1S4oRJ7we5Q",
        "title": "タップタップ結果発表！！！",
        "date": "2026-06-01"
      },
      {
        "videoId": "tAzhhh0cZMg",
        "title": "最新のショートがあかんかんじや",
        "date": "2026-06-05"
      },
      {
        "videoId": "j9le-e_raKA",
        "title": "明日湖いこか！",
        "date": "2026-06-06"
      },
      {
        "videoId": "XvM9McCVK48",
        "title": "トビリシ海まで歩きます",
        "date": "2026-06-07"
      },
      {
        "videoId": "CivhSffnPXE",
        "title": "トビリシ海まで歩きます",
        "date": "2026-06-07"
      },
      {
        "videoId": "7msFTwtmLrE",
        "title": "ジョージア風お好み焼きを作ります！",
        "date": "2026-06-12"
      },
      {
        "videoId": "mEEkYx2hKFk",
        "title": "ジョージアのロープウェイ乗りたい",
        "date": "2026-06-13"
      },
      {
        "videoId": "B-q2T09qPig",
        "title": "ジョージアのロープウェイいこか",
        "date": "2026-06-16"
      },
      {
        "videoId": "k3fmojcipn8",
        "title": "ジョージアのシアター前公園なう",
        "date": "2026-06-20"
      },
      {
        "videoId": "ZBWzE7WKIsk",
        "title": "ジョージアのリシ湖いこか！",
        "date": "2026-06-21"
      },
      {
        "videoId": "p6dOZMX2lAE",
        "title": "ジョージア風釜玉チーズうどん作ります",
        "date": "2026-06-26"
      },
      {
        "videoId": "qnOk5802V0o",
        "title": "ジョージアは晴れとるわ！月末配信の企画会議",
        "date": "2026-06-27"
      },
      {
        "videoId": "anL82TSPG4c",
        "title": "６月末配信！なかなか素晴らしい1ヶ月やったんちゃう？",
        "date": "2026-06-28"
      },
      {
        "videoId": "nvm2i_dWnN8",
        "title": "６月末タップ結果発表！！！",
        "date": "2026-06-29"
      },
      {
        "videoId": "4uICARYwXbY",
        "title": "ジョージア風ガレット作ります！",
        "date": "2026-07-03"
      },
      {
        "videoId": "zQJSiKL0D3U",
        "title": "ジョージア風クレープ作ります！",
        "date": "2026-07-04"
      },
      {
        "videoId": "I5O7KhOAuV0",
        "title": "ジョージア風コロッケのたねつくる",
        "date": "2026-07-08"
      },
      {
        "videoId": "e-UXOUdzTLU",
        "title": "ジョージア風コロッケの作るで！",
        "date": "2026-07-09"
      },
      {
        "videoId": "8I2AUKaWgH4",
        "title": "ジョージアで週末の企画会議や",
        "date": "2026-07-10"
      },
      {
        "videoId": "Pnbi01M0t0I",
        "title": "土曜やしトビリシ海まで歩こか！",
        "date": "2026-07-11"
      },
      {
        "videoId": "UeDyvW4zAgo",
        "title": "ジョージア風今週のふりかえり",
        "date": "2026-07-12"
      },
      {
        "videoId": "8FwBXXD97Ik",
        "title": "新企画！ルーレットで行く！ジョージアぶらり旅",
        "date": "2026-07-19"
      },
      {
        "videoId": "d8UwWnFhjwY",
        "title": "7月の月末配信や！！アツい1ヶ月だった！朝日みるぞ！",
        "date": "2026-07-26"
      },
      {
        "videoId": "7oWA7JEZC6k",
        "title": "7月タップタップ結果発表！！",
        "date": "2026-07-27"
      },
      {
        "videoId": "UTjTmiiyq00",
        "title": "今週の企画会議や！おもろい一週間にしよう！！！",
        "date": "2026-07-28"
      },
      {
        "videoId": "ri3_F6zhtDA",
        "title": "今週の企画会議や！おもろい一週間にしよう！！！",
        "date": "2026-07-29"
      },
      {
        "videoId": "HcZSRjh2awM",
        "title": "アプリ作り配信！品質を底上げするぞーー！！",
        "date": "2026-08-01"
      },
      {
        "videoId": "ipb-A26Y1Zk",
        "title": "よしかえろか",
        "date": "2026-08-16"
      },
      {
        "videoId": "Td0AVFbSLk8",
        "title": "トビリシカムバックやぁーー",
        "date": "2026-08-17"
      },
      {
        "videoId": "xo1eYfB4RyU",
        "title": "ジョージア料理オジャフリつくろーー！！",
        "date": "2026-08-21"
      },
      {
        "videoId": "rzPoxwfm5lI",
        "title": "アプリ作り配信や！アプリの第一印象をめっちゃよくする！",
        "date": "2026-08-22"
      },
      {
        "videoId": "v3L539GafQo",
        "title": "海外の山の上の湖まで歩きます",
        "date": "2026-08-23"
      },
      {
        "videoId": "5YgHVahb9DQ",
        "title": "今日なにしよかー！月末配信なにしよー！、",
        "date": "2026-08-25"
      },
      {
        "videoId": "F7iiCj2EXXg",
        "title": "はいっ、8月月末配信でございます。",
        "date": "2026-08-29"
      },
      {
        "videoId": "jWHxbg9IUOE",
        "title": "今月の集大成！！アプリを大型アップデートします！！",
        "date": "2026-08-30"
      },
      {
        "videoId": "KEW0_QbKEZc",
        "title": "さてさてさてさて、タップタップ結果発表～",
        "date": "2026-08-31"
      },
      {
        "videoId": "IGZMcJAIkyE",
        "title": "日本スーパーいきます",
        "date": "2026-09-01"
      },
      {
        "videoId": "5-1bHix5X1s",
        "title": "おしんこつくろかーー！！",
        "date": "2026-09-03"
      },
      {
        "videoId": "TGO_a-3ZwHM",
        "title": "チキンカツトジ丼作ります！重大発表もあるよん",
        "date": "2026-09-04"
      },
      {
        "videoId": "lf2lSHbFeVg",
        "title": "配信丸わかりサイト(あやと島)作ろう！&北欧旅企画会議",
        "date": "2026-09-05"
      },
      {
        "videoId": "q30MlzefQ8c",
        "title": "ジョージアのワインフェス見に行きます！！ジョージア最後の町歩き",
        "date": "2026-09-06"
      },
      {
        "videoId": "P42mKwqpTLM",
        "title": "今週の作戦会議や！！",
        "date": "2026-09-08"
      },
      {
        "videoId": "l5ODV6hfCLQ",
        "title": "北欧旅まであと２日！トトロクッキング！",
        "date": "2026-09-09"
      },
      {
        "videoId": "MLFOSFG_Y80",
        "title": "北欧旅まであと1日！最後のクッキング！！",
        "date": "2026-09-10"
      },
      {
        "videoId": "kyzCpe5Znyk",
        "title": "海外二周年&ジョーシアバイバイ&北欧旅スタート！",
        "date": "2026-09-11"
      }
    ],
    "クタイシ": [
      {
        "videoId": "6rVECMwSETY",
        "title": "【速報】メスティア去りました",
        "date": "2025-08-28"
      },
      {
        "videoId": "V--SWER849g",
        "title": "クタイシの旧市街でケバブ食べました",
        "date": "2025-08-29"
      },
      {
        "videoId": "cy3iStRhvyw",
        "title": "なに食べよ のストア提出が出来ました！",
        "date": "2025-08-30"
      },
      {
        "videoId": "3YtMCGsAcRo",
        "title": "なに食べよ のAndroid 審査通りました〜🎉",
        "date": "2025-08-31"
      },
      {
        "videoId": "tPOLs4S2QJs",
        "title": "クタイシ移動しました",
        "date": "2025-09-01"
      },
      {
        "videoId": "LjE5Zen0f7g",
        "title": "㊗️なに食べよがリリースされました！！",
        "date": "2025-09-02"
      },
      {
        "videoId": "JNQ_49dkuQw",
        "title": "ついに！！クタイシでチーズパン食べました",
        "date": "2025-09-03"
      },
      {
        "videoId": "Qm98Wa2_zjc",
        "title": "クタイシ最後",
        "date": "2025-09-04"
      }
    ],
    "ズグディディ": [
      {
        "videoId": "JGa1gEuy77U",
        "title": "なに食べよ のストアデザイン出来ました〜",
        "date": "2025-08-18"
      },
      {
        "videoId": "sIoI9BPfNkk",
        "title": "ズグディディ🇬🇪が最高すぎるんですけど！",
        "date": "2025-08-19"
      },
      {
        "videoId": "ykcZvvB1_wY",
        "title": "㊗️投げ銭４万円突破！植物園行きました！",
        "date": "2025-08-20"
      },
      {
        "videoId": "fVGk-fQPROA",
        "title": "ズグディディ🇬🇪でピザ食べよーぜ",
        "date": "2025-08-21"
      },
      {
        "videoId": "BS7pYvn_n-Y",
        "title": "ズグディディ🇬🇪でマーケットみてみる",
        "date": "2025-08-22"
      },
      {
        "videoId": "ca8CTULcVHc",
        "title": "ズグディディ🇬🇪をひたすら歩きました",
        "date": "2025-08-23"
      },
      {
        "videoId": "zaixtD2jZUA",
        "title": "ズグディディ🇬🇪でチーズパン探しました",
        "date": "2025-08-24"
      }
    ],
    "メスティア": [
      {
        "videoId": "oynMc1ExBaU",
        "title": "メスティア着いたらリゾート地だった",
        "date": "2025-08-25"
      },
      {
        "videoId": "-o85VHYmVII",
        "title": "メスティア 今のところ嫌いです。チーズパン屋がありません。",
        "date": "2025-08-26"
      },
      {
        "videoId": "xPoHFV5FWXY",
        "title": "メスティアが嫌すぎるので瞑想しました",
        "date": "2025-08-27"
      },
      {
        "videoId": "6rVECMwSETY",
        "title": "【速報】メスティア去りました",
        "date": "2025-08-28"
      }
    ],
    "カズベキ": [
      {
        "videoId": "YgOufRU6Hqo",
        "title": "カズベキ着きました〜",
        "date": "2025-08-06"
      },
      {
        "videoId": "bTsb_jKV5Yo",
        "title": "カズベキの街を見に行きました",
        "date": "2025-08-07"
      },
      {
        "videoId": "PaxO-Ywl2C4",
        "title": "ゲルゲティ三位一体教会いきましたー",
        "date": "2025-08-08"
      },
      {
        "videoId": "7GyiSsW25Oc",
        "title": "カズベキの滝を探しに行きました",
        "date": "2025-08-09"
      },
      {
        "videoId": "d8DnZ_S586s",
        "title": "カズベキ🇬🇪の渓谷見に行ったらトラブルだけだった",
        "date": "2025-08-10"
      },
      {
        "videoId": "8KA1PR2_Zqc",
        "title": "カズベキ🇬🇪のスイミングプールが綺麗すぎた",
        "date": "2025-08-11"
      },
      {
        "videoId": "QUdnVt2KmEY",
        "title": "カズベキ🇬🇪の山登りが絶景すぎた",
        "date": "2025-08-12"
      },
      {
        "videoId": "v1PRwv1CWO0",
        "title": "ジョージアのバカでか山までいきます",
        "date": "2026-08-02"
      },
      {
        "videoId": "BOIgBzOpCjg",
        "title": "カズヘキ着きましたーーー",
        "date": "2026-08-03"
      },
      {
        "videoId": "LdgTh1DC3Jk",
        "title": "ジョージアの山の中の滝行こ",
        "date": "2026-08-04"
      },
      {
        "videoId": "1QyrfgL0Tek",
        "title": "カズベキで企画会議や！ホステル紹介も！",
        "date": "2026-08-05"
      },
      {
        "videoId": "jwh1FeaQwzE",
        "title": "カズベキでアクアパッツァの材料買います",
        "date": "2026-08-06"
      },
      {
        "videoId": "dkmw3DHDMX4",
        "title": "カズベキでアクアパッツァつくるぞー！",
        "date": "2026-08-07"
      },
      {
        "videoId": "qxanAsHsufU",
        "title": "アプリ作り配信！お店提案を作り直したい！",
        "date": "2026-08-08"
      },
      {
        "videoId": "53OdLlM6VIU",
        "title": "世界で一番天国に近い教会行こ",
        "date": "2026-08-09"
      },
      {
        "videoId": "o3QVUx15mg4",
        "title": "世界で一番天国に近い教会行こ",
        "date": "2026-08-09"
      },
      {
        "videoId": "q9spJNn9Glk",
        "title": "今週も楽しもう！！",
        "date": "2026-08-10"
      },
      {
        "videoId": "dRXae0mJw8M",
        "title": "企画会議や！！",
        "date": "2026-08-11"
      },
      {
        "videoId": "lPCx2VMe4pc",
        "title": "カズベキの滝見に行こ！カズ滝",
        "date": "2026-08-12"
      },
      {
        "videoId": "mXs3RCOS1JQ",
        "title": "マルゲリータピザの材料買いに行こ",
        "date": "2026-08-13"
      },
      {
        "videoId": "9WpNkeeUWs0",
        "title": "マルゲリータピザのつくるぞ！！",
        "date": "2026-08-14"
      },
      {
        "videoId": "GU_Yuc2Vn5s",
        "title": "アプリ作り配信！！お店の料理画像見つけるのがつらすぎる(涙)",
        "date": "2026-08-15"
      },
      {
        "videoId": "X9_x5stfZ7s",
        "title": "よしかえろか",
        "date": "2026-08-16"
      }
    ],
    "ボルジョミ": [
      {
        "videoId": "vPgcesGxtvY",
        "title": "ボルジョミ着きましたー",
        "date": "2025-09-05"
      },
      {
        "videoId": "l-px7j-mt3I",
        "title": "ボルジョミの滝いこ！",
        "date": "2025-09-06"
      },
      {
        "videoId": "n2cVA2HMm8g",
        "title": "ボルジョミの祭りがエグいらしい",
        "date": "2025-09-07"
      },
      {
        "videoId": "dVXvBi5NWvE",
        "title": "ボルジョミが寒すぎます",
        "date": "2025-09-08"
      },
      {
        "videoId": "OX63UIMQWcE",
        "title": "ボルジョミでドネ3連単",
        "date": "2025-09-09"
      },
      {
        "videoId": "-sMwQMM2STc",
        "title": "ボルジョミで謎パン食べました",
        "date": "2025-09-10"
      },
      {
        "videoId": "EmkhjSHh0DI",
        "title": "㊗️日本出て一年",
        "date": "2025-09-11"
      },
      {
        "videoId": "TLBRBVpJb-0",
        "title": "㊗️海外旅始まって1年",
        "date": "2025-09-12"
      },
      {
        "videoId": "NHUTssBNzWM",
        "title": "【雑談】ベルサイユ宮殿に住みたいです😭",
        "date": "2025-09-13"
      },
      {
        "videoId": "sLDRlfWFKjo",
        "title": "ボルジョミで世界一周を企んでます",
        "date": "2025-09-14"
      },
      {
        "videoId": "ZBMv2cibehQ",
        "title": "【雑談】ロシアのおばちゃんが朝ごはん作ってくれます",
        "date": "2025-09-15"
      },
      {
        "videoId": "XdHzSekg0KM",
        "title": "ボルジョミで温泉観に行く",
        "date": "2025-09-16"
      },
      {
        "videoId": "TNoTqAoRsj8",
        "title": "遂にボルジョミウォーターを飲んでみる",
        "date": "2025-09-17"
      },
      {
        "videoId": "qlKbYLwHk-U",
        "title": "リベンジ！ボルジョミレモネードを飲んでみる",
        "date": "2025-09-18"
      }
    ],
    "バトゥミ": [
      {
        "videoId": "XyPrrtjDKnE",
        "title": "バトゥミに着けるか不安すぎた🫤けど、なんとかついた",
        "date": "2025-09-19"
      },
      {
        "videoId": "8i0IM3bLrxU",
        "title": "バトゥミで大荒れの黒海を観に行きました",
        "date": "2025-09-20"
      },
      {
        "videoId": "TzjlXrz1jMY",
        "title": "バトゥミで少し",
        "date": "2025-09-21"
      },
      {
        "videoId": "aS5lLR8iCMs",
        "title": "バトゥミ HAPPY DAY でフェスティバルに行ってみた",
        "date": "2025-09-22"
      },
      {
        "videoId": "SEG85OZzU0I",
        "title": "バトゥミの美しい景色を見に行こう",
        "date": "2025-09-23"
      },
      {
        "videoId": "lWYu2B8Nob8",
        "title": "バトゥミ TAP DAY!",
        "date": "2025-09-24"
      },
      {
        "videoId": "pAF1PbSdyts",
        "title": "【雑談】愛猫が僕のベットで勝手に寝ます",
        "date": "2025-09-25"
      },
      {
        "videoId": "8uNsbtjX1SQ",
        "title": "【雑談】謎のボードゲーム、ドミノでトルコのイケおじに勝ちました",
        "date": "2025-09-26"
      },
      {
        "videoId": "Q7WR1notveY",
        "title": "【雑談】イケおじ再現情報商材はじめました",
        "date": "2025-09-27"
      },
      {
        "videoId": "2ekSjK7YSew",
        "title": "黒海リベンジやぁ！！！",
        "date": "2025-09-28"
      },
      {
        "videoId": "mhfMjduh-jQ",
        "title": "【雑談】引っ越しすることになりました",
        "date": "2025-09-29"
      },
      {
        "videoId": "1DHj5fC_1Qo",
        "title": "【雑談】愛猫（ラブブ）はお引越しに連れて行けるのか😱",
        "date": "2025-09-30"
      },
      {
        "videoId": "27Rfk_Jpdkk",
        "title": "【雑談】お引越しなう",
        "date": "2025-10-01"
      },
      {
        "videoId": "X3lNZTd42w4",
        "title": "【雑談】お引越し終わり",
        "date": "2025-10-02"
      },
      {
        "videoId": "edjPErVtO9c",
        "title": "バトゥミの夕日を見に行きました🌇",
        "date": "2025-10-03"
      },
      {
        "videoId": "GA1A6K1c6vk",
        "title": "【雑談】狂犬病ワクチン打ちました",
        "date": "2025-10-05"
      },
      {
        "videoId": "5CjEQK_DwJk",
        "title": "【雑談】人生相談してたら宇宙に行きたくなりました",
        "date": "2025-10-06"
      },
      {
        "videoId": "lbrLNb6ERmY",
        "title": "シュクメリなんてジョージア名物ではない！！😤",
        "date": "2025-10-09"
      },
      {
        "videoId": "CrGE2rrwsQU",
        "title": "㊗️チャンネル登録800人！ジョージアスイーツ食べました🍰",
        "date": "2025-10-10"
      },
      {
        "videoId": "xmAxqKUr4Ok",
        "title": "めっちゃおもろいから見て",
        "date": "2025-10-11"
      },
      {
        "videoId": "JhnGIj_w3Is",
        "title": "ロシア風野菜スープとやらを作ってみたい！",
        "date": "2025-10-12"
      },
      {
        "videoId": "fguIWqpU7xA",
        "title": "【雑談】ロシア風鶏野菜スープができました",
        "date": "2025-10-13"
      },
      {
        "videoId": "O6bFt956rnA",
        "title": "アプリ作ってます",
        "date": "2025-10-14"
      },
      {
        "videoId": "o7pL4chCjnc",
        "title": "【雑談】ついに愛猫が出産しました",
        "date": "2025-10-15"
      },
      {
        "videoId": "aIZf_jU-qE4",
        "title": "【雑談】黒海で石飛ばししました",
        "date": "2025-10-16"
      },
      {
        "videoId": "hJHBl9gsvfw",
        "title": "【雑談】罪を憎んで人を憎まずしたんやな☕️",
        "date": "2025-10-17"
      },
      {
        "videoId": "_g65QUd51Qc",
        "title": "めちゃくちゃ綺麗な夕日を見て、チーズパン食べました",
        "date": "2025-10-18"
      },
      {
        "videoId": "0hwkiUp-Os8",
        "title": "【クイズ】ここなに公園？",
        "date": "2025-10-19"
      },
      {
        "videoId": "5DCVhyPVibM",
        "title": "大雨に荒れる黒海を見て、スイーツ巡り。",
        "date": "2025-10-20"
      },
      {
        "videoId": "RZi0C3q84xY",
        "title": "【雑談】ハチャプリでサーフィンすな！",
        "date": "2025-10-21"
      },
      {
        "videoId": "deP9F4smVFM",
        "title": "【雑談】A型だからキリよくしたくなっちゃうゾウ🐘",
        "date": "2025-10-22"
      },
      {
        "videoId": "nfUXzw40OnI",
        "title": "ドネ10万円ついに、突破してしまった！！🥳",
        "date": "2025-10-23"
      },
      {
        "videoId": "I6PVjeSYwf0",
        "title": "遂にドネ10万円を突破したので大感謝デー",
        "date": "2025-10-24"
      },
      {
        "videoId": "-lxjgv5rKhY",
        "title": "海外でアプリ作ってる",
        "date": "2025-10-25"
      },
      {
        "videoId": "EpaugBo46Nw",
        "title": "海外でアプリ作ってる",
        "date": "2025-10-26"
      },
      {
        "videoId": "zfM0voN1WJw",
        "title": "海外でアプリ作ってる",
        "date": "2025-10-27"
      },
      {
        "videoId": "xxQ4XafROrQ",
        "title": "㊗️配信１周年",
        "date": "2025-10-28"
      },
      {
        "videoId": "uaICYBRmxgw",
        "title": "海外でアプリ作ってます",
        "date": "2025-10-29"
      },
      {
        "videoId": "9YZtb64nubQ",
        "title": "海外でアプリ作ってます",
        "date": "2025-10-30"
      },
      {
        "videoId": "BU-qwgOs8Us",
        "title": "海外でアプリ作りながらハッピーハロウィン",
        "date": "2025-10-31"
      },
      {
        "videoId": "DsQR_ARegqc",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-01"
      },
      {
        "videoId": "YN4VwIWRwlc",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-02"
      },
      {
        "videoId": "4pSNKVv1UE4",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-03"
      },
      {
        "videoId": "_jMP9UYl2i4",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-04"
      },
      {
        "videoId": "HRXGhbTT1ug",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-05"
      },
      {
        "videoId": "37GUFPFj-Ng",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-06"
      },
      {
        "videoId": "ZkRZ5fAFWwE",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-07"
      },
      {
        "videoId": "JQSbj449rjU",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-08"
      },
      {
        "videoId": "jEUDlyRvDWA",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-09"
      },
      {
        "videoId": "FsPovxAL3oY",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-10"
      },
      {
        "videoId": "B-HpGmWTtgA",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-11"
      },
      {
        "videoId": "YqYHD3yk1_E",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-12"
      },
      {
        "videoId": "Ml4jLb1AYk8",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-13"
      },
      {
        "videoId": "Gr4RW4u9IFs",
        "title": "㊗️サーバーリリース完了！",
        "date": "2025-11-14"
      },
      {
        "videoId": "YZclGmjNEsQ",
        "title": "海外アプリ作りしてます",
        "date": "2025-11-15"
      },
      {
        "videoId": "oJs7roDf7zQ",
        "title": "海外アプリ作りしてます",
        "date": "2025-11-16"
      },
      {
        "videoId": "7H6c--IDtoo",
        "title": "海外アプリ作りしてます",
        "date": "2025-11-17"
      },
      {
        "videoId": "P1He0fwrew4",
        "title": "海外アプリ作りしてます",
        "date": "2025-11-18"
      },
      {
        "videoId": "1h_MNWoqhTk",
        "title": "海外アプリ作りしてます",
        "date": "2025-11-19"
      },
      {
        "videoId": "_oPnwrn3jsY",
        "title": "海外アプリ作りしてます",
        "date": "2025-11-20"
      },
      {
        "videoId": "VQKtu8xsAM0",
        "title": "㊗️自作アプリ『なにたべよ』広告開始！！",
        "date": "2025-11-21"
      },
      {
        "videoId": "Fwc2IwmgGIA",
        "title": "海外マックシャワルマいくで",
        "date": "2025-11-22"
      },
      {
        "videoId": "wLZfwKdxDyQ",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-23"
      },
      {
        "videoId": "8oozw4VhIyg",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-24"
      },
      {
        "videoId": "rrbN6VtcLO4",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-25"
      },
      {
        "videoId": "sUVPoEL--aM",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-26"
      },
      {
        "videoId": "epFeFNL31Q4",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-27"
      },
      {
        "videoId": "p-FeJ1KCZdc",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-28"
      },
      {
        "videoId": "ddWO4S7Eb9Y",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-29"
      },
      {
        "videoId": "_gVtVQ24gAw",
        "title": "海外でアプリ作ってます",
        "date": "2025-11-30"
      },
      {
        "videoId": "RygeiPBWthQ",
        "title": "海外でアプリ作ってます",
        "date": "2025-12-01"
      },
      {
        "videoId": "gqnf-2UTraM",
        "title": "海外でアプリ作ってます",
        "date": "2025-12-02"
      },
      {
        "videoId": "Tj6YbrSm79Y",
        "title": "海外でアプリ作ってます",
        "date": "2025-12-03"
      },
      {
        "videoId": "x0HlDYZM5GE",
        "title": "海外でアプリ作ってます",
        "date": "2025-12-04"
      },
      {
        "videoId": "24KCt0CvyHs",
        "title": "海外でアプリ作ってます",
        "date": "2025-12-05"
      },
      {
        "videoId": "1QGx2qnPEDo",
        "title": "バースデー🎈",
        "date": "2025-12-06"
      },
      {
        "videoId": "sM4hxYQMRbI",
        "title": "oh my god やなぁー",
        "date": "2025-12-07"
      },
      {
        "videoId": "L_NXNNvLvqM",
        "title": "㊗️900人チャンネル登録者行きました",
        "date": "2025-12-08"
      },
      {
        "videoId": "5ADuHJYbLMQ",
        "title": "僕と言うビッグウェーブに乗ってくれ",
        "date": "2025-12-09"
      },
      {
        "videoId": "3Emf33r7t04",
        "title": "この配信見たら海外のこと知れるから良き",
        "date": "2025-12-10"
      },
      {
        "videoId": "46RITO1Out0",
        "title": "刻むぞおお",
        "date": "2025-12-11"
      },
      {
        "videoId": "qh3OqS5OMgo",
        "title": "届いたぞーー",
        "date": "2025-12-12"
      },
      {
        "videoId": "Cg_JSvj0gPE",
        "title": "教会みにいくぞおおおお",
        "date": "2025-12-13"
      },
      {
        "videoId": "kWnLiOQGhFE",
        "title": "㊗️動画本数500本突破！！！！",
        "date": "2025-12-14"
      },
      {
        "videoId": "hJW3dD7yOT0",
        "title": "超えるぞーーーー",
        "date": "2025-12-15"
      },
      {
        "videoId": "h-MRAFyj3Yc",
        "title": "㊗️チャンネル登録者１,000人超えました",
        "date": "2025-12-16"
      },
      {
        "videoId": "VLtYDGdIq4s",
        "title": "グランドラインに突入だ！",
        "date": "2025-12-17"
      },
      {
        "videoId": "w_kql8jnB30",
        "title": "料理文言整えるぞおおお",
        "date": "2025-12-18"
      },
      {
        "videoId": "av9Aqdi0l7A",
        "title": "22時最高じゃん",
        "date": "2025-12-19"
      },
      {
        "videoId": "M8uZJ2SuSX8",
        "title": "12月も20日になってもうたな",
        "date": "2025-12-20"
      },
      {
        "videoId": "4L89TGy7_SU",
        "title": "みんなの感性の結晶が出来てきたな〜",
        "date": "2025-12-21"
      },
      {
        "videoId": "vBEex5Odse0",
        "title": "みんなの料理コピーに感動しました",
        "date": "2025-12-22"
      },
      {
        "videoId": "xud2lfBsF48",
        "title": "電波良し、気分良し、活気よし",
        "date": "2025-12-23"
      },
      {
        "videoId": "Gjv9LCg5f9A",
        "title": "クリスマスマーケット見に行くぞ！！！！🎅ズングベーズングベー🔔",
        "date": "2025-12-24"
      },
      {
        "videoId": "4cwHL30x2-0",
        "title": "日本は一日クリスマスが早い。メリークリスマス🎅",
        "date": "2025-12-25"
      },
      {
        "videoId": "9jN5QyaEc1U",
        "title": "みんなもう冬休み？",
        "date": "2025-12-26"
      },
      {
        "videoId": "ugR8frPW7gY",
        "title": "㊗️アプリリリース！料理提案がアップデート！",
        "date": "2025-12-27"
      },
      {
        "videoId": "i_P1pRTEps8",
        "title": "日光カムバックやーーーー",
        "date": "2025-12-28"
      },
      {
        "videoId": "GdpNMDDtj00",
        "title": "㊗️アプリ広告開始！みんな感謝！！",
        "date": "2025-12-29"
      },
      {
        "videoId": "MGQ2P2t39K0",
        "title": "今年最後の夕日。そしてここに来ての大荒波",
        "date": "2025-12-30"
      },
      {
        "videoId": "ri120z7_4Ic",
        "title": "今年のW年越し配信は、ジョージア🇬🇪バトゥミで7時間",
        "date": "2025-12-31"
      },
      {
        "videoId": "K6OnRFxE6xg",
        "title": "2026年こんばんは🐴",
        "date": "2026-01-01"
      },
      {
        "videoId": "0yjsa9Rd7sY",
        "title": "やっと正月ボケ抜けてきた",
        "date": "2026-01-02"
      },
      {
        "videoId": "G9xQx9sDi8Q",
        "title": "スパチャ開始やーー！！豚を青くしてくれ！！",
        "date": "2026-01-03"
      },
      {
        "videoId": "rbUhwwtJAQQ",
        "title": "昨日はすみません、スパチャシステム完成！！！！",
        "date": "2026-01-04"
      },
      {
        "videoId": "vwJNPrluyUE",
        "title": "仕事始めおつかれちゃん",
        "date": "2026-01-05"
      },
      {
        "videoId": "GYN5JQThlJU",
        "title": "明日のアリロ行列の作戦会議や！！！！",
        "date": "2026-01-06"
      },
      {
        "videoId": "TFfohG4dICY",
        "title": "ちょみんなごめん、一個言い忘れた",
        "date": "2026-01-06"
      },
      {
        "videoId": "M1RvClI7mDg",
        "title": "アリロ。ジョージア正教会のクリスマス！！",
        "date": "2026-01-07"
      },
      {
        "videoId": "B0CnencN8aQ",
        "title": "アリロ。ジョージア正教会のクリスマス！！",
        "date": "2026-01-07"
      },
      {
        "videoId": "xkyo4nbwGYE",
        "title": "練りすぎましたな、監督",
        "date": "2026-01-08"
      },
      {
        "videoId": "5EgHd2UWg0E",
        "title": "今年の成人は56%は恋人作ったことないらしい",
        "date": "2026-01-09"
      },
      {
        "videoId": "Lftpwjpwyg0",
        "title": "喋べ笑い酸欠疲れた",
        "date": "2026-01-10"
      },
      {
        "videoId": "QTl3si98f3g",
        "title": "松潤久しぶり",
        "date": "2026-01-11"
      },
      {
        "videoId": "TfvU5jL8unI",
        "title": "キャラクターもアプリも進化がすごいゾウ",
        "date": "2026-01-12"
      },
      {
        "videoId": "1ne1_bcVJ3g",
        "title": "電波も天気も悪いそんな日もある🙈",
        "date": "2026-01-13"
      },
      {
        "videoId": "iw-f7jtZXgs",
        "title": "【緊急】ハッピーニューイヤー",
        "date": "2026-01-14"
      },
      {
        "videoId": "GCXxJs5Uu6E",
        "title": "あけおめたろー",
        "date": "2026-01-14"
      },
      {
        "videoId": "JVH4a9c_h9s",
        "title": "関西弁は抜けません！誇りに思いましょう！",
        "date": "2026-01-15"
      },
      {
        "videoId": "Zs8yCuKsVYU",
        "title": "ダッシュでシム買ってきた！",
        "date": "2026-01-15"
      },
      {
        "videoId": "2sOb4ED0ccM",
        "title": "スパイファミリーのフランキーです",
        "date": "2026-01-16"
      },
      {
        "videoId": "rQjoSCpRTKI",
        "title": "もしもし聞こえる？",
        "date": "2026-01-17"
      },
      {
        "videoId": "fKeOH8MRlew",
        "title": "今日からタメ口で生きてく！！",
        "date": "2026-01-18"
      },
      {
        "videoId": "XWy96VeQU2M",
        "title": "全ては性格と身なりなり",
        "date": "2026-01-19"
      },
      {
        "videoId": "ukxRW0IqbrA",
        "title": "ぺちゃってなんや",
        "date": "2026-01-20"
      },
      {
        "videoId": "ukvNJNuWe1A",
        "title": "高市冬の陣！！！",
        "date": "2026-01-21"
      },
      {
        "videoId": "egwcxcu7YYw",
        "title": "行けるとこまで行くぞおおおお",
        "date": "2026-01-23"
      },
      {
        "videoId": "SbeFAEeSyM0",
        "title": "㊗️アプリリリース！今月の団結出し切るぞー！！",
        "date": "2026-01-24"
      },
      {
        "videoId": "K8fUMkiRHvA",
        "title": "準備がバンバンのタンタン",
        "date": "2026-01-25"
      },
      {
        "videoId": "s1qwqPP7Gak",
        "title": "面白コメントランキング入賞目指して頑張ってください",
        "date": "2026-01-27"
      },
      {
        "videoId": "fdDK5n80hwo",
        "title": "1,100人突破しました〜！！！",
        "date": "2026-01-28"
      },
      {
        "videoId": "rey1OECAueU",
        "title": "散歩すると雑念が消えていきます",
        "date": "2026-01-29"
      },
      {
        "videoId": "nScfZtLqHcg",
        "title": "AIはプログラマーを消せても、カフェは営業できません",
        "date": "2026-01-30"
      },
      {
        "videoId": "WQbsQTaaoq8",
        "title": "一月最後の配信や",
        "date": "2026-01-31"
      },
      {
        "videoId": "I_HQ2ikfjTY",
        "title": "一月最後の配信や",
        "date": "2026-02-01"
      },
      {
        "videoId": "Kr7TTA3ysoE",
        "title": "団結グルメアプリ配信者です",
        "date": "2026-02-02"
      },
      {
        "videoId": "xC7h20SCrlg",
        "title": "あやと団結動画量産作戦",
        "date": "2026-02-03"
      },
      {
        "videoId": "YohK_nmBsbM",
        "title": "ゲイが好む雰囲気ありますね",
        "date": "2026-02-04"
      },
      {
        "videoId": "9w9q3qqMEGI",
        "title": "初心を取り戻せ！",
        "date": "2026-02-05"
      },
      {
        "videoId": "ov0mr-2GCpA",
        "title": "㊗️投げ銭5万円達成！いつも本当にありがとうございます。",
        "date": "2026-02-06"
      },
      {
        "videoId": "L1YzClufXdY",
        "title": "いなり寿司のが好き",
        "date": "2026-02-07"
      },
      {
        "videoId": "84ktn5I-srs",
        "title": "料理ランキング磨くぞー！！",
        "date": "2026-02-08"
      },
      {
        "videoId": "hbuzGO95DYE",
        "title": "出た、VTuber",
        "date": "2026-02-09"
      },
      {
        "videoId": "XH2NXlKlQLo",
        "title": "昨日は突然切れてすみません",
        "date": "2026-02-10"
      },
      {
        "videoId": "u2bIxRNKa6g",
        "title": "料理画像を綺麗にしよう第二弾開始や！！",
        "date": "2026-02-11"
      },
      {
        "videoId": "y2kHYvrFOdA",
        "title": "ふむふむふむふむーーー",
        "date": "2026-02-12"
      },
      {
        "videoId": "_0o9-ehCNaQ",
        "title": "みなさんの熱量が破壊的すぎます😱",
        "date": "2026-02-13"
      },
      {
        "videoId": "lHrG16W0R5c",
        "title": "腹減ったぁぁぁぁ、なに食べよ",
        "date": "2026-02-14"
      },
      {
        "videoId": "qSB8MceJ92g",
        "title": "ショート動画祭りや！！！！！！",
        "date": "2026-02-15"
      },
      {
        "videoId": "Z2bMAbBKs8A",
        "title": "黒海/夕日研究家最終日。今日の予報はしっぽり",
        "date": "2026-02-16"
      },
      {
        "videoId": "hnVwWLDS6B8",
        "title": "ケバブ作る",
        "date": "2026-02-17"
      },
      {
        "videoId": "zsp-1njzvXI",
        "title": "バトゥミ最終日",
        "date": "2026-02-17"
      }
    ]
  },
  "armenia": {
    "エレバン": [
      {
        "videoId": "jTpvux9mM44",
        "title": "アルメニアでございます",
        "date": "2026-04-19"
      },
      {
        "videoId": "aYXWyg1ANh0",
        "title": "アルメニアが雨降るわけあるめーにぁ",
        "date": "2026-04-20"
      },
      {
        "videoId": "k-3fN6Ynsok",
        "title": "アルメニアに慣れてくるわけあるめーにぁ",
        "date": "2026-04-21"
      },
      {
        "videoId": "Gc2if__b96w",
        "title": "アルメニアで髪型変えるわけあるめーにぁ",
        "date": "2026-04-22"
      },
      {
        "videoId": "o7OIStvxT0Q",
        "title": "アルメニアにマーケット街あるわけあるめーにぁ",
        "date": "2026-04-23"
      },
      {
        "videoId": "7R7xote6efA",
        "title": "明日19時-25時で6時間配信します",
        "date": "2026-04-24"
      },
      {
        "videoId": "5cWmE-KqHLA",
        "title": "四月の月末配信じゃい！！！",
        "date": "2026-04-25"
      },
      {
        "videoId": "MtEuvYUcJjs",
        "title": "タップタップ結果発表！！！",
        "date": "2026-04-26"
      },
      {
        "videoId": "nwhLr4AuS1M",
        "title": "【作戦会議】GW にイランまで歩こうと思います",
        "date": "2026-04-27"
      },
      {
        "videoId": "XE0lZY5fzEQ",
        "title": "GW企画、明日１２時から！バタバタバタや",
        "date": "2026-04-28"
      },
      {
        "videoId": "M11XX1oeng8",
        "title": "【1日目①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nアルタシャト23キロ",
        "date": "2026-04-29"
      },
      {
        "videoId": "6ZezMEA3emg",
        "title": "【帰路ヒッチハイク②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。12日目ヒッチハイクでエレバンに帰る",
        "date": "2026-05-10"
      },
      {
        "videoId": "ey_pIoeVo_8",
        "title": "【帰路ヒッチハイク③】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。12日目ヒッチハイクでエレバンに帰る",
        "date": "2026-05-11"
      },
      {
        "videoId": "IjcyQPvmdeI",
        "title": "エレバンカムバック！！色々体のガタがきた",
        "date": "2026-05-11"
      },
      {
        "videoId": "1blvBceH_SE",
        "title": "イラン旅総集編ショート上げました！",
        "date": "2026-05-12"
      },
      {
        "videoId": "KQlJaGJYUjI",
        "title": "ジョージアまでどーやって帰ろうか、",
        "date": "2026-05-13"
      },
      {
        "videoId": "gHTWAMKCITo",
        "title": "ワルテミスさんと対談してました",
        "date": "2026-05-14"
      },
      {
        "videoId": "HHD0DO7fzbA",
        "title": "雨なのでアルメニアのショッピングモールから",
        "date": "2026-05-15"
      },
      {
        "videoId": "AZwmL3H25TA",
        "title": "アルメニアでトマトチキンライス作ります",
        "date": "2026-05-16"
      },
      {
        "videoId": "c-ogYrwX8iA",
        "title": "アルメニアの天気予報がポンコツ過ぎるので、エレバン湖まで歩きます",
        "date": "2026-05-16"
      },
      {
        "videoId": "2y4IbYu-ZeI",
        "title": "アルメニアのジェノサイドミュージアムまで歩きます",
        "date": "2026-05-17"
      },
      {
        "videoId": "j_yInDStbKg",
        "title": "ショート動画が出せたよ！",
        "date": "2026-05-18"
      },
      {
        "videoId": "2u4HfAvQdsI",
        "title": "友達ともめるショート動画が100万再生越えたよーん！明日は１３時からセヴァン湖",
        "date": "2026-05-19"
      },
      {
        "videoId": "haHAczqMooM",
        "title": "セヴァン湖までセヴァンマス食べに行きます",
        "date": "2026-05-20"
      },
      {
        "videoId": "JJdPN0ozwZI",
        "title": "セヴァン湖までセヴァンマス食べに行きます",
        "date": "2026-05-20"
      },
      {
        "videoId": "74c2AutI7PY",
        "title": "明後日ジョージア帰ります",
        "date": "2026-05-21"
      },
      {
        "videoId": "YFxoJhKOasQ",
        "title": "アルメニア最終日やぁぁ",
        "date": "2026-05-22"
      },
      {
        "videoId": "1KWNenbPR5A",
        "title": "ジョージアまで帰ります",
        "date": "2026-05-23"
      }
    ],
    "セヴァン湖": [
      {
        "videoId": "haHAczqMooM",
        "title": "セヴァン湖までセヴァンマス食べに行きます",
        "date": "2026-05-20"
      },
      {
        "videoId": "JJdPN0ozwZI",
        "title": "セヴァン湖までセヴァンマス食べに行きます",
        "date": "2026-05-20"
      }
    ],
    "ゴリス": [
      {
        "videoId": "oGgDJrz4vqU",
        "title": "【７日目②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nGoris 37キロ",
        "date": "2026-05-05"
      }
    ],
    "タテフ": [
      {
        "videoId": "8A-2mqkoAYs",
        "title": "【8日目】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n8日目 Tatev 29キロ",
        "date": "2026-05-06"
      }
    ],
    "カパン": [
      {
        "videoId": "ed8voejW_3M",
        "title": "【9日目①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nカパン　45キロ",
        "date": "2026-05-07"
      },
      {
        "videoId": "r72uWC2eMz0",
        "title": "【9日目②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n9日目 カパン　45キロ",
        "date": "2026-05-07"
      },
      {
        "videoId": "KDOUIzcITsQ",
        "title": "おわた。明日は13時から",
        "date": "2026-05-08"
      },
      {
        "videoId": "TFiFG8lrcpA",
        "title": "【最終日】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n10日目 メグリ　70キロ",
        "date": "2026-05-08"
      },
      {
        "videoId": "rHUoWeMPa1o",
        "title": "【帰路ヒッチハイク①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。12日目ヒッチハイクでエレバンに帰る",
        "date": "2026-05-10"
      }
    ],
    "メグリ": [
      {
        "videoId": "TFiFG8lrcpA",
        "title": "【最終日】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n10日目 メグリ　70キロ",
        "date": "2026-05-08"
      },
      {
        "videoId": "HfH1RooVuEQ",
        "title": "【ゴール１時間前】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n10日目 メグリ　70キロ",
        "date": "2026-05-08"
      },
      {
        "videoId": "yj1lPCg5e20",
        "title": "【ﾋﾟｽﾀﾁｵ食べる】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。",
        "date": "2026-05-09"
      },
      {
        "videoId": "rHUoWeMPa1o",
        "title": "【帰路ヒッチハイク①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。12日目ヒッチハイクでエレバンに帰る",
        "date": "2026-05-10"
      }
    ]
  },
  "poland": {
    "カトヴィツェ": [
      {
        "videoId": "hrXYXcu9IDE",
        "title": "【一日目】親友に会いにスウェーデンまで、ワルシャワまで",
        "date": "2026-09-12"
      }
    ],
    "ワルシャワ": [
      {
        "videoId": "HCI2IKaVEuQ",
        "title": "【一日目】親友に会いにスウェーデンまで、ワルシャワまで part2",
        "date": "2026-09-13"
      },
      {
        "videoId": "sxIz_bKd7SQ",
        "title": "【一日目】親友に会いにスウェーデンまで、ワルシャワまで part3",
        "date": "2026-09-13"
      },
      {
        "videoId": "Mzf_LgF6Cxc",
        "title": "【一日目】親友に会いにスウェーデンまで、ワルシャワまで part4",
        "date": "2026-09-13"
      },
      {
        "videoId": "f3W2JxAHsQs",
        "title": "【二日目】親友に会いにスウェーデンまで、ビャウィストクまで",
        "date": "2026-09-13"
      }
    ],
    "ビャウィストク": [
      {
        "videoId": "f3W2JxAHsQs",
        "title": "【二日目】親友に会いにスウェーデンまで、ビャウィストクまで",
        "date": "2026-09-13"
      }
    ]
  },
  "lithuania": {
    "ヴィリニュス": [
      {
        "videoId": "wB9ntPJ5_h8",
        "title": "【四日目】親友に会いにスウェーデンまでヒッチハイクします、リトアニアヴィリュニュス観光日",
        "date": "2026-09-15"
      }
    ]
  },
  "latvia": {
    "リガ": [
      {
        "videoId": "7puIEFev1a4",
        "title": "【五日目】親友に会いにスウェーデンまでヒッチハイクします、ラトビア🇱🇻リガまで",
        "date": "2026-09-16"
      },
      {
        "videoId": "Xvdk_P4gKoU",
        "title": "【五日目】親友に会いにスウェーデンまでヒッチハイクします、ラトビア🇱🇻リガまで part 2",
        "date": "2026-09-17"
      },
      {
        "videoId": "k4DxGQlkD6U",
        "title": "【六日目】親友に会いにスウェーデンまでヒッチハイクします、ラトビア🇱🇻リガ観光日",
        "date": "2026-09-17"
      }
    ]
  },
  "estonia": {
    "タリン": [
      {
        "videoId": "kunXt2sXnFQ",
        "title": "【七日目】親友に会いにスウェーデンまでヒッチハイクします、エストニア🇪🇪タリン　まで",
        "date": "2026-09-18"
      }
    ]
  },
  "finland": {
    "ヘルシンキ": [
      {
        "videoId": "VwUgzKblYyM",
        "title": "【最終日】親友に会いにスウェーデンまでヒッチハイクします。フィンランド🇫🇮ヘルシンキ　まで",
        "date": "2026-09-19"
      },
      {
        "videoId": "WuA1ZykNUWk",
        "title": "【最終日】親友に会いにスウェーデンまでヒッチハイクします。フィンランド🇫🇮ヘルシンキ　まで part 2",
        "date": "2026-09-19"
      },
      {
        "videoId": "d2q2XuA7ss0",
        "title": "【最終日】親友に会いにスウェーデンまでヒッチハイクします。フィンランド🇫🇮ヘルシンキ　まで part 2",
        "date": "2026-09-19"
      }
    ]
  },
  "sweden": {
    "ストックホルム": [
      {
        "videoId": "GBYHxJQGlCY",
        "title": "【到着日日】親友に会いにスウェーデンまでヒッチハイクします。スウェーデン🇸🇪ストックホルム",
        "date": "2026-09-20"
      },
      {
        "videoId": "nGgoJ753rBw",
        "title": "皆さんお元気ですか？ストックホルム散策しましょう。",
        "date": "2026-09-21"
      },
      {
        "videoId": "zNpq6Z-uN3Y",
        "title": "北欧旅の振り返りしよーやー！",
        "date": "2026-09-22"
      },
      {
        "videoId": "dWAQsv5jKzY",
        "title": "スウェーデンのスカンセンみに行こか",
        "date": "2026-09-23"
      },
      {
        "videoId": "_xUgwv6hzuU",
        "title": "スウェーデンの湖みに行こか",
        "date": "2026-09-24"
      },
      {
        "videoId": "KnfRSKnAlg4",
        "title": "ストックホルムの市庁舎みにいこか",
        "date": "2026-09-25"
      },
      {
        "videoId": "fuNbxQyO2Sw",
        "title": "９月の月末配信や！！！えげつない1ヶ月やったな！！",
        "date": "2026-09-26"
      }
    ]
  },
  "albania": {
    "ティラナ": [
      {
        "videoId": "HjSLfg57t7E",
        "title": "アルバニアつきましたー",
        "date": "2026-09-28"
      },
      {
        "videoId": "zjHZucyfrq8",
        "title": "アルバニアのホステルが至上最悪！？",
        "date": "2026-09-28"
      },
      {
        "videoId": "-XSFRIeEpSw",
        "title": "アルバニアでルーティン立て直すぞ！今週の作戦会議や！！",
        "date": "2026-09-29"
      },
      {
        "videoId": "cpOZCgtD4GI",
        "title": "アルバニアでケバブスフラキたべよ",
        "date": "2026-09-30"
      },
      {
        "videoId": "H5Ox41m1LE0",
        "title": "アルバニアで大型ショッピングモールいこ！スニーカー買いに行こ！",
        "date": "2026-10-01"
      },
      {
        "videoId": "C1dzddgQr30",
        "title": "アルバニアで大型ショッピングモールいこ！スニーカー買いに行こ！",
        "date": "2026-10-01"
      },
      {
        "videoId": "2zJMCF5TfJ8",
        "title": "アルバニアでピザ食べる！",
        "date": "2026-10-02"
      },
      {
        "videoId": "hK0SwIeAxg0",
        "title": "アルバニアの首都を待ち歩きや！",
        "date": "2026-10-03"
      },
      {
        "videoId": "da7K3qD5NmI",
        "title": "アルバニアや！",
        "date": "2026-10-04"
      },
      {
        "videoId": "XKpFeM0mQ2I",
        "title": "【速報】スマホが盗まれました",
        "date": "2026-10-05"
      },
      {
        "videoId": "GRd0d7d7Ngg",
        "title": "遂に遂に遂に遂に遂に遂に遂に遂に遂に遂に遂に遂に遂に遂に遂に暗殺者のパスタ",
        "date": "2026-10-06"
      },
      {
        "videoId": "3zGkoi8FuwM",
        "title": "アルバニアで今週の企画会議や！",
        "date": "2026-10-07"
      },
      {
        "videoId": "0BqO781Gq2Q",
        "title": "アルバニアでチーズケーキの材料買いに行こー！！",
        "date": "2026-10-08"
      },
      {
        "videoId": "yGEacTlskmY",
        "title": "アルバニアでチーズケーキつくろか！",
        "date": "2026-10-09"
      },
      {
        "videoId": "xNWJQCt3SLc",
        "title": "アルバニアの湖いこか！",
        "date": "2026-10-10"
      },
      {
        "videoId": "2ij1R53ifcU",
        "title": "アルバニアで髭剃り探しにいこ！",
        "date": "2026-10-11"
      }
    ]
  },
  "north-macedonia": {
    "スコピエ": [
      {
        "videoId": "yk-by7R7iPA",
        "title": "北マケドニア共和国いこかー！？",
        "date": "2026-10-12"
      },
      {
        "videoId": "NY9pzYrA-5o",
        "title": "北マケドニア共和国ついたでーーー",
        "date": "2026-10-12"
      },
      {
        "videoId": "donehL4hO68",
        "title": "どんなもんだい！北マケドニア共和国",
        "date": "2026-10-13"
      },
      {
        "videoId": "UQdkUSro9Ck",
        "title": "やっと晴れたぞ！北マケドニア共和国",
        "date": "2026-10-14"
      },
      {
        "videoId": "CKJvprUMOgA",
        "title": "北マケドニアで今週の企画会議や！",
        "date": "2026-10-15"
      },
      {
        "videoId": "WJ8KEi1V-no",
        "title": "【緊急】北マケドニアの夕日が美しすぎます",
        "date": "2026-10-16"
      },
      {
        "videoId": "E2oGYjnVQSA",
        "title": "北マケドニアでグラムチャウダー作ります",
        "date": "2026-10-16"
      },
      {
        "videoId": "hk39U7ZEKCQ",
        "title": "北マケドニアで新市街みにいこか！",
        "date": "2026-10-17"
      },
      {
        "videoId": "TDArug_te90",
        "title": "北マケドニアで城塞みにいこ！",
        "date": "2026-10-18"
      },
      {
        "videoId": "misSMBhPlkc",
        "title": "北マケドニアで遂にチャンネル登録1900人パーティーや！！",
        "date": "2026-10-19"
      },
      {
        "videoId": "DNLVmUpew48",
        "title": "北マケドニアで聖クリメント・オフリド教会見に行きたい！",
        "date": "2026-10-20"
      },
      {
        "videoId": "0upPnKMc5po",
        "title": "北マケドニアでフライパンパンパン作りの作戦会議&買い出しや",
        "date": "2026-10-21"
      },
      {
        "videoId": "VusdZVyjgjQ",
        "title": "北マケドニアでチーズオリーブフォカッチャつくろー！",
        "date": "2026-10-22"
      },
      {
        "videoId": "vZ2O8pabk1g",
        "title": "【緊急】ホステル追い出されました",
        "date": "2026-10-23"
      },
      {
        "videoId": "eHBAnQF56-E",
        "title": "🇲🇰北マケドニアのマトカ渓谷いこー！紅葉みながら川下りや！",
        "date": "2026-10-24"
      },
      {
        "videoId": "KNgGbR0zdIc",
        "title": "🇲🇰北マケドニアで雑談配信！これからどこの国行くか決めたいな！",
        "date": "2026-10-25"
      },
      {
        "videoId": "814E2V_257A",
        "title": "🇲🇰北マケドニアでマルゲリータピザつくろ！",
        "date": "2026-10-26"
      },
      {
        "videoId": "_XzkJJIvpOE",
        "title": "🇲🇰北マケドニアでおしゃれ街みにいこか！世界は狭いなぁ☺",
        "date": "2026-10-27"
      },
      {
        "videoId": "la_OkustLkA",
        "title": "🇲🇰北マケドニアのショッピングモールみにいこか！防寒具買いたい！",
        "date": "2026-10-28"
      },
      {
        "videoId": "urwD3EmjTxs",
        "title": "🇲🇰北マケドニアのほったらかしパン&アヒージョの準備や！",
        "date": "2026-10-29"
      },
      {
        "videoId": "nb2Cg9rmlM0",
        "title": "🇲🇰北マケドニアのほったらかしパンの一次発酵の経過確認や！",
        "date": "2026-10-30"
      },
      {
        "videoId": "C_AABuDPw1c",
        "title": "🇲🇰北マケドニアのほったらかしパンの二次発酵や！",
        "date": "2026-10-30"
      },
      {
        "videoId": "28Tcc0c5sNE",
        "title": "🇲🇰北マケドニアのほったらかしパン&アヒージョつくるぞー！！！",
        "date": "2026-10-30"
      },
      {
        "videoId": "dv6hDuR0teU",
        "title": "🇲🇰北マケドニアで１０月の月末配信や！",
        "date": "2026-10-31"
      },
      {
        "videoId": "EKTCLeoiQMA",
        "title": "🇲🇰北マケドニアで１１月なってもーたなー！タップタップ結果発表やーーー",
        "date": "2026-11-01"
      },
      {
        "videoId": "nRsDFgZmBqQ",
        "title": "🇲🇰北マケドニアでレーズンくるみパンつくっちゃおかなーーー",
        "date": "2026-11-02"
      },
      {
        "videoId": "yNA44SQbYjM",
        "title": "🇲🇰北マケドニアでパン三種の実験結果みよか",
        "date": "2026-11-03"
      },
      {
        "videoId": "ndhRAwZv918",
        "title": "🇲🇰北マケドニアでパソコンが受け取れなくて困ってしもたぁ",
        "date": "2026-11-04"
      },
      {
        "videoId": "rrGvgfbFNIc",
        "title": "🇲🇰北マケドニアで企画会議やぁーー",
        "date": "2026-11-05"
      },
      {
        "videoId": "O2rMcC78ADg",
        "title": "🇲🇰北マケドニアが久々に晴れたぞーー",
        "date": "2026-11-06"
      },
      {
        "videoId": "XcZ21zrUY3g",
        "title": "🇲🇰北マケドニアぶらぶらすっぞ！",
        "date": "2026-11-07"
      },
      {
        "videoId": "qAXRe3qQyvo",
        "title": "🇲🇰北マケドニアの十字架見にくいので登山します！",
        "date": "2026-11-08"
      },
      {
        "videoId": "WiSPWzjqZZA",
        "title": "🇲🇰北マケドニアの白インゲントマトグラタンつくろか！！",
        "date": "2026-11-09"
      },
      {
        "videoId": "MfQqBEzDou8",
        "title": "🇲🇰北マケドニアの税関がめんどくさすぎるよおおお",
        "date": "2026-11-10"
      },
      {
        "videoId": "9S3zuyByWgo",
        "title": "【悲報】北マケドニア最終日",
        "date": "2026-11-11"
      }
    ]
  },
  "bulgaria": {
    "ソフィア": [
      {
        "videoId": "4izd3enURM8",
        "title": "🇧🇬ブルガリアいきます",
        "date": "2026-11-12"
      },
      {
        "videoId": "-oDWI23uBgc",
        "title": "🇧🇬ブルガリアついたんやけど！！！！！",
        "date": "2026-11-12"
      },
      {
        "videoId": "jnKVIXn4qQs",
        "title": "🇧🇬ブルガリアのヨーグルト試してみよか！！",
        "date": "2026-11-13"
      },
      {
        "videoId": "zDHHuafmP1A",
        "title": "🇧🇬ブルガリアのクリスマスマーケットいこか！",
        "date": "2026-11-14"
      },
      {
        "videoId": "hJ6vFAGX3rI",
        "title": "🇧🇬ブルガリアのバニツァいこか！",
        "date": "2026-11-15"
      },
      {
        "videoId": "2EKBYEnv850",
        "title": "🇧🇬ブルガリアの温泉みに行こか！",
        "date": "2026-11-16"
      },
      {
        "videoId": "aGOz5otlEs8",
        "title": "🇧🇬ブルガリアの聖ソフィア教会みにいこか！",
        "date": "2026-11-17"
      },
      {
        "videoId": "sOvaH0tBzSg",
        "title": "🇧🇬ブルガリアのビリヤニつくります！",
        "date": "2026-11-18"
      },
      {
        "videoId": "KjB_aBsTIf0",
        "title": "🇧🇬ブルガリアで遂に遂に遂に遂に遂に遂に",
        "date": "2026-11-19"
      },
      {
        "videoId": "tr_YBmyLGUc",
        "title": "🇧🇬ブルガリア最後にクリスマスマーケットみにいこか！",
        "date": "2026-11-20"
      }
    ]
  },
  "romania": {
    "ルーマニア": [
      {
        "videoId": "A_cJ9CNM0G8",
        "title": "🇧🇬ブルガリア出国します",
        "date": "2026-11-21"
      },
      {
        "videoId": "ir-qwKKlr2k",
        "title": "🇷🇴ルーマニア着きました",
        "date": "2026-11-22"
      },
      {
        "videoId": "-Zw_89-eL2Q",
        "title": "🇷🇴ルーマニアついたし、湖みにいこか！",
        "date": "2026-11-22"
      }
    ]
  }
};

export const streamsOfCity = (country: string, city: string): CityStream[] =>
  CITY_STREAMS[country]?.[city] ?? [];
