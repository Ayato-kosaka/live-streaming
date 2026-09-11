/**
 * 街ごとの配信。python/build_city_streams.py が BigQuery から作る。
 * 街が2つ以上ある滞在は、題名にその街の名前が出る配信だけ。
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
        "videoId": "1SyclE3VJ08",
        "title": "【神回】ロンドンが奇跡的に晴れてるので、衛兵交代式見せます💂",
        "date": "2025-01-03"
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
        "videoId": "BL93jNWDgk0",
        "title": "イギリス・エディンバラのホステルで少し🤏",
        "date": "2025-01-21"
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
        "videoId": "cqf1unuyPXI",
        "title": "イギリス・グラスゴーの幽霊ホステルで少し🤏",
        "date": "2025-01-24"
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
        "videoId": "Cn24SbkDqG0",
        "title": "ドイツに行くことになりました。ひめひめありがとう。ゴッドさん夜中に川遊び危ないよ。1000年後にこの時代は何といわれてるでしょう。イギリス・チェスターのホステルで少し🤏",
        "date": "2025-02-05"
      }
    ],
    "バーミンガム": [
      {
        "videoId": "lbK3rhH7ksw",
        "title": "イギリス・バーミンガムに移動前に少し🤏",
        "date": "2025-02-06"
      },
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
      },
      {
        "videoId": "GKLTbjA32MI",
        "title": "エジプト🇪🇬カイロのホテルを紹介します",
        "date": "2025-04-27"
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
        "videoId": "BXmAc-rhfac",
        "title": "ヨルダン🇯🇴アンマンでこれからの配信について話してみた",
        "date": "2025-06-15"
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
        "videoId": "X9aD51kD00Y",
        "title": "㊗️300本目、ヨルダン🇯🇴ペトラの大家族で飯食った話しました",
        "date": "2025-06-05"
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
  "uae": {
    "アブダビ": [
      {
        "videoId": "aNWaUilNWbU",
        "title": "UAE🇦🇪付きました〜、携帯がぶっ壊れました〜😭",
        "date": "2025-06-26"
      },
      {
        "videoId": "8uPcdx4I0x0",
        "title": "もくもくすこし",
        "date": "2025-06-26"
      },
      {
        "videoId": "Y0CV6Idu-hU",
        "title": "携帯治ったぁぁ🙌アブダビ🇦🇪がサウナすぎました🧖",
        "date": "2025-06-26"
      },
      {
        "videoId": "r-EuQai-sMo",
        "title": "【もくもくアプリ作り】第十一話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-06-27"
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
        "videoId": "-BsqaHWdUpI",
        "title": "【もくもくアプリ作り】第十二話 アプリ作ったり、ショート動画作ったり",
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
        "videoId": "uOJikeLFTfU",
        "title": "【もくもくアプリ作り】第十二話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-02"
      },
      {
        "videoId": "znswyyM9yMQ",
        "title": "アゼルバイジャン🇦🇿首都を歩いてみました",
        "date": "2025-07-02"
      },
      {
        "videoId": "-LJHF7G97A0",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-03"
      },
      {
        "videoId": "5NocPi8ceUE",
        "title": "アゼルバイジャン🇦🇿で重大発表します",
        "date": "2025-07-03"
      },
      {
        "videoId": "uicj5rra3V8",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-04"
      },
      {
        "videoId": "YbPvEzaa9eY",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-04"
      },
      {
        "videoId": "WZndyh3P_nQ",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-04"
      },
      {
        "videoId": "M1P6m8TRjG0",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-04"
      },
      {
        "videoId": "U4pyOXYSLZo",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-04"
      },
      {
        "videoId": "Oi6nkCEfDNw",
        "title": "アゼルバイジャン🇦🇿のスーパー行きます",
        "date": "2025-07-04"
      },
      {
        "videoId": "7YJHsTCrxko",
        "title": "あやとと 海外ぶらら がライブ配信中！",
        "date": "2025-07-04"
      },
      {
        "videoId": "I-9ORIGJG-w",
        "title": "なにこれの新バージョンの紹介します。スーパー行きました。",
        "date": "2025-07-04"
      },
      {
        "videoId": "Tfl2I6Z6Gis",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-05"
      },
      {
        "videoId": "IFit2OMxHlA",
        "title": "【もくもくアプリ作り】第十三話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-05"
      },
      {
        "videoId": "YvdLoprqbqE",
        "title": "アゼルバイジャン🇦🇿で詐欺に遭いました。最後の長時間配信は断念します。",
        "date": "2025-07-05"
      },
      {
        "videoId": "GUVxac75B94",
        "title": "【もくもくアプリ作り】第十四話 アプリ作ったり、ショート動画作ったり",
        "date": "2025-07-06"
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
        "videoId": "DEtaZ7dq2j4",
        "title": "ジョージア🇬🇪トビリシの旧市街行きました",
        "date": "2025-07-26"
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
        "videoId": "yx0GnorR28s",
        "title": "トビリシに引っ越ししました〜",
        "date": "2026-02-18"
      },
      {
        "videoId": "ozaA0GxFsF8",
        "title": "トビリシラスト",
        "date": "2026-04-18"
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
        "videoId": "Pnbi01M0t0I",
        "title": "土曜やしトビリシ海まで歩こか！",
        "date": "2026-07-11"
      },
      {
        "videoId": "Td0AVFbSLk8",
        "title": "トビリシカムバックやぁーー",
        "date": "2026-08-17"
      }
    ],
    "クタイシ": [
      {
        "videoId": "V--SWER849g",
        "title": "クタイシの旧市街でケバブ食べました",
        "date": "2025-08-29"
      },
      {
        "videoId": "tPOLs4S2QJs",
        "title": "クタイシ移動しました",
        "date": "2025-09-01"
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
        "videoId": "sIoI9BPfNkk",
        "title": "ズグディディ🇬🇪が最高すぎるんですけど！",
        "date": "2025-08-19"
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
        "videoId": "lPCx2VMe4pc",
        "title": "カズベキの滝見に行こ！カズ滝",
        "date": "2026-08-12"
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
        "videoId": "sLDRlfWFKjo",
        "title": "ボルジョミで世界一周を企んでます",
        "date": "2025-09-14"
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
        "videoId": "edjPErVtO9c",
        "title": "バトゥミの夕日を見に行きました🌇",
        "date": "2025-10-03"
      },
      {
        "videoId": "ri120z7_4Ic",
        "title": "今年のW年越し配信は、ジョージア🇬🇪バトゥミで7時間",
        "date": "2025-12-31"
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
        "videoId": "rHUoWeMPa1o",
        "title": "【帰路ヒッチハイク①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。12日目ヒッチハイクでエレバンに帰る",
        "date": "2026-05-10"
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
        "videoId": "c-ogYrwX8iA",
        "title": "アルメニアの天気予報がポンコツ過ぎるので、エレバン湖まで歩きます",
        "date": "2026-05-16"
      }
    ],
    "セヴァン湖": [
      {
        "videoId": "p1-bliAqLJo",
        "title": "友達ともめるショート動画が100万再生越えたよーん！明日は１３時からセヴァン湖",
        "date": "2026-05-19"
      },
      {
        "videoId": "JXEHbJX9Szw",
        "title": "友達ともめるショート動画が100万再生越えたよーん！明日は１３時からセヴァン湖",
        "date": "2026-05-19"
      },
      {
        "videoId": "Aea0S3WIZLU",
        "title": "友達ともめるショート動画が100万再生越えたよーん！明日は１３時からセヴァン湖",
        "date": "2026-05-19"
      },
      {
        "videoId": "gpecGbzVBHU",
        "title": "友達ともめるショート動画が100万再生越えたよーん！明日は１３時からセヴァン湖",
        "date": "2026-05-19"
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
      }
    ]
  },
  "iran-border": {
    "メグリ（国境）": [
      {
        "videoId": "M11XX1oeng8",
        "title": "【1日目①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nアルタシャト23キロ",
        "date": "2026-04-29"
      },
      {
        "videoId": "h2d-assfrh0",
        "title": "【1日目②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nアルタシャト23キロ",
        "date": "2026-04-29"
      },
      {
        "videoId": "GTIftto0kjk",
        "title": "【2日目】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nUrtsadzor 29キロ",
        "date": "2026-04-30"
      },
      {
        "videoId": "fH13PheJneU",
        "title": "【3日目】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nアレニ 50キロ",
        "date": "2026-05-01"
      },
      {
        "videoId": "m1NPo1F7L7M",
        "title": "【4日目①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nvayk30.キロ",
        "date": "2026-05-02"
      },
      {
        "videoId": "__Puza5-4q0",
        "title": "【4日目②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nvayk30キロ",
        "date": "2026-05-02"
      },
      {
        "videoId": "gse7fek4Cpk",
        "title": "【5日目①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。",
        "date": "2026-05-03"
      },
      {
        "videoId": "WaKv25Z-r18",
        "title": "【5日目②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n祭り見る",
        "date": "2026-05-03"
      },
      {
        "videoId": "v9geddQY-24",
        "title": "【6日目①】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nTsghuk 46キロ",
        "date": "2026-05-04"
      },
      {
        "videoId": "4hSM_LCPTRs",
        "title": "【6日目②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nTsghuk 46キロ",
        "date": "2026-05-04"
      },
      {
        "videoId": "oGgDJrz4vqU",
        "title": "【７日目②】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\nGoris 37キロ",
        "date": "2026-05-05"
      },
      {
        "videoId": "8A-2mqkoAYs",
        "title": "【8日目】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n8日目 Tatev 29キロ",
        "date": "2026-05-06"
      },
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
        "videoId": "HfH1RooVuEQ",
        "title": "【ゴール１時間前】怖いイメージを変えたいので\n一緒にご飯食べにイランまで歩く。\n10日目 メグリ　70キロ",
        "date": "2026-05-08"
      }
    ]
  }
};

export const streamsOfCity = (country: string, city: string): CityStream[] =>
  CITY_STREAMS[country]?.[city] ?? [];
