"""イスタンブールの材料（guidebook.json）と組み立て（compose.json）の台本。

    python3 python/guide_book_build.py build turkey/istanbul           # 書く
    python3 python/guide_book_build.py build turkey/istanbul --check   # 台本と JSON が同じか

道具（`s` `t` `loc` `osm` `at` `maps` `photo` `store` `lm` `todo` `dish`）は `python/guide_book_build.py` が入れる。
座標は同じ置き場の `geo.json`、借りた写真の欄は `photos.json`（どちらも同じ道具の `geo` `photo` で足す）。
**JSON を手で直さない。** ここを直して build する。

イスタンブールは「行った」街（2025-03-30〜04-13）。骨組み（外の出どころの事実）のあとに、行った担当が配信の facts から
行った箱を肉付けしている（下の「行った」。`.claude/skills/city-guide/briefs/articles.md`）。厚い所は記事
（`python/data/guide/turkey/istanbul/<話>.json`）にして、窓には要約と「続きを読む」だけを残す。
店に結ぶ品は、その店のいまのサイトの品書き・品の一覧（2026-11-23 に見た）に載っている品だけ。
"""

SEEN = "2026-11-23"
TOWN = "istanbul"
MAPS_AREA = "İstanbul"
DISH_LOCAL_SRC = "tcuis"

SRC = {
    "wv": ("Wikivoyage「Istanbul」", "https://en.wikivoyage.org/wiki/Istanbul"),
    "wvold": ("Wikivoyage「Istanbul/Sultanahmet-Old City」", "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City"),
    "wvgal": ("Wikivoyage「Istanbul/Galata」", "https://en.wikivoyage.org/wiki/Istanbul/Galata"),
    "wveb": ("Wikivoyage「Istanbul/European Bosphorus」", "https://en.wikivoyage.org/wiki/Istanbul/European_Bosphorus"),
    "wvgh": ("Wikivoyage「Istanbul/Golden Horn」", "https://en.wikivoyage.org/wiki/Istanbul/Golden_Horn"),
    "wvkad": ("Wikivoyage「Istanbul/Kadıköy」", "https://en.wikivoyage.org/wiki/Istanbul/Kad%C4%B1k%C3%B6y"),
    "wvphr": ("Wikivoyage「Turkish phrasebook」", "https://en.wikivoyage.org/wiki/Turkish_phrasebook"),
    "jawp": ("Wikipedia（日本語）「イスタンブール」", "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB"),
    "rs": ("Rick Steves「A Crossroads of Civilizations in Istanbul」", "https://www.ricksteves.com/watch-read-listen/read/articles/the-many-layers-of-istanbul"),
    "hagia": ("Wikipedia「Hagia Sophia」", "https://en.wikipedia.org/wiki/Hagia_Sophia"),
    "bluewp": ("Wikipedia「Blue Mosque, Istanbul」", "https://en.wikipedia.org/wiki/Blue_Mosque,_Istanbul"),
    "topk": ("Wikipedia「Topkapı Palace」", "https://en.wikipedia.org/wiki/Topkap%C4%B1_Palace"),
    "cist": ("Wikipedia「Basilica Cistern」", "https://en.wikipedia.org/wiki/Basilica_Cistern"),
    "gbz": ("Wikipedia「Grand Bazaar, Istanbul」", "https://en.wikipedia.org/wiki/Grand_Bazaar,_Istanbul"),
    "spicewp": ("Wikipedia「Spice Bazaar」", "https://en.wikipedia.org/wiki/Spice_Bazaar"),
    "galwp": ("Wikipedia「Galata Tower」", "https://en.wikipedia.org/wiki/Galata_Tower"),
    "sul": ("Wikipedia「Süleymaniye Mosque」", "https://en.wikipedia.org/wiki/S%C3%BCleymaniye_Mosque"),
    "dolma": ("Wikipedia「Dolmabahçe Palace」", "https://en.wikipedia.org/wiki/Dolmabah%C3%A7e_Palace"),
    "hipp": ("Wikipedia「Hippodrome of Constantinople」", "https://en.wikipedia.org/wiki/Hippodrome_of_Constantinople"),
    "arch": ("Wikipedia「Istanbul Archaeology Museums」", "https://en.wikipedia.org/wiki/Istanbul_Archaeology_Museums"),
    "rust": ("Wikipedia「Rüstem Pasha Mosque」", "https://en.wikipedia.org/wiki/R%C3%BCstem_Pasha_Mosque"),
    "gbr": ("Wikipedia「Galata Bridge」", "https://en.wikipedia.org/wiki/Galata_Bridge"),
    "maid": ("Wikipedia「Maiden's Tower」", "https://en.wikipedia.org/wiki/Maiden%27s_Tower"),
    "ortwp": ("Wikipedia「Ortaköy Mosque」", "https://en.wikipedia.org/wiki/Ortak%C3%B6y_Mosque"),
    "balatwp": ("Wikipedia「Balat, Fatih」", "https://en.wikipedia.org/wiki/Balat,_Fatih"),
    "buyuk": ("Wikipedia「Büyükada」", "https://en.wikipedia.org/wiki/B%C3%BCy%C3%BCkada"),
    "chorawp": ("Wikipedia「Chora Church」", "https://en.wikipedia.org/wiki/Chora_Church"),
    "beyl": ("Wikipedia「Beylerbeyi Palace」", "https://en.wikipedia.org/wiki/Beylerbeyi_Palace"),
    "tcuis": ("Wikipedia「Turkish cuisine」", "https://en.wikipedia.org/wiki/Turkish_cuisine"),
    "donerwp": ("Wikipedia「Doner kebab」", "https://en.wikipedia.org/wiki/Doner_kebab"),
    "balikwp": ("Wikipedia「Balık ekmek」", "https://en.wikipedia.org/wiki/Bal%C4%B1k_ekmek"),
    "coffee": ("UNESCO「Turkish coffee culture and tradition」", "https://ich.unesco.org/en/RL/turkish-coffee-culture-and-tradition-00645"),
    "cember": ("Çemberlitaş Hamamı（浴場のサイト。料金の表）", "https://www.cemberlitashamami.com/en/"),
    "bogaz": ("e-Yaşam Rehberi「Şehir Hatları Uzun Boğaz Turu」（2026年9月7日更新）",
              "https://e-yasamrehberi.com/deniz_ulasimi/sehir-hatlari-uzun-bogaz-turu.htm"),
    "fare": ("sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」（2026年7月17日）",
             "https://haber.sol.org.tr/haber/istanbullunun-ulasim-masrafina-yeni-zam-tam-bilet-4620-tl-411809"),
    "mofa": ("外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）", "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html"),
    "ecb": ("欧州中央銀行（ユーロの参照レート）", "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"),
    "time": ("Wikipedia「Time in Turkey」", "https://en.wikipedia.org/wiki/Time_in_Turkey"),
    "hol": ("Wikipedia「Public holidays in Turkey」", "https://en.wikipedia.org/wiki/Public_holidays_in_Turkey"),
    # 店（2026-11-23）。店に結ぶ品は、その店のいまのサイトの品書き・品の一覧に載っているものだけ
    "hafiz": ("Hafız Mustafa 1864（店のサイトの品の一覧）", "https://www.hafizmustafa.com/"),
    "hacibekir": ("Hacı Bekir（店のサイト）", "https://www.hacibekir.com/"),
    "mehmet": ("Kurukahveci Mehmet Efendi（店のサイト）", "https://www.mehmetefendi.com/"),
    "gullu": ("Karaköy Güllüoğlu（店のサイトの品の一覧）", "https://www.karakoygulluoglu.com/"),
    "vefa": ("Vefa Bozacısı（店のサイト）", "https://www.vefa.com.tr/"),
    "mado": ("MADO（店のサイト）", "https://www.mado.com.tr/"),
    "iskender": ("Kebapçı İskender（店のサイト）", "https://www.iskender.com.tr/"),
    "kizil": ("Kızılkayalar「Islak Hamburger」（店のサイト）", "https://kizilkayalar.com.tr/islak-hamburger/"),
    "kiziltak": ("Kızılkayalar「Taksim」（店のサイト）", "https://kizilkayalar.com.tr/taksim-detayli-sayfasi/"),
    "haci": ("Hacı Abdullah「Menü」（店のサイトの献立）", "https://haciabdullah.com.tr/menu/"),
}


STORES = {
    "hafiz": store("hafiz", "ハフズ・ムスタファ 1864（エミノニュの菓子店）", "Hafız Mustafa 1864", "oldcity", "hafiz",
                   "1864年の名を掲げる菓子の店。品の一覧はバクラヴァ・カダイフ・ケーキ・ムハッレビ（牛乳のプリン）・ロクム。", s("hafiz")),
    "hacibekir": store("hacibekir", "ハジュ・ベキル バフチェカプ店（ロクムの老舗）", "Ali Muhiddin Hacı Bekir", "oldcity", "hacibekir",
                       "1777年にバフチェカプで開いた菓子の店。ロクム・アキデ（飴）・ヘルヴァを作る。バフチェカプの店は古い菓子屋として文化財に登録され、店そのものが「生きている博物館」。",
                       s("hacibekir")),
    "mehmetefendi": store("mehmetefendi", "クルカフヴェジ・メフメト・エフェンディ カドゥキョイ店（トルココーヒー）", "Kurukahveci Mehmet Efendi", "asian", "mehmetefendi",
                          "トルココーヒーの豆を煎って挽く店。本店はエミノニュのタフミス通りで、カドゥキョイとシルケジにも店がある。", s("mehmet")),
    "gulluoglu": store("gulluoglu", "カラキョイ・ギュルルオウル（バクラヴァ）", "Karaköy Güllüoğlu", "beyoglu", "gulluoglu",
                       "カラキョイのケマンケシュ通り67番のバクラヴァの店。品の一覧はピスタチオ・くるみなどのバクラヴァと、カダイフ・ロクム。", s("gullu")),
    "vefa": store("vefa", "ヴェファ・ボザジュス（ボザの店）", "Vefa Bozacısı", "oldcity", "vefa",
                  "ボザ（冬の飲み物）を作る店。品の一覧にボザ・ぶどうの汁シュラ・ビネガー。", s("vefa", "wvold")),
    "mado": store("mado", "マド イスティクラル通りの店（トルコアイス）", "Mado", "beyoglu", "mado",
                  "1850年から続くというアイスの店。アイスは100種類近く。", s("mado")),
    "iskender": store("iskender", "ケバプチュ・イスケンデル ニシャンタシュ店（イスケンデル・ケバブ）", "Kebapçı İskender", "nisantasi", "iskender",
                      "1867年にブルサでイスケンデル・ケバブを始めた家の店。イスタンブールの店はニシャンタシュのシャカユク通り67番。", s("iskender")),
    "kizilkayalar": store("kizilkayalar", "クズルカヤラル タクシム店（ウスラック・ハンバーガー）", "Kızılkayalar", "beyoglu", "kizilkayalar",
                          "「ウスラック・ハンバーガー」を考えた店で、1978年から。最初の店はタクシムのスラセルヴィレル通り2/C番。", s("kizil", "kiziltak")),
    "haciabdullah": store("haciabdullah", "ハジュ・アブドゥッラー（トルコ料理の食堂）", "Hacı Abdullah", "beyoglu", "haciabdullah",
                          "1888年からのトルコ料理の食堂。献立にぶどうの葉のサルマ・肉の煮込み・キョフテ・キュネフェ・スュトラッチ。酒は出さない。",
                          s("haci", "wvgal")),
}

# ------------------------------------------------------------------ 見たいもの
see = [
    {"key": "ayasofya", "town": "istanbul", "name": "アヤソフィア", "local": loc("Ayasofya", "Ayasofya", "hagia"),
     "rank": 1, "what": t("537年に東ローマ帝国のユスティニアヌス1世が建てた大聖堂。直径30メートルを超える丸屋根をのせる。1453年のコンスタンティノープルの陥落のあとモスクになり、1935年に博物館、2020年にふたたびモスクになった。1985年から世界遺産。", "hagia"),
     "went": False, **at("ayasofya"),
     "info": [{"label": "行きかた", "text": "アヤソフィア広場。トラムT1のスルタンアフメット駅から300m", "src": s("wvold")},
              {"label": "見学", "text": "いまも礼拝の場なので、礼拝の時間と服装に気をつける", "src": s("wvold")}],
     "maps": maps("Ayasofya"),
     "photo": photo("ayasofya", "アヤソフィアの外観")},
    {"key": "blue", "town": "istanbul", "name": "スルタンアフメット・モスク（ブルーモスク）", "local": loc("Sultan Ahmet Camii", "Sultan Ahmet Camii", "bluewp"),
     "rank": 1, "what": t("スルタンのアフメト1世の命で1609年に建て始め、1617年にできたモスク。6本のミナレットが囲む。中は2万1,043枚のイズニックのタイルと、青の多い塗りの飾りで、これが「ブルーモスク」と呼ばれるわけの1つ。2023年4月に修復を終えて開き直した。", "bluewp"),
     "went": False, **at("blue"),
     "info": [{"label": "行きかた", "text": "トラムT1のスルタンアフメット駅から250m", "src": s("wvold")},
              {"label": "入場", "text": "無料。5〜10月は9時〜21時、11〜4月は9時〜19時", "src": s("wvold")}],
     "maps": maps("Sultan Ahmet Camii"),
     "photo": photo("blue", "スルタンアフメット・モスク（ブルーモスク）の外観")},
    {"key": "topkapi", "town": "istanbul", "name": "トプカプ宮殿", "local": loc("Topkapı Sarayı", "Topkapi Sarayi", "topk"),
     "rank": 1, "what": t("メフメト2世が、コンスタンティノープルの征服から6年後の1459年に建て始めた宮殿。オスマン帝国の政治の中心で、スルタンの住まいだった。1924年に博物館になった。4つの中庭とハレムがあり、宝物館にはスプーン職人のダイヤモンドとトプカプの短剣が並ぶ。", "topk"),
     "went": False, **at("topkapi"),
     "info": [{"label": "行きかた", "text": "トラムT1のスルタンアフメット駅から650m", "src": s("wvold")},
              {"label": "開いている日", "text": "水〜月曜の9時〜17時（火曜は休み）", "src": s("wvold")},
              {"label": "入場料", "text": "宮殿・ハレム・アヤイリニの共通券で2,750リラ（約8,630円）", "src": s("wvold")}],
     "maps": maps("Topkapı Sarayı"),
     "photo": photo("topkapi", "トプカプ宮殿の建物")},
    {"key": "cistern", "town": "istanbul", "name": "地下宮殿（バシリカ・シスタン）", "local": loc("Yerebatan Sarnıcı", "Yerebatan Sarnici", "cist"),
     "rank": 1, "what": t("6世紀にユスティニアヌス1世の時代に造った地下の貯水槽。広さは約138メートル×65メートルで、高さ9メートルの大理石の柱336本が天井を支える。北西の隅の2本の柱の台には、メドゥーサの顔が彫られている。トルコ語の名前は「地下の宮殿」の意味。", "cist"),
     "went": False, **at("cistern"),
     "info": [{"label": "行きかた", "text": "イェレバタン通り1/3番。トラムT1のスルタンアフメット駅から260m", "src": s("wvold")}],
     "maps": maps("Yerebatan Sarnıcı"), "links": {"todo": ["cistern"]},
     "photo": photo("cistern", "地下宮殿の柱の台に彫られたメドゥーサの顔")},
    {"key": "bazaar", "town": "istanbul", "name": "グランドバザール", "local": loc("Kapalıçarşı", "Kapalicarsi", "gbz"),
     "rank": 1, "what": t("1455〜1456年の冬に建て始めた屋根つきの市場。61本の屋根のある通りに4,000を超える店が並び、広さは3万700平方メートル。1日に25万〜40万人が訪れる。まん中の古い建物は、宝石と高い品を扱ったジェヴァーヒル・ベデステン。", "gbz"),
     "went": False, **at("bazaar"),
     "info": [{"label": "行きかた", "text": "トラムT1のベヤズット駅", "src": s("wvold")},
              {"label": "開いている日", "text": "月〜土曜の9時〜19時。日曜と祝日は休み", "src": s("gbz", "wvold")}],
     "maps": maps("Kapalıçarşı"), "links": {"todo": ["bazaar"]},
     "photo": photo("bazaar", "グランドバザールの中の通り")},
    {"key": "spice", "town": "istanbul", "name": "エジプシャン・バザール（スパイス・バザール）", "local": loc("Mısır Çarşısı", "Misir Carsisi", "spicewp"),
     "rank": 1, "what": t("エミノニュの市場。1660年にイェニ・モスクの一角として建て始めた。名前は「エジプトの市場」の意味で、建てるお金がエジプトの州の税から出たためとされる。85の店に、スパイス・ロクム・ドライフルーツ・ナッツが並ぶ。", "spicewp"),
     "went": False, **at("spice"),
     "info": [{"label": "開いている時間", "text": "毎日8時〜19時30分", "src": s("wvold")}],
     "maps": maps("Mısır Çarşısı"), "links": {"todo": ["bazaar"]},
     "photo": photo("spice", "エジプシャン・バザールの中")},
    {"key": "galata", "town": "istanbul", "name": "ガラタ塔", "local": loc("Galata Kulesi", "Galata Kulesi", "galwp"),
     "rank": 1, "what": t("ジェノヴァ人が14世紀に、ガラタの城壁のいちばん高い所に建てた塔。高さは屋根の先まで62.59メートルで、8階が展望のテラス。2020年10月6日に修復を終えて「ガラタ塔博物館」として開き直した。", "galwp", "wvgal"),
     "went": False, **at("galata"),
     "info": [{"label": "行きかた", "text": "メトロM2のシシハーネ駅から500m", "src": s("wvgal")},
              {"label": "開いている時間", "text": "毎日8時30分〜23時（最後の入場は22時）", "src": s("wvgal")}],
     "maps": maps("Galata Kulesi"),
     "photo": photo("galata", "ガラタ塔")},
    {"key": "suleymaniye", "town": "istanbul", "name": "スレイマニエ・モスク", "local": loc("Süleymaniye Camii", "Suleymaniye Camii", "sul"),
     "rank": 2, "what": t("スレイマン1世の命で、宮廷の建築家ミマール・スィナンが建てたモスク。1550年に礎を置き、1557年に開いた。第3の丘の上に立ち、金角湾を広く見下ろす。オスマン帝国の時代のモスクでは市内でいちばん大きい。裏の墓地にスレイマン1世と妻ヒュッレムの廟がある。", "sul"),
     "went": False, **at("suleymaniye"),
     "info": [{"label": "行きかた", "text": "メトロM2のヴェズネジレル駅から750m", "src": s("wvold")},
              {"label": "入場", "text": "無料。土〜木曜は8時30分〜17時、金曜は8時30分〜13時30分", "src": s("wvold")}],
     "maps": maps("Süleymaniye Camii"),
     "photo": photo("suleymaniye", "スレイマニエ・モスク")},
    {"key": "hippodrome", "town": "istanbul", "name": "ヒッポドローム（スルタンアフメット広場）", "local": loc("Sultanahmet Meydanı", "Sultanahmet Meydani", "hipp"),
     "rank": 2, "what": t("東ローマ帝国の都の戦車競走の場で、街の社交の中心だった所。いまはスルタンアフメット広場。テオドシウス1世が390年にエジプトのカルナックから運んだオベリスク、デルフォイの蛇の柱、10世紀の切り石のオベリスクが残る。", "hipp"),
     "went": False, **at("hippodrome"), "info": [], "maps": maps("Sultanahmet Meydanı"),
     "photo": photo("hippodrome", "ヒッポドロームのテオドシウスのオベリスク")},
    {"key": "archaeology", "town": "istanbul", "name": "イスタンブール考古学博物館", "local": loc("İstanbul Arkeoloji Müzeleri", "Istanbul Arkeoloji Muzeleri", "arch"),
     "rank": 2, "what": t("ギュルハネ公園とトプカプ宮殿のそばに並ぶ、3つの考古学の博物館。1891年に開き、館長のオスマン・ハムディ・ベイが作った。100万点を超える品を持ち、シドンの王の墓所から出た「アレキサンダー大王の石棺」が知られる。", "arch"),
     "went": False, **at("archaeology"),
     "info": [{"label": "行きかた", "text": "トラムT1のギュルハネ駅から350m", "src": s("wvold")},
              {"label": "開いている時間", "text": "毎日9時〜17時30分。入場料は大人15ユーロ（約2,620円）", "src": s("wvold")}],
     "maps": maps("İstanbul Arkeoloji Müzeleri"),
     "photo": photo("archaeology", "イスタンブール考古学博物館の門")},
    {"key": "rustem", "town": "istanbul", "name": "リュステム・パシャ・モスク", "local": loc("Rüstem Paşa Camii", "Rustem Pasa Camii", "rust"),
     "rank": 2, "what": t("大宰相リュステム・パシャのために、ミマール・スィナンが建てたモスク。1561〜1563年ごろの建物とされる。中の壁の多くを、花と幾何学の模様のイズニックのタイルが覆う。エジプシャン・バザールのそばで、店の並ぶ丸天井の上の高い台に建つ。", "rust"),
     "went": False, **at("rustem"),
     "info": [{"label": "行きかた", "text": "ハスルジュラル通り62番。トラムT1のエミノニュ駅から450m。入場は無料", "src": s("wvold")}],
     "maps": maps("Rüstem Paşa Camii"),
     "photo": photo("rustem", "リュステム・パシャ・モスクのミフラーブのまわりのタイル")},
    {"key": "istiklal", "town": "istanbul", "name": "イスティクラル通り", "local": loc("İstiklal Caddesi", "Istiklal Caddesi", "wvgal"),
     "rank": 2, "what": t("タクシム広場からガラタサライ広場を通ってテュネル広場まで、約2キロの歩行者の通り。1992年に車が通れなくなり、新しく敷いた線路を1920年代の車両のノスタルジック・トラム（T2）が走る。", "wvgal", "wv"),
     "went": False, **at("istiklal"),
     "info": [{"label": "乗り物", "text": "テュネル広場とカラキョイを結ぶ地下のケーブルカーF2（1875年から）", "src": s("wvgal", "wv")}],
     "maps": maps("İstiklal Caddesi"),
     "photo": photo("istiklal", "イスティクラル通りを走るノスタルジック・トラム")},
    {"key": "galatabridge", "town": "istanbul", "name": "ガラタ橋", "local": loc("Galata Köprüsü", "Galata Koprusu", "gbr"),
     "rank": 2, "what": t("金角湾をまたいで、エミノニュとカラキョイを結ぶ長さ490メートルの橋。いまの橋はこの場所の5代目で、1994年12月にできた。", "gbr"),
     "went": False, **at("galatabridge"),
     "info": [{"label": "歩いて", "text": "エミノニュから橋を歩いてカラキョイ（ガラタ）の側へ渡れる", "src": s("wvgal")}],
     "maps": maps("Galata Köprüsü"), "links": {"todo": ["balik"]},
     "photo": photo("galatabridge", "ガラタ橋の釣り人たち")},
    {"key": "dolmabahce", "town": "istanbul", "name": "ドルマバフチェ宮殿", "local": loc("Dolmabahçe Sarayı", "Dolmabahce Sarayi", "dolma"),
     "rank": 2, "what": t("スルタンのアブデュルメジト1世の命で1843〜1853年に建てた宮殿。ボスポラス海峡のヨーロッパ側の岸、ベシクタシュにある。285の部屋と46の広間を持ち、天井の金箔に14トンの金を使った。儀式の間には、750の灯りを持つ重さ4.5トンの世界でいちばん大きなクリスタルのシャンデリア。1938年11月10日の9時5分にアタテュルクがここで亡くなり、部屋の時計はその時刻のまま。", "dolma"),
     "went": False, **at("dolmabahce"),
     "info": [{"label": "開いている日", "text": "火〜日曜の9時〜17時（月曜は休み）", "src": s("wveb")}],
     "maps": maps("Dolmabahçe Sarayı"), "links": {"todo": ["bosphorus"]},
     "photo": photo("dolmabahce", "ドルマバフチェ宮殿")},
    {"key": "ortakoy", "town": "istanbul", "name": "オルタキョイ・モスク", "local": loc("Ortaköy Camii", "Ortakoy Camii", "ortwp"),
     "rank": 2, "what": t("ボスポラス海峡の岸、ボスポラス橋のたもとに立つモスク。アブデュルメジト1世の命で、ドルマバフチェ宮殿と同じバルヤン家の父子が設計し、1854年か1856年ごろにできた。まわりのオルタキョイは、カフェが並ぶ地区で、具をたくさんのせた焼きじゃがいも「クンピル」の店がある。", "ortwp", "wveb"),
     "went": False, **at("ortakoy"), "info": [], "maps": maps("Ortaköy Camii"), "links": {"todo": ["bosphorus"]},
     "photo": photo("ortakoy", "オルタキョイ・モスクとボスポラス橋")},
    {"key": "maiden", "town": "istanbul", "name": "乙女の塔（クズ・クレスィ）", "local": loc("Kız Kulesi", "Kiz Kulesi", "maid"),
     "rank": 2, "what": t("ボスポラス海峡の南の入口、アジア側のユスキュダルの岸から約200メートルの小島に立つ塔。1110年に皇帝アレクシオス1世が木の塔を建て、いまの石の塔は1763年のもの。2021年に修復を始め、2023年5月に開き直した。皇帝の娘が蛇にかまれる言い伝えがある。", "maid"),
     "went": False, **at("maiden"),
     "info": [{"label": "渡りかた", "text": "岸との間を小舟が一日じゅう行き来する", "src": s("maid")}],
     "maps": maps("Kız Kulesi"),
     "photo": photo("maiden", "乙女の塔")},
    {"key": "kadikoy", "town": "istanbul", "name": "カドゥキョイの魚市場（バルック・パザル）", "local": loc("Kadıköy Balık Pazarı", "Kadikoy Balik Pazari", "wvkad"),
     "rank": 2, "what": t("アジア側のカドゥキョイの船着き場のそばの市場の通り。魚市場は新しい魚と海の幸が中心で、上の通りには香草の店や古本屋も並ぶ。", "wvkad"),
     "went": False, **at("kadikoy"),
     "info": [{"label": "行きかた", "text": "ヨーロッパ側のエミノニュ・カラキョイ・ベシクタシュから船が出る", "src": s("wvkad")},
              {"label": "開いている時間", "text": "毎日9時〜20時30分", "src": s("wvkad")}],
     "maps": maps("Kadıköy Balık Pazarı"), "links": {"todo": ["ferry"]},
     "photo": photo("kadikoy", "カドゥキョイの市場の店先")},
    {"key": "balat", "town": "istanbul", "name": "バラット", "local": loc("Balat", "Balat", "balatwp"),
     "rank": 2, "what": t("金角湾の西の岸の地区。昔はユダヤ人の暮らしの中心で、ギリシャ人やアルメニア人も住んだ。明るい色に塗り直した家が並び、2020年代に旅行者でいちばんにぎわう一帯の1つになった。15世紀に開いたアフリダ・シナゴーグがある。", "balatwp"),
     "went": False, **at("balat"), "info": [], "maps": maps("Balat"),
     "photo": photo("balat", "バラットの色とりどりの家")},
    {"key": "chora", "town": "istanbul", "name": "カーリエ・モスク（コーラ修道院）", "local": loc("Kariye Camii", "Kariye Camii", "chorawp"),
     "rank": 3, "what": t("ビザンティン末期のモザイクとフレスコ画で知られる、もとの教会。中の絵は、テオドロス・メトキテスがお金を出して1310〜1317年ごろに作らせた。1945年に博物館に決まり、2020年8月にモスクに戻って、2024年5月6日に礼拝の場として開いた。", "chorawp"),
     "went": False, **at("chora"), "info": [], "maps": maps("Kariye Camii"),
     "photo": photo("chora", "コーラ修道院のモザイク「聖母の系譜」")},
    {"key": "pierreloti", "town": "istanbul", "name": "ピエール・ロティの丘", "local": loc("Piyer Loti Tepesi", "Piyer Loti Tepesi", "wvgh"),
     "rank": 3, "what": t("エユップにある、金角湾を見下ろす丘の上の屋外のカフェ。丘へはロープウェイが5分おきに出る。", "wvgh"),
     "went": False, **at("pierreloti"), "info": [], "maps": maps("Pierre Loti Tepesi"),
     "photo": photo("pierreloti", "ピエール・ロティの丘から見た金角湾")},
    {"key": "rumeli", "town": "istanbul", "name": "ルメリ・ヒサール", "local": loc("Rumelihisarı", "Rumelihisari", "wveb"),
     "rank": 3, "what": t("15世紀の前半に建った大きな城塞。第2ボスポラス橋のたもとにある。", "wveb"),
     "went": False, **at("rumeli"),
     "info": [{"label": "開いている日", "text": "9時〜17時（月曜は休み）", "src": s("wveb")}],
     "maps": maps("Rumelihisarı"), "links": {"todo": ["bosphorus"]},
     "photo": photo("rumeli", "ルメリ・ヒサール")},
    {"key": "beylerbeyi", "town": "istanbul", "name": "ベイレルベイ宮殿", "local": loc("Beylerbeyi Sarayı", "Beylerbeyi Sarayi", "beyl"),
     "rank": 3, "what": t("ボスポラス海峡のアジア側の岸に、スルタンのアブデュルアズィズのため1861〜1865年に建てた宮殿。設計はバルヤン家のサルキス・バルヤン。夏の住まいで、外国の元首を迎える場にも使い、フランスの皇后ウジェニーも訪れた。", "beyl"),
     "went": False, **at("beylerbeyi"), "info": [], "maps": maps("Beylerbeyi Sarayı"), "links": {"todo": ["bosphorus"]},
     "photo": photo("beylerbeyi", "ベイレルベイ宮殿")},
    {"key": "buyukada", "town": "istanbul", "name": "ビュユック島（プリンスィズ諸島）", "local": loc("Büyükada", "Buyukada", "buyuk"),
     "rank": 2, "what": t("マルマラ海のプリンスィズ諸島でいちばん大きい島（約5.4平方キロメートル）。2020年まで乗り物は馬車だけで、馬は電気の車に替わった。大きな丘ユジェテペの上に、聖ゲオルギオスのギリシャ正教の修道院がある。トロツキーが1929年4月から1933年7月まで亡命して暮らした。", "buyuk"),
     "went": False, **at("buyukada"),
     "info": [{"label": "行きかた", "text": "ヨーロッパ側のエミノニュ・カバタシュ、アジア側のカドゥキョイ・ボスタンジュから、シェヒル・ハトラルの船が出る", "src": s("buyuk")}],
     "maps": maps("Büyükada"), "links": {"todo": ["islands"]},
     "photo": photo("buyukada", "ビュユック島")},
]

# ------------------------------------------------------------------ やりたいこと
todos = [
    todo("bosphorus", "ボスポラス海峡をクルーズしたい！", "エミノニュからアナドル・カヴァウまで船で往復", {
        "what": [t("シェヒル・ハトラルの「ボスポラス海峡の長いツアー」の船で、エミノニュからアナドル・カヴァウまで行って帰る。", "bogaz")],
        "why": [t("海峡はマルマラ海と黒海を結び、市をヨーロッパ側とアジア側に分ける。", "jawp"),
                t("岸にはドルマバフチェ宮殿・オルタキョイ・ルメリ・ヒサール・ベイレルベイ宮殿が並ぶ。", "wveb", "beyl")],
        "how": [t("エミノニュ・ベシクタシュ・ユスキュダル・カンルジャ・サルイェル・ルメリ・カヴァウ・アナドル・カヴァウの7つの船着き場に寄る。毎日出る。", "bogaz"),
                t("切符は船着き場の窓口か、シェヒル・ハトラルのネットで買う。行きと帰りに同じ切符を使う。", "bogaz")],
        "time": [t("2026〜2027年の冬の時刻表では、エミノニュを10時35分に出て、アナドル・カヴァウに12時25分に着く。帰りは15時に出て、エミノニュに16時40分。休みを入れて約6時間。", "bogaz")],
        "money": [t("往復は外国人640リラ（約2,010円）。", "bogaz")],
        "tips": [t("アナドル・カヴァウでは約2時間半、船が待つ。", "bogaz")],
    }, link_see=["dolmabahce", "ortakoy", "rumeli", "beylerbeyi"], ph="do",
        marks=[{"kind": "price", "text": "往復640リラ", "src": s("bogaz")}]),
    todo("hammam", "ハマムでアカスリしたい！", "1584年の浴場で、垢すりと泡の洗い", {
        "what": [t("昔ながらの浴場ハマムのチェンベルリタシュ・ハマムで、温めた大理石の台に横になり、垢すり（ケセ）と石けんの泡で洗ってもらう。", "cember")],
        "why": [t("ヌルバヌ・スルタンの寄進で、ミマール・スィナンの時代の1584年にできた、男女2つの浴場を持つハマム。", "cember")],
        "how": [t("ヴェズィルハン通り8番。コンスタンティヌスの記念柱の向かい。", "wvold"),
                t("男湯と女湯に分かれ、同じ性の係の人が洗う。", "cember")],
        "time": [t("毎日6時〜24時。", "cember")],
        "money": [t("入浴だけは3,200リラ（57ユーロ）。垢すりと泡の洗い（15分）がつくと4,050リラ（72ユーロ）。", "cember")],
        "tips": [t("どの組にも腰に巻く布ペシテマルとサンダルがつく。タオル・石けん・シャンプー・着替えの小部屋も値段に入る。", "cember")],
    }, ph="do", marks=[{"kind": "price", "text": "垢すり4,050リラ", "src": s("cember")}]),
    todo("bazaar", "グランドバザールでお土産探ししたい！", "61本の屋根つき通りに、4,000を超える店", {
        "what": [t("屋根のある大きな市場グランドバザールの通りを歩いて、お土産を探す。", "gbz")],
        "why": [t("1455〜1456年の冬に建て始めた市場で、1日に25万〜40万人が訪れる。", "gbz"),
                t("ロクムの店が多い。じゅうたんとキリムの店は、ブルーモスクの東のアラスタ・バザールのあたりにも集まる。", "wvold")],
        "how": [t("トラムT1のベヤズット駅。", "wvold")],
        "time": [t("月〜土曜の9時〜19時。日曜と祝日は休み。", "gbz", "wvold")],
        "tips": [t("値段の交渉はふつうのこと。グランドバザールの値段はほかの所の倍で、地元の人は買いに来ない。", "wvold"),
                 t("エジプシャン・バザールの値段も、交渉したあとでも街のほかの所の倍。", "wvold")],
    }, link_see=["bazaar", "spice"], ph="do"),
    todo("balik", "エミノニュでサバサンドを食べたい！", "焼いた魚をパンに挟む、船着き場の名物", {
        "what": [t("サバなどの脂ののった魚を焼くか揚げて、野菜といっしょにトルコのパンに挟んだサンドイッチ「バルック・エキメッキ」を食べる。", "balikwp")],
        "why": [t("焼いた魚にトマト・香草・玉ねぎを合わせてパンに挟むのが、エミノニュの人気の軽食。", "tcuis"),
                t("エミノニュの広場で、船の上で作って出すのが定番。", "balikwp")],
        "how": [t("エミノニュには、エミノニュ・バルック・エキメッキと、デニズ・ユルドゥズ・バルクチュの店がある。", "wvold")],
        "tips": [t("いまは漁師が船から直に売ることは許されていない。", "wvold")],
    }, link_see=["galatabridge"], link_eat=["balik-ekmek"], ph="do"),
    todo("cistern", "地下宮殿のメドゥーサに会いたい！", "6世紀の貯水槽に、大理石の柱が336本", {
        "what": [t("地下の貯水槽「地下宮殿」に下りて、柱の森を歩き、メドゥーサの顔の柱の台を見る。", "cist")],
        "why": [t("6世紀にユスティニアヌス1世の時代に造り、約8万立方メートルの水をためた。", "cist"),
                t("メドゥーサの顔の台が2つある。どこから運んだかは分かっていない。", "cist"),
                t("1963年のボンド映画「ロシアより愛をこめて」に出てくる。", "cist")],
        "how": [t("イェレバタン通り1/3番。トラムT1のスルタンアフメット駅から260m。", "wvold")],
        "time": [t("毎日9時〜18時30分と、19時30分〜22時。", "wvold")],
        "money": [t("大人は9時〜18時30分が1,500リラ（約4,710円）、19時30分〜22時が2,400リラ（約7,530円）。", "wvold")],
        "tips": [t("2020〜2022年の修復のあと、LEDの明かりとデジタルの展示「ダハ・デリネ（もっと深く）」で開き直した。", "cist")],
    }, link_see=["cistern"], ph="do", marks=[{"kind": "price", "text": "昼1,500リラ", "src": s("wvold")}]),
    todo("ferry", "フェリーでアジア側へ渡りたい！", "カドゥキョイの魚市場まで、海峡を船で渡る", {
        "what": [t("船で、ヨーロッパ側からアジア側のカドゥキョイへ渡る。", "wvkad")],
        "why": [t("ボスポラス海峡が市をヨーロッパ側とアジア側に分け、住む人のおよそ3分の1がアジア側に暮らす。", "jawp")],
        "how": [t("カドゥキョイへの船は、ヨーロッパ側のエミノニュ・カラキョイ・ベシクタシュから出る。", "wvkad"),
                t("着いたら、魚市場（9時〜20時30分）と、牛の像から南へ延びる歩行者の通りバハリイェ通りへ。", "wvkad")],
        "money": [t("カドゥキョイとエミノニュの船は65.21リラ（約200円。2026年7月20日から）。", "fare")],
        "tips": [t("イスタンブールカードは、街角の小さな店や駅の機械で買え、現金かクレジットカードで足せる。", "wv")],
    }, link_see=["kadikoy", "maiden"], ph="do"),
    todo("kebab", "本場のケバブを食べたい！", "縦の串で焼くドネルに、ヨーグルトのイスケンデル", {
        "what": [t("トルコのケバブを食べる。縦に回る串で焼いた肉を薄く削いだドネル・ケバブや、平たい鉄の串で焼くアダナ・ケバブ。", "donerwp", "tcuis")],
        "why": [t("縦に回して焼く形は、ブルサが生まれた所とされることが多い。1850年代のブルサのイスケンデル・エフェンディの考えとされる。", "donerwp"),
                t("イスケンデル・ケバブは、ドネルにヨーグルト・トマトのソース・バターをかけた料理で、ブルサ生まれ。", "tcuis")],
        "how": [t("イスケンデル・エフェンディの家の店ケバプチュ・イスケンデルは、イスタンブールではニシャンタシュのシャカユク通り67番に店がある。", "iskender")],
        "tips": [t("ドネルは薄いパンで巻くと「デュリュム」になる。", "donerwp")],
    }, link_eat=["doner", "iskender", "adana"], ph="do"),
    todo("islands", "プリンスィズ諸島へ日帰りしたい！", "馬車が電気の車に替わった、ビュユック島へ船で", {
        "what": [t("シェヒル・ハトラルの船で、マルマラ海のプリンスィズ諸島でいちばん大きいビュユック島へ渡り、島を歩く。", "buyuk")],
        "why": [t("2020年まで島の乗り物は馬車だけだった。いまは電気の車に替わっている。", "buyuk"),
                t("大きな丘ユジェテペの上に、聖ゲオルギオスのギリシャ正教の修道院がある。", "buyuk")],
        "how": [t("ヨーロッパ側のエミノニュ・カバタシュ、アジア側のカドゥキョイ・ボスタンジュから、シェヒル・ハトラルの船が出る。", "buyuk")],
        "money": [t("ボスタンジュと島の船は171.89リラ（約540円。2026年7月20日から）。", "fare")],
        "tips": [t("トロツキーが1929年から1933年まで暮らした屋敷ヤナロス邸は、いまは廃墟。", "buyuk")],
    }, link_see=["buyukada"], ph="do"),
]

# ------------------------------------------------------------------ 食べたいもの
MEAT = t("トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。", "tcuis")
eat_items = [
    dish("doner", "ドネル・ケバブ", "Döner kebap", ["local", "quick"], False, None,
         t("縦に回る串で焼いた肉を、焼けたところから薄く削ぐ。パンに挟むか、薄いパンで巻いたデュリュムにする。", "donerwp"),
         pork_note=t("肉は羊・牛・鶏が多く、豚はまれ。", "donerwp")),
    dish("iskender", "イスケンデル・ケバブ", "İskender kebap", ["local"], False, None,
         t("ドネル・ケバブに、ヨーグルト・トマトのソース・バターをかけた料理。ブルサ生まれ。", "tcuis"), ["iskender"], pork_note=MEAT),
    dish("adana", "アダナ・ケバブ", "Adana kebap", ["local"], False, None,
         t("手で刻んだ肉に唐辛子を混ぜ、平たい幅広の鉄の串に付けて焼くケバブ。", "tcuis"), pork_note=MEAT),
    dish("kofte", "キョフテ（トルコの肉団子）", "Köfte", ["local"], False, None,
         t("トルコの肉料理の1つ。ハジュ・アブドゥッラーの献立には、焼いたキョフテとチーズ入りのキョフテがある。", "tcuis", "haci"), ["haciabdullah"], pork_note=MEAT),
    dish("lahmacun", "ラフマジュン（ひき肉をのせた薄いパン）", "Lahmacun", ["local", "quick"], False, None,
         t("薄いパンの生地に、香辛料を混ぜたひき肉を薄くのせて焼く。", "tcuis"), pork_note=MEAT),
    dish("pide", "ピデ（平たいパン）", "Pide", ["local"], False, None,
         t("小麦粉で作る、平たく広いパン。", "tcuis"), pork_note=MEAT),
    dish("manti", "マントゥ（肉を包んだ小さな生地）", "Mantı", ["local"], False, None,
         t("ひき肉を包んで三角に折った小さな生地。", "tcuis"), pork_note=MEAT),
    dish("sarma", "ヤプラック・サルマ（ぶどうの葉の包み）", "Yaprak sarma", ["local"], False, None,
         t("ぶどうの葉で、肉と米を包む。ハジュ・アブドゥッラーの献立には、ぶどうの葉とキャベツのサルマがある。", "tcuis", "haci"), ["haciabdullah"], pork_note=MEAT),
    dish("mercimek", "メルジメッキ・チョルバス（レンズ豆のスープ）", "Mercimek çorbası", ["local"], False, False,
         t("レンズ豆のスープ。食堂の定番の料理の1つ。", "tcuis")),
    dish("kahvalti", "カフヴァルトゥ（トルコの朝ごはん）", "Kahvaltı", ["local"], False, False,
         t("品数の多いトルコの朝ごはん。「カフヴァルトゥ」は「コーヒーの前」の意味。", "tcuis"),
         note=t("トマト・ピーマン・玉ねぎ・オリーブ油・卵で作る卵料理メネメンもある。", "tcuis")),
    dish("balik-ekmek", "サバサンド（バルック・エキメッキ）", "Balık ekmek", ["quick"], False, False,
         t("焼くか揚げた魚（多くはサバ）を、野菜といっしょにトルコのパンに挟む。エミノニュの名物。", "balikwp", "tcuis")),
    dish("midye", "ミディエ・ドルマ（ムール貝の詰めもの）", "Midye dolma", ["quick"], False, False,
         t("詰めものをしたムール貝。揚げたムール貝もある。「ドルマ」は「詰めたもの」の意味。", "tcuis"),
         note=t("バルックパザル小路では、揚げたムール貝（ミディエ・タヴァ）も食べられる。", "wvgal")),
    dish("simit", "スィミット（ごまのパン）", "Simit", ["quick"], False, False,
         t("ごまをまぶした輪の形のパン。街なかで売る軽食。", "tcuis")),
    dish("kumpir", "クンピル（具だくさんの焼きじゃがいも）", "Kumpir", ["quick"], False, False,
         t("焼いたじゃがいもに、カシャルのチーズとたくさんの具をのせる。オルタキョイの名物。", "tcuis", "wveb")),
    dish("islak", "ウスラック・ハンバーガー（濡れたハンバーガー）", "Islak hamburger", ["quick"], False, None,
         t("香辛料で味を付けた肉のパテと、特製のソースを挟んだハンバーガー。タクシムのクズルカヤラルが考えた。", "kizil"), ["kizilkayalar"], pork_note=MEAT),
    dish("baklava", "バクラヴァ", "Baklava", ["sweets"], False, False,
         t("ピスタチオかくるみで作る菓子。カラキョイ・ギュルルオウルの品の一覧には、ピスタチオ・くるみ・ヘーゼルナッツ・アーモンドのバクラヴァ。", "tcuis", "gullu"),
         ["gulluoglu", "hafiz"]),
    dish("lokum", "ロクム（ターキッシュ・ディライト）", "Lokum", ["sweets"], False, False,
         t("食後の消化のために食べられてきた菓子。ハジュ・ベキルは1777年からロクムを作る。", "tcuis", "hacibekir"), ["hacibekir", "hafiz", "gulluoglu"]),
    dish("kunefe", "キュネフェ（チーズの焼き菓子）", "Künefe", ["sweets"], False, False,
         t("細い糸の生地カダイフで、溶けたチーズを挟んで焼く。ハジュ・アブドゥッラーの献立にある。", "tcuis", "haci"), ["haciabdullah"]),
    dish("dondurma", "ドンドゥルマ（トルコアイス）", "Dondurma", ["sweets"], False, False,
         t("「ガム・アイスクリーム」とも呼ばれるトルコのアイス。野生の蘭の根から取るサーレプを使うことがある。", "tcuis"), ["mado"]),
    dish("sutlac", "スュトラッチ（ライスプディング）", "Sütlaç", ["sweets"], False, False,
         t("トルコのライスプディングで、牛乳の菓子の1つ。ハジュ・アブドゥッラーの献立にある。", "tcuis", "haci"), ["haciabdullah"]),
    dish("cay", "チャイ（トルコの紅茶）", "Çay", ["drinks"], False, False,
         t("トルコの人は、朝ごはんにも一日じゅうも紅茶（チャイ）を飲む。", "tcuis")),
    dish("kahve", "トルココーヒー", "Türk kahvesi", ["drinks"], False, False,
         t("煎りたての豆をごく細かい粉にし、水と砂糖とともに小さな鍋で泡が立つまでゆっくり温める。小さなカップに、水を1杯添えて出す。2013年にユネスコの無形文化遺産になった。", "coffee"),
         ["mehmetefendi"]),
    dish("ayran", "アイラン（ヨーグルトの飲み物）", "Ayran", ["drinks"], False, False,
         t("ヨーグルトから作る飲み物で、トルコでいちばんよく飲まれる冷たい飲み物。", "tcuis")),
    dish("boza", "ボザ（冬の飲み物）", "Boza", ["drinks"], False, False,
         t("昔からの冬の飲み物。シナモンを添えて飲む。", "tcuis"), ["vefa"]),
    dish("salep", "サーレプ（冬の飲み物）", "Salep", ["drinks"], False, False,
         t("牛乳・バニラ・砂糖・でんぷんで作る、冬の飲み物。", "tcuis")),
    dish("raki", "ラク（トルコの酒）", "Rakı", ["drinks"], True, False,
         t("トルコでいちばん好まれている酒。", "tcuis")),
]

buy_items = [
    {"key": "lokum", "name": "ロクム（ターキッシュ・ディライト）", "local": loc("Lokum", "Lokum", "hacibekir"),
     "what": t("トルコの菓子ロクム。ハジュ・ベキルは1777年からロクムを作り、オスマンの宮廷の菓子職人の長を3代つとめた。", "hacibekir"),
     "alcohol": False, "stores": [STORES["hacibekir"], STORES["hafiz"], STORES["gulluoglu"]], "went": False},
    {"key": "akide", "name": "アキデ・シェケリ（昔ながらの飴）", "local": loc("Akide şekeri", "Akide sekeri", "hacibekir"),
     "what": t("ハジュ・ベキルが1777年からロクム・ヘルヴァとともに作ってきた、昔ながらの飴。", "hacibekir"),
     "alcohol": False, "stores": [STORES["hacibekir"]], "went": False},
    {"key": "kahve", "name": "トルココーヒーの粉", "local": loc("Türk kahvesi", "Turk kahvesi", "mehmet"),
     "what": t("ごく細かく挽いたトルココーヒーの粉。小さな鍋で煮出して飲む。トルココーヒーの文化は2013年にユネスコの無形文化遺産になった。", "coffee", "mehmet"),
     "alcohol": False, "stores": [STORES["mehmetefendi"]], "went": False},
    {"key": "baklava", "name": "バクラヴァ（持ち帰りの箱）", "local": loc("Baklava", "Baklava", "gullu"),
     "what": t("ピスタチオやくるみのバクラヴァ。ハフズ・ムスタファはネットでも売り、国の内外へ送る。", "gullu", "hafiz"),
     "alcohol": False, "stores": [STORES["gulluoglu"], STORES["hafiz"]], "went": False},
    {"key": "cay", "name": "トルコの紅茶の茶葉", "local": loc("Çay", "Cay", "tcuis"),
     "what": t("トルコの人が朝から一日じゅう飲む紅茶（チャイ）。お土産の定番の1つ。", "tcuis", "wv"),
     "alcohol": False, "stores": [], "went": False},
    {"key": "spice", "name": "スパイスとドライフルーツ", "local": loc("Baharat", "Baharat", "spicewp"),
     "what": t("エジプシャン・バザールの85の店に、スパイス・ロクム・ドライフルーツ・ナッツが並ぶ。", "spicewp"),
     "alcohol": False, "stores": [], "went": False},
    {"key": "kilim", "name": "じゅうたん・キリム", "local": loc("Halı / Kilim", "Hali / Kilim", "wvold"),
     "what": t("トルコのじゅうたんと平織りのキリム。店はブルーモスクの東のアラスタ・バザールのあたりに多い。", "wvold", "wv"),
     "alcohol": False, "stores": [], "went": False},
    {"key": "pestemal", "name": "ペシテマル（ハマムの布）", "local": loc("Peştamal", "Pestamal", "cember"),
     "what": t("ハマムで体に巻く、昔ながらの布。", "cember"),
     "alcohol": False, "stores": [], "went": False},
    {"key": "iznik", "name": "イズニック・タイルの模様の陶器", "local": loc("İznik çinisi", "Iznik cinisi", "rust"),
     "what": t("ブルーモスクやリュステム・パシャ・モスクの壁を飾るイズニックのタイル。花と幾何学の模様が多い。", "bluewp", "rust"),
     "alcohol": False, "stores": [], "went": False},
    {"key": "raki", "name": "ラクの瓶", "local": loc("Rakı", "Raki", "tcuis"),
     "what": t("トルコでいちばん好まれている酒、ラク。", "tcuis"),
     "alcohol": True, "stores": [], "went": False},
]

# ------------------------------------------------------------------ どんな街・地区
P = {
    "oldcity": [[41.0195, 28.956], [41.0195, 28.976], [41.0165, 28.988], [41.008, 28.987], [41.003, 28.978], [41.006, 28.956]],
    "beyoglu": [[41.04, 28.982], [41.04, 28.988], [41.034, 28.99], [41.024, 28.983], [41.023, 28.972], [41.029, 28.97]],
    "asian": [[41.028, 29.003], [41.028, 29.02], [41.0, 29.035], [40.985, 29.032], [40.987, 29.017], [41.01, 29.006]],
}

areas = [
    {"key": "oldcity", "name": "旧市街", "local": loc("Sultanahmet / Fatih", "Sultanahmet / Fatih", "jawp"),
     "tone": t("アヤソフィア・ブルーモスク・トプカプ宮殿・地下宮殿が歩いて回れる距離に集まる一帯。北の金角湾の岸にグランドバザールとエジプシャン・バザール。", "wvold", "jawp"),
     "center": at("ayasofya"),
     "range": {"polygon": P["oldcity"], "how": "スルタンアフメット広場のまわりの名所と、グランドバザール・エジプシャン・バザール・スレイマニエ・モスクを囲んだおおよその範囲", "src": osm("ayasofya") + osm("bazaar") + osm("suleymaniye")},
     "landmarks": [lm("ayasofya", "アヤソフィア", "Ayasofya"), lm("bazaar", "グランドバザール", "Kapalıçarşı")],
     "went": False,
     "name_src": [{"name": SRC["mofa"][0], "url": SRC["mofa"][1], "seen": SEEN, "words": "スルタンアフメット地区（旧市街）"},
                  {"name": SRC["jawp"][0], "url": SRC["jawp"][1], "seen": SEEN, "words": "ファティ区（旧市街。かつてのコンスタンティノープルとほぼ一致）"}]},
    {"key": "beyoglu", "name": "ベイオール", "local": loc("Beyoğlu", "Beyoglu", "jawp"),
     "tone": t("金角湾の北の側。ガラタ塔の坂から、イスティクラル通りがタクシム広場まで延びる。", "jawp", "wvgal"),
     "center": at("istiklal"),
     "range": {"polygon": P["beyoglu"], "how": "ガラタ塔・イスティクラル通り・タクシム広場を囲んだおおよその範囲", "src": osm("galata") + osm("istiklal") + osm("taksim")},
     "landmarks": [lm("galata", "ガラタ塔", "Galata Kulesi"), lm("taksim", "タクシム広場", "Taksim Meydanı")],
     "went": False,
     "name_src": [{"name": SRC["jawp"][0], "url": SRC["jawp"][1], "seen": SEEN, "words": "ベイオール区（金角湾の北側。旧ガラタ地区を含む）"},
                  {"name": SRC["mofa"][0], "url": SRC["mofa"][1], "seen": SEEN, "words": "タクシム地区(特にイスティクラル通り)"}]},
    {"key": "asian", "name": "アジア側", "local": loc("Anadolu Yakası", "Anadolu Yakasi", "jawp"),
     "tone": t("ボスポラス海峡の東の岸。船着き場のカドゥキョイに市場の通りが広がり、ユスキュダルの沖に乙女の塔が立つ。", "jawp", "wvkad", "maid"),
     "center": at("kadikoy"),
     "range": {"polygon": P["asian"], "how": "カドゥキョイの船着き場と市場、ユスキュダルの沖の乙女の塔を囲んだおおよその範囲", "src": osm("kadikoy") + osm("maiden")},
     "landmarks": [lm("kadikoy", "カドゥキョイの船着き場", "Kadıköy İskelesi"), lm("maiden", "乙女の塔", "Kız Kulesi")],
     "went": False,
     "name_src": [{"name": SRC["jawp"][0], "url": SRC["jawp"][1], "seen": SEEN, "words": "アジア側(アナトリア)・ユスキュダル区、カドゥキョイ区（アジア側の地区）"}]},
]

about = {
    "cards": [
        {"key": "crossroads", "title": "文明の十字路", "text": "ボスポラス海峡が市をヨーロッパ側とアジア側に分ける。東と西が出会う「文明の十字路」と呼ばれてきた。",
         "src": s("jawp", "rs")},
        {"key": "history", "title": "二つの帝国の都", "text": "330年に東ローマ帝国の都コンスタンティノープルに、1453年からはオスマン帝国の都。1923年に都はアンカラへ。",
         "src": s("jawp")},
        {"key": "ayasofya", "title": "アヤソフィア", "text": "537年に建った大聖堂。1453年にモスク、1935年に博物館になり、2020年にふたたびモスクになった。",
         "src": s("hagia")},
    ],
    "why_src": [
        {"name": SRC["jawp"][0], "url": SRC["jawp"][1], "seen": SEEN, "words": "ボスポラス海峡でヨーロッパ側とアジア側・コンスタンティノープル（330年）・オスマン帝国の首都（1453〜1923年）"},
        {"name": SRC["rs"][0], "url": SRC["rs"][1], "seen": SEEN, "words": "where East meets West — a true crossroads of civilizations"},
        {"name": SRC["hagia"][0], "url": SRC["hagia"][1], "seen": SEEN, "words": "537年・1453年・1935年・2020年"},
    ],
    "areas": areas,
}

catch = [
    {"text": "「文明の十字路」と称えられた街", "type": "型3（「愛称」と称えられる＋呼び名。手本「『ドナウの真珠』と称えられる歴史都市ブダペスト」）", "src": s("rs", "jawp")},
    {"text": "東西の文明が息づく街", "type": "型2（決まった動詞＋呼び名。手本「伝統と職人技が息づく古都フェズ」）", "src": s("jawp")},
    {"text": "二つの帝国の歴史を物語る街", "type": "型2（決まった動詞＋呼び名。手本「歴史を語る王都」ブダペスト）", "src": s("jawp")},
]

# ------------------------------------------------------------------ 基本情報
basics = {
    "summary": [
        {"key": "season", "title": "旬の季節", "text": "平年の最高気温が16〜28℃になるのは4〜10月。11〜1月は雨が多く、月に100mm前後降る。", "src": s("jawp")},
        {"key": "safety", "title": "治安", "text": "スルタンアフメット地区とタクシム地区（イスティクラル通り）で、夕方と夜にぼったくりバーの被害が多い。", "src": s("mofa")},
        {"key": "budget", "title": "予算", "text": "メトロ・トラム・バスはカードで1回46.20リラ（約140円。2026年7月20日から）。", "src": s("fare")},
        {"key": "transit", "title": "移動", "text": "観光にはトラムT1がいちばん便利。メトロ・船・ケーブルカーもイスタンブールカードで乗る。", "src": s("wv")},
    ],
    "guide": [
        {"key": "airport", "title": "空港から市内へ", "points": [
            t("イスタンブール空港（IST）は市の北西30km。メトロM11が市内と結び、6時15分から0時15分まで走る。", "wv"),
            t("空港バスのハヴァイストは、アクサライのメトロ駅まで約90分。5.42ユーロ（2024年10月）。", "wv"),
            t("タクシーはスルタンアフメットまで約50km・約50分で、約27.92ユーロ（2024年10月）。", "wv"),
            t("アジア側のサビハ・ギョクチェン空港（SAW）は市の東30km。メトロM4でカドゥキョイまで約1時間。", "wv")]},
        {"key": "transit", "title": "市内の乗り物", "points": [
            t("カードのイスタンブールカードは、街角の小さな店や駅の機械で買える。足すのは現金かクレジットカード。", "wv"),
            t("メトロ・トラム・バスは1回46.20リラ（2026年7月20日から）。", "fare"),
            t("トラムT1はカバタシュからバージュラルまで。旧市街の名所の多くはこの沿線。", "wv", "wvold"),
            t("地下のケーブルカーF2（1875年から）が、カラキョイとイスティクラル通りを結ぶ。", "wv")]},
        {"key": "pay", "title": "払いかたとチップ", "points": [
            t("通貨はトルコリラ（TRY）。1リラは約3.14円（2026年11月20日の参照レート）。", "ecb"),
            t("両替は銀行・大きなホテル・両替所で、米ドルとユーロができる。旅行者の多い地区には、日本円を両替できる所もある。", "mofa"),
            t("両替は空港ではなく、街の銀行か両替所（ドヴィズ・ビュロス）で。", "wv"),
            t("ユーロと米ドルは旅行者の多い所では使えるが、リラしか受け取らない名所もある。", "wv")]},
        {"key": "sim", "title": "ネットと SIM", "points": [
            t("トルコの携帯の会社はどこも 4G が使える。5G は一部の場所だけで、2026年に本格的に始まる見込み。", "wv"),
            t("広場とバスには無料の Wi-Fi がある。", "wv")]},
        {"key": "safety", "title": "治安のコツ", "points": [
            t("夕方と夜、スルタンアフメット地区とタクシム地区（とくにイスティクラル通り）で、ぼったくりバーの被害が多い。知らない人に誘われた店には行かない。", "mofa"),
            t("日本語で話しかけて親しくなり、高いじゅうたんを売りつける手口がある。", "mofa"),
            t("流しのタクシーで、遠回りやメーターを消して高い料金を求められる例が多い。ホテルを通すか配車のアプリで呼び、メーターが動いているか確かめる。", "mofa"),
            t("ブラシを落として拾わせ、「ただで」磨いたあとに高いお金を求める靴磨きがいる。払わない。", "wv")]},
        {"key": "phrases", "title": "トルコ語のひとこと", "phrases": [
            {"local": "Merhaba", "roman": "merhaba", "kana": "メルハバ", "ja": "こんにちは"},
            {"local": "Günaydın", "roman": "gunaydin", "kana": "ギュナイドゥン", "ja": "おはようございます"},
            {"local": "Teşekkür ederim", "roman": "tesekkur ederim", "kana": "テシェッキュル・エデリム", "ja": "ありがとう"},
            {"local": "Evet", "roman": "evet", "kana": "エヴェト", "ja": "はい"},
            {"local": "Hayır", "roman": "hayir", "kana": "ハユル", "ja": "いいえ"},
            {"local": "Afedersiniz", "roman": "afedersiniz", "kana": "アフェデルスィニズ", "ja": "すみません"},
            {"local": "Bakar mısınız?", "roman": "bakar misiniz", "kana": "バカル・ムスヌズ？", "ja": "（店の人を呼ぶ）すみません"},
            {"local": "Bu kaç para?", "roman": "bu kac para", "kana": "ブ・カチ・パラ？", "ja": "これはいくらですか？"},
            {"local": "Hesap lütfen", "roman": "hesap lutfen", "kana": "ヘサプ・リュトフェン", "ja": "お勘定をお願いします"},
            {"local": "Hoşçakalın", "roman": "hoscakalin", "kana": "ホシュチャカルン", "ja": "さようなら（去る人が言う）"}],
         "phrases_src": s("wvphr")},
    ],
    "budget": {"days": [], "extras": [
        {"label": "メトロ・トラム・バス1回", "local": "46.20", "yen": "140", "src": s("fare")},
        {"label": "船 カドゥキョイ〜エミノニュ", "local": "65.21", "yen": "200", "src": s("fare")},
        {"label": "船 ボスタンジュ〜島", "local": "171.89", "yen": "540", "src": s("fare")},
        {"label": "ボスポラス海峡の長いツアー（往復・外国人）", "local": "640", "yen": "2,010", "src": s("bogaz")},
        {"label": "地下宮殿（昼）", "local": "1,500", "yen": "4,710", "src": s("wvold")},
        {"label": "ハマム（垢すりと泡の洗いつき）", "local": "4,050", "yen": "12,710", "src": s("cember")}]},
    "packing": [
        {"key": "passport", "text": "パスポート。", "src": s("mofa")},
        {"key": "cash", "text": "少しのリラの現金。リラしか受け取らない名所もある。", "src": s("wv")},
        {"key": "scarf", "text": "モスクに入るときの、きちんとした服。アヤソフィアはいまも礼拝の場で、服装に気をつける。", "src": s("wvold")},
        {"key": "bottle", "text": "水のボトル。水道水は飲めない。", "src": s("mofa")},
        {"key": "insurance", "text": "海外旅行の保険。旅行者の食中毒が多く、腹痛・熱・下痢のときは医療機関へ。", "src": s("mofa")},
        {"key": "umbrella", "text": "冬は傘。11〜1月は月に100mm前後の雨が降る。", "src": s("jawp")}],
    "climate": {"where": "イスタンブール（平年値）", "src": s("jawp"), "months": [
        {"month": f"{i + 1}月", "high": h, "low": lo, "rain_mm": mm} for i, (h, lo, mm) in enumerate([
            (8.7, 2.9, 98.4), (9.1, 2.8, 80.2), (11.2, 3.9, 69.9), (16.5, 7.7, 45.8), (21.4, 12.0, 36.1), (26.0, 16.0, 34.0),
            (28.4, 18.5, 38.8), (28.5, 18.7, 47.8), (25.0, 15.5, 61.4), (20.1, 12.0, 96.9), (15.3, 8.5, 110.7), (11.1, 5.3, 123.9)])]},
    "emergency": {
        "numbers": [{"no": "112", "what": "警察・救急・消防（2021年から全部112に統一）", "src": s("mofa")},
                    {"no": "0212-317-4600", "what": "在イスタンブール日本国総領事館", "src": s("mofa")}],
        "embassy": {"name": "在イスタンブール日本国総領事館", "exists": True, "address": "Esentepe Mah. Büyükdere Cad. No:209, Tekfen Tower Kat:10, Şişli, İstanbul",
                    "tel": "0212-317-4600（国外からは +90 212-317-4600）", "url": "https://www.istanbul.tr.emb-japan.go.jp/",
                    "text": "イスタンブールに日本の総領事館がある（大使館は首都アンカラ）。", "src": s("mofa", "jawp") + osm("consulate"),
                    **at("consulate"), "maps": maps("Tekfen Tower")},
        "water": t("水道水は飲めない。飲むのは市販のボトルの水。", "mofa")},
    "holidays": t("10月29日は共和国の宣言（1923年）を記念する共和国記念日で、前の日の午後も休み。ラマザン・バイラム（3日）とクルバン・バイラム（4日）は、イスラムの暦で毎年日付が動く。", "hol"),
    "time": {"text": "トルコは一年じゅう UTC+3 で、日本より6時間遅い。夏時間は無い。", "src": s("time")},
}

unknown = [
    {"what": "アヤソフィアの入場料と、旅行者の入りかた（上の回廊）", "why": "Wikivoyage は大人25ユーロと書くが日付が無い。ほかの頁は25〜27.5ユーロと食い違う"},
    {"what": "トプカプ宮殿の入場料", "why": "Wikivoyage の2,750リラ（共通券）は日付が無い"},
    {"what": "地下宮殿の入場料", "why": "Wikivoyage の1,500リラ・2,400リラは日付が無く、ほかの頁は1,300リラや38ユーロと食い違う"},
    {"what": "ガラタ塔の入場料", "why": "Wikivoyage は650リラ、ほかの頁は30ユーロと書き、いまの値段が分からない"},
    {"what": "ドルマバフチェ宮殿・ルメリ・ヒサールの入場料", "why": "Wikivoyage の値段（1,200リラ・130リラ）は日付が無く古いとみられる"},
    {"what": "イスタンブール考古学博物館の入場料と、いま見られる館", "why": "大人15ユーロは日付が無い。2025年10月の時点で、タイルのキオスクと古代オリエント博物館は閉まっていた"},
    {"what": "ボスポラス海峡のツアーの値段と時刻", "why": "出どころはシェヒル・ハトラルの公式ではなく、時刻表を写した頁（2026年9月7日更新）。公式の頁は開けなかった"},
    {"what": "チェンベルリタシュ・ハマムの値段の日付", "why": "浴場のサイトの料金に日付が無い（Wikivoyage は約2,000リラ・7時30分〜22時30分と書き、食い違う）"},
    {"what": "カーリエ・モスクのモザイクがいま見られるか、旅行者の入場料", "why": "2024年5月6日に礼拝の場として開いたことまでしか確かめられない。モザイクの一部は幕で覆われているとみられる"},
    {"what": "乙女の塔へ渡る船の乗り場と値段", "why": "「岸との間を小舟が一日じゅう行き来する」までしか確かめられない"},
    {"what": "エミノニュのサバサンドの値段と、いまの売りかた", "why": "Wikivoyage は「漁師が船から直に売ることは許されていない」と書き、Wikipedia は「船の上で作って出す」と書く。値段は見つからない"},
    {"what": "イスタンブールカードの、カードそのものの値段", "why": "2026年の値段を書いた出どころが見つからない"},
    {"what": "ハジュ・アブドゥッラー・マド・ハフズ・ムスタファの、いまの店の場所", "why": "店の座標は OpenStreetMap の点。店のサイトで支店の住所を確かめていない（ケバプチュ・イスケンデルは通りの点）"},
]

# ------------------------------------------------------------------ 行った（配信の facts。行った担当が足す）
# イスタンブールに居たのは 2025-03-30〜04-13 の16本。facts は `streams/2025/<月>/<stem>.facts.json`（`python/guide_facts.py`）。
# **ガイドの品にだけ肉付けする**（facts から品を作らない）。骨組みの字（出どころつき）には混ぜず、行った箱に入る字だけを持つ。
# 配信で名前を言っていない所を品に結んだものは、何で結んだかを書いておく:
#   - 04-03 の葉っぱの包み → ヤプラック・サルマ: 0:06:30 に「このヤプラックサルマを食べたい」と言ってから食べている（facts の行には名前が無い）
#   - 宿の朝食と宿の周りの朝ごはん（04-01・04-11・04-12）→ カフヴァルトゥ: 卵・チーズ・ジャム・オリーブ・パンの、トルコの朝ごはんの並び
# 結ばなかったもの: 03-30 に見た「生まれて見たいちばん大きなモスク」（名前を言っていない）・サバサンド（04-11 は値段を見ただけで、
# 食べていない）・トルコ石屋（04-10。品が無い）・スーパーの買い物（04-01・04-02。品が無い）・寿司（04-06。品が無い）
# この街の日のあやと島カードは無い（2025-03-30〜04-13 の日のカードが0枚）。行った箱は話と場面だけ

import json as _json


def _days() -> dict:
    """動画の id → 配信の日（MM-DD）。facts.json の date_local（見張りの ref と同じ物差し）"""
    out = {}
    for p in sorted((ROOT / "streams").glob("*/*/*.facts.json")):
        d = _json.loads(p.read_text(encoding="utf-8"))
        out[d["video_id"]] = d["date_local"][5:]
    return out


_DAY = _days()


def fx(fid: str) -> dict:
    """facts の行の結び（`<動画>@<秒>#<種類>`）を、材料の形（ref・url つき）にする"""
    v, rest = fid.split("@")
    t, kind = rest.split("#")
    t = int(t)
    if v not in _DAY:
        raise BookError(f"facts の行「{fid}」の配信が streams に無い")
    return {"id": fid, "ref": f"{_DAY[v]} {t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}", "video": v, "t": t, "kind": kind,
            "url": f"https://www.youtube.com/watch?v={v}&t={t}s"}


def went(xs: list, key: str, ids: list, scene: str) -> None:
    """品（鍵）に行った行と場面を付ける。場面は結んだ行のどれか（一言に選ぶ品は、一言の行）"""
    x = next((x for x in xs if x["key"] == key), None)
    if x is None or scene not in ids:
        raise BookError(f"行った: 品「{key}」が無いか、場面「{scene}」が結んだ行に無い")
    x["went"] = {"facts": [fx(i) for i in ids]}
    sc = fx(scene)
    x["scene"] = {"id": sc["id"], "video": sc["video"], "t": sc["t"], "url": sc["url"]}


# 配信（日付順）。03-30 は2本（朝に空港から・夜に街から）
AIR = "6cRyzHIezD4"   # 03-30 サビハ・ギョクチェン空港に着いた回
TOWN = "aUpMiuFhaMk"  # 03-30 市街に着いて、物価と大きなモスクを見た回
PARK = "vbagkjbCw4Q"  # 03-31 公園で声をかけられた話
HOST = "Q2nn9RXxN7Q"  # 04-01 宿の朝食とスーパー
SARM = "Far6D8kifM4"  # 04-03 ヤプラック・サルマとアヤソフィア
BLUE = "x8Kbm9dDpYg"  # 04-04 ブルーモスク（1回目）
NEW = "hhW0LTh3xIw"   # 04-05 新市街・ガラタ塔
RAIN = "J_l0cVwfMPo"  # 04-07 ブルーモスク（2回目・雨）
GBZ = "t0VuytEmnaI"   # 04-08 グランドバザール
ICE = "itQ8b_XeK0U"   # 04-09 トルコアイス
ASIA = "UULcHjBHSJM"  # 04-11 フェリーでアジア側へ
SPC = "nJzo0OMugaM"   # 04-12 エジプシャン・バザール
BYE = "7Amy9E2U7wo"   # 04-13 帰りの空港

went(see, "ayasofya", [f"{SARM}@1860#place", f"{SARM}@1650#caution", f"{SARM}@2100#fact", f"{SARM}@2550#quote", f"{BLUE}@2980#place"],
     f"{SARM}@2550#quote")
went(see, "blue", [f"{BLUE}@2530#place", f"{BLUE}@3120#quote", f"{BLUE}@2710#price", f"{BLUE}@3290#caution", f"{RAIN}@1800#caution",
                   f"{RAIN}@2460#fact", f"{RAIN}@2520#place", f"{ASIA}@2560#quote"], f"{BLUE}@3120#quote")
went(see, "galata", [f"{NEW}@6200#move", f"{NEW}@7150#quote", f"{NEW}@7470#place", f"{NEW}@7570#price"], f"{NEW}@7470#place")
went(see, "bazaar", [f"{GBZ}@0#place", f"{GBZ}@90#fact", f"{GBZ}@1530#fact", f"{GBZ}@1710#fact", f"{GBZ}@2040#fact", f"{GBZ}@2760#fact",
                     f"{GBZ}@2820#fact"], f"{GBZ}@2820#fact")
went(see, "spice", [f"{SPC}@580#caution", f"{SPC}@970#place", f"{SPC}@1060#fact", f"{SPC}@1140#fact", f"{SPC}@1265#fact",
                    f"{SPC}@1360#caution"], f"{SPC}@970#place")
went(see, "kadikoy", [f"{ASIA}@2920#fact", f"{ASIA}@2980#place", f"{ASIA}@3010#quote", f"{ASIA}@3640#fact", f"{ASIA}@4330#fact",
                      f"{ASIA}@4420#food"], f"{ASIA}@2980#place")

went(todos, "ferry", [f"{ASIA}@790#price", f"{ASIA}@2150#move", f"{ASIA}@2200#caution", f"{ASIA}@2270#move", f"{ASIA}@3040#quote"],
     f"{ASIA}@3040#quote")
went(todos, "bazaar", [f"{GBZ}@0#place", f"{GBZ}@2040#fact", f"{GBZ}@2760#fact", f"{GBZ}@2820#fact"], f"{GBZ}@2040#fact")
went(todos, "kebab", [f"{TOWN}@790#price", f"{TOWN}@795#quote", f"{ASIA}@7520#food", f"{ASIA}@7840#price", f"{ASIA}@8350#food",
                      f"{ASIA}@8500#food"], f"{ASIA}@8350#food")

went(eat_items, "sarma", [f"{SARM}@720#food", f"{SARM}@1110#food", f"{SARM}@1140#quote", f"{SARM}@1170#food", f"{SARM}@1230#food",
                          f"{SARM}@1240#quote", f"{SARM}@1320#quote", f"{SARM}@1350#quote", f"{SARM}@1380#quote"], f"{SARM}@1380#quote")
went(eat_items, "dondurma", [f"{ICE}@2435#place", f"{ICE}@2645#caution", f"{ICE}@2705#price", f"{ICE}@3035#food", f"{ICE}@3155#food",
                             f"{ICE}@3245#food", f"{ICE}@3335#quote"], f"{ICE}@3335#quote")
went(eat_items, "baklava", [f"{NEW}@3460#caution", f"{NEW}@4060#food", f"{SPC}@1360#food"], f"{NEW}@4060#food")
went(eat_items, "kahvalti", [f"{HOST}@280#stay", f"{HOST}@300#food", f"{HOST}@400#stay", f"{HOST}@430#caution", f"{ASIA}@1400#stay",
                             f"{SPC}@3760#stay"], f"{HOST}@300#food")
went(eat_items, "ayran", [f"{NEW}@11950#food"], f"{NEW}@11950#food")
went(eat_items, "cay", [f"{HOST}@380#food", f"{PARK}@1500#food"], f"{HOST}@380#food")
went(eat_items, "kahve", [f"{HOST}@380#food", f"{PARK}@1500#food"], f"{HOST}@380#food")

went(buy_items, "kilim", [f"{GBZ}@2040#fact"], f"{GBZ}@2040#fact")
went(buy_items, "spice", [f"{SPC}@1265#fact"], f"{SPC}@1265#fact")


def own(key: str, text: str, ids: list) -> None:
    """基本情報の札に、行った人の話を1つ足す（出どころの無い、facts だけを持つ字。行った箱に入る）"""
    g = next(g for g in basics["guide"] if g["key"] == key)
    g["points"].append({"text": text, "facts": [fx(i) for i in ids]})


own("airport", "着いたのは、アジア寄りで街から遠いサビハ・ギョクチェン空港。空港で4時間ほど寝てから、市街まで3時間ほどかかりました。"
               "帰りの空港では、建物に入るときと待合のターミナルに入るときの2回、荷物検査があって、パソコンのネジを締めるドライバーを取られました。",
    [f"{AIR}@185#place", f"{TOWN}@20#move", f"{BYE}@240#caution", f"{BYE}@375#caution"])
own("transit", "電車は1回40リラ、約160円で、ヨーロッパより安い。イスタンブールカードを買って、チャージして使いました。"
               "トラムの駅には改札があってしっかりしていますが、乗る路線を間違えて、降りてやり直したこともあります。",
    [f"{TOWN}@1000#price", f"{TOWN}@1200#move", f"{NEW}@430#move", f"{NEW}@490#caution"])
own("pay", "現金は、着いた日に300リラ、約1,200円を下ろしました。リラは日によって値動きが大きくて、店の手書きのメニューの値段が古いことがあります。"
           "値札は、ホワイトボードやシールで書き直せるようになっていました。",
    [f"{TOWN}@1400#fact", f"{NEW}@3650#caution", f"{ASIA}@1260#price"])
own("sim", "外を歩いているときは電波が安定していましたが、ブルーモスクの中に入ったころに電波がなくなりました。"
           "20GBのSIMが切れたときは、Wi-Fiをつないで復活しました。",
    [f"{BLUE}@2260#fact", f"{BLUE}@3600#caution", f"{ASIA}@15970#caution"])
own("safety", "着いた初日、公園で声をかけてきたおじさんについて行くと、親戚の絨毯屋とケバブ屋に連れて行かれて、ビール代は全部こちらが払うと思われていました。"
              "ブルーモスクの周りでは、日本語で声をかけられることもあります。",
    [f"{PARK}@420#caution", f"{PARK}@600#place", f"{PARK}@990#caution", f"{BLUE}@2430#caution"])
# 季節の行った話。道具（`guidebook_bake.Baker.season`）が読む欄の名前が `autumn` なのでそこに置くが、中身は春（3月末〜4月）の話
basics["autumn"] = {"text": "3月30日に着いた日は、日差しが強くて南国のような暑さでした。ところが4月7日は6度の土砂降りで、今まで感じた中でいちばん寒い日。"
                            "4月のトルコは暑いと思っていたら、7〜9度ほどの寒い日もありました。",
                    "facts": [fx(i) for i in [f"{TOWN}@185#fact", f"{RAIN}@1350#fact", f"{RAIN}@1410#fact", f"{GBZ}@90#fact"]]}

book = {
    "_meta": {
        "何か": "イスタンブールを「ガイドブック型の街の面」（/travel/turkey/istanbul）にするための材料。行った街（2025-03-30〜04-13）。焼くのは python/guidebook_bake.py",
        "見張り": "python3 python/guide_book_check.py turkey/istanbul（出どころの無い事実・座標の無い店・枠の外の座標）。マイマップの CSV も同じ道具が書く（--mymaps）",
        "出どころ": "事実を持つ欄には src（https と見た日）。座標は OpenStreetMap（Nominatim）。値段と「いまも」は2024年以降の出どころ。確かめきれないものは unknown へ",
        "行った": "行った街（2025-03-30〜04-13）。went は配信の facts の行だけを持つ（台本の「行った」の段。名前を言っていない所を品に結んだ理由もそこ）。骨組みの字には混ぜない",
        "店": "店に結ぶ品は、その店のいまのサイトの品書き・品の一覧（2026-11-23 に見た）に載っている品だけ",
        "円": "円は 1ユーロ＝55.5788リラ・174.35円（2026年11月20日の欧州中央銀行の参照レート。1リラ＝約3.14円）で直し、10円で丸めた",
        "地図": "多角形（range.polygon）は、その地区に入っている目印の座標を囲んで外へ広げた、おおよその範囲。区の境ではない。ドルマバフチェ宮殿より北のボスポラス海峡・バラット・ピエール・ロティの丘・プリンスィズ諸島は見どころマップの外（矢印）",
        "rank": "見たいものの rank は、初めての人に向けた見どころの大きさ（1 が定番）",
        "選んだ問い": "どんな街の問いは、日本語の頁と旅行のガイドがイスタンブールを語る、ヨーロッパとアジアにまたがる「文明の十字路」・東ローマとオスマンの二つの帝国の都・アヤソフィアの3つ（about.why_src）",
        "キャッチの手本": "型3の手本は「『ドナウの真珠』と称えられる歴史都市ブダペスト」（docs/guide-copy.md 8章）。「文明の十字路」は Rick Steves の「a true crossroads of civilizations」と、日本語の頁がイスタンブールを語るヨーロッパとアジアにまたがる街の話から",
    },
    "city": {"key": "turkey/istanbul", "name": "イスタンブール", "town": "istanbul",
             "local": {"text": "İstanbul", "lang": "tr", "roman": "Istanbul", "src": s("jawp")}},
    "rate": {"text": "1リラは約3.14円。トルコリラ（TRY）は変動相場で、円は1ユーロ＝55.5788リラ・174.35円（2026年11月20日の欧州中央銀行の参照レート）で直した。",
             "src": s("ecb"), "unit": "リラ", "eur_local": 55.5788, "eur_jpy": 174.35, "date": "2026-11-20"},
    "cover": {"catch": catch, "photo": photo("ayasofya", "アヤソフィアの外観")},
    "about": about,
    "todo": todos,
    "see": see,
    "eat": {"kinds": [{"key": "local", "name": "トルコの料理"}, {"key": "quick", "name": "安く手早く"},
                      {"key": "sweets", "name": "甘いもの"}, {"key": "drinks", "name": "飲み物"}], "items": eat_items},
    "buy": {"items": buy_items},
    "basics": basics,
    "unknown": unknown,
    "shorts": {"src": [{"name": "site/content/shorts.ts の章（チャンネルのショートのタブから焼いたもの）",
                        "url": "https://www.youtube.com/channel/UCCwutAH6ieHNvdyJAfSld7w/shorts", "seen": SEEN}], "items": []},
}

compose = {
    "_meta": {
        "何か": "イスタンブールのガイドブックの面（/travel/turkey/istanbul）の組み立て。材料（guidebook.json）にあるのは事実で、ここにあるのは選びかたと並べかただけ。焼くのは python/guidebook_bake.py",
        "行った": "行った街。この街の日のあやと島カードは無いので、行った箱は話と場面だけ。話（story）は facts の行をつないだあやとの一人称（docs/guide-blog.md）で、記事のある品は要約だけ（article）。一言は節に1つ",
        "どんな街": "問いは日本語の頁と旅行のガイドがイスタンブールを語る3つ（材料の about.why_src）。前の街の問いを写していない",
        "題": "「イスタンブール観光ガイド」が頭（docs/island-misses.md #332・#333）",
    },
    "title": "イスタンブール観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜トルコ",
    "description": {"text": "トルコの街イスタンブールの観光ガイド。見どころマップと、やりたいこと{todo}つ（ボスポラス海峡のクルーズ、ハマムのアカスリ、グランドバザール、サバサンド）、ケバブとバクラヴァ。", "facts": []},
    "persona": [
        "トルコやバルカンを安く回る20〜30代の個人旅行者。イスタンブールに何日いて、どこを回って何を食べるか決めかねている（いちばん大事な読み手）",
        "乗り継ぎや短い滞在で、旧市街の名所とボスポラス海峡をまとめて回りたい人",
        "ぼったくりや値段の交渉が心配で、安く済ませるコツを知りたい人",
    ],
    "terms": ["イスタンブール 観光", "イスタンブール 見どころ", "イスタンブール 地図", "イスタンブール 観光 モデルコース", "イスタンブール グルメ"],
    "published": "2026-11-23",
    "cover": {"catch": 0},
    "cards": {},
    "say": {"see": "blue", "todo": "ferry", "eat": "sarma"},
    "items": {
        "see/ayasofya": {"story": {"text": "ブルーモスクより先に行きました。前は大渋滞で道も狭く、最近まで無料だったのが、観光客が増えすぎて有料になったそうです。"
                                           "横から見ると、お城みたいでかっこよかったです。",
                                   "facts": [f"{SARM}@1650#caution", f"{SARM}@2100#fact", f"{SARM}@2550#quote"]},
                         "article": "blue"},
        "see/blue": {"story": {"text": "入場は無料ですが、中に入る列は2時間待ちでした。次に行った雨の月曜日は、礼拝の時間で30分待ってから、靴を脱いで入りました。"
                                       "中は空いていて、猫もいました。",
                               "facts": [f"{BLUE}@2710#price", f"{BLUE}@3290#caution", f"{RAIN}@1800#caution", f"{RAIN}@2460#fact",
                                         f"{RAIN}@2520#place"]},
                     "article": "blue"},
        "see/galata": {"story": {"text": "近いので歩いて向かいましたが、坂がすごくて、トルコは登山だと思いました。入場は4,500円ほどで、見送りました。",
                                 "facts": [f"{NEW}@6200#move", f"{NEW}@7150#quote", f"{NEW}@7570#price"]},
                       "article": "galata"},
        "see/bazaar": {"story": {"text": "4月なのに7〜9度ほどで、寒い日でした。金銀財宝が売っていて面白かったけれど、自分で買うなら欲しいものはあまりなく、"
                                         "今回は特に買うものはありませんでした。値切りは、やったことがありません。",
                                 "facts": [f"{GBZ}@90#fact", f"{GBZ}@2820#fact", f"{GBZ}@1530#fact", f"{GBZ}@2760#fact", f"{GBZ}@1710#fact"]}},
        "see/spice": {"story": {"text": "道が分からなくなりながら、入り口に着きました。食べ物の市場かと思ったら、おもちゃも売っていて、食べ物以外も多い。"
                                        "スパイス売り場には、ローズマリーやクローブがありました。値段の書いていない店が多かったです。",
                                "facts": [f"{SPC}@580#caution", f"{SPC}@970#place", f"{SPC}@1060#fact", f"{SPC}@1140#fact", f"{SPC}@1265#fact",
                                          f"{SPC}@1360#caution"]}},
        "see/kadikoy": {"story": {"text": "アジア側でいちばん大きい街で、思っていたより近代的でした。パリっぽい店があって、市場の野菜は水を上げられていて、新鮮に見えました。",
                                  "facts": [f"{ASIA}@2980#place", f"{ASIA}@2920#fact", f"{ASIA}@3640#fact", f"{ASIA}@4330#fact"]},
                        "article": "ferry"},
        "todo/ferry": {"story": {"text": "地元の人も通勤に使うフェリーで、アジア側へ渡りました。船の上はめちゃくちゃ寒かったけれど、晴れた景色がよくて、この日にしてよかったです。",
                                 "facts": [f"{ASIA}@2150#move", f"{ASIA}@2200#caution", f"{ASIA}@3040#quote"]},
                       "article": "ferry"},
        "todo/bazaar": {"story": {"text": "金銀財宝が売っていて、面白かったです。手織りの絨毯は、見る方向で色の濃さが変わるのを、実際に見て確かめました。"
                                          "今回は特に買うものはありませんでした。",
                                  "facts": [f"{GBZ}@2820#fact", f"{GBZ}@2040#fact", f"{GBZ}@2760#fact"]}},
        "todo/kebab": {"story": {"text": "アヤソフィア近くの観光客向けの店では、ケバブが350リラ、1,400円もしました。イギリスでも、そこまではしません。"
                                         "別の日に100gで頼んだケバブは800円ぐらいで、炭火焼きのような焦げ目があって、断然うまかったです。",
                                 "facts": [f"{TOWN}@790#price", f"{TOWN}@795#quote", f"{ASIA}@7520#food", f"{ASIA}@7840#price", f"{ASIA}@8350#food",
                                           f"{ASIA}@8500#food"]}},
        "eat/sarma": {"story": {"text": "フォークを入れると、葉っぱの中に何か入っていました。食べてみるとぬめぬめしていて、初めての味。中身はふにゃふにゃのご飯で、"
                                        "ピクルスでお粥を包んだみたいです。思ったより癖がなくて、普通に美味しかったので、晩ごはんにすることにしました。",
                                "facts": [f"{SARM}@720#food", f"{SARM}@1110#food", f"{SARM}@1140#quote", f"{SARM}@1170#food", f"{SARM}@1240#quote",
                                          f"{SARM}@1320#quote", f"{SARM}@1350#quote"]}},
        "eat/dondurma": {"story": {"text": "店で食べてみなとアイスを出されて、食べようとすると引っこめられ、鼻をつつかれました。スモールで600円くらい。"
                                           "噛めるほどの弾力で、溶ける寸前のハイチュウのような食感です。溶けて落ちてこず、ネバネバ伸びる。1回慣れるとうまいです。",
                                   "facts": [f"{ICE}@2645#caution", f"{ICE}@2705#price", f"{ICE}@3155#food", f"{ICE}@3245#food", f"{ICE}@3335#quote"]}},
        "eat/baklava": {"story": {"text": "目当ての有名店は閉まっていましたが、ピスタチオのバクラヴァを買って、手で食べました。"
                                          "めちゃくちゃ美味しいので、トルコに来たらぜひ食べてほしいです。",
                                  "facts": [f"{NEW}@3460#caution", f"{NEW}@4060#food", f"{SPC}@1360#food"]}},
        "eat/kahvalti": {"story": {"text": "泊まった宿の朝食は、ゆで卵1個、チーズ2種、ジャム3種、レタス、オリーブ、バゲット食べ放題。ただ朝8時から10時前までで、"
                                           "8時に起きるつもりが、起きたら12時でした。宿の周りの朝ごはんも安くてしっかりしていて、2週間ほど食べました。",
                                   "facts": [f"{HOST}@300#food", f"{HOST}@400#stay", f"{HOST}@430#caution", f"{ASIA}@1400#stay"]}},
        "eat/ayran": {"story": {"text": "無糖のヨーグルトをさらさらにした味で、ラッシーより好きかもしれません。", "facts": [f"{NEW}@11950#food"]}},
        "eat/cay": {"story": {"text": "トルコのチャイは、トルココーヒーと同じく美味しかったです。", "facts": [f"{HOST}@380#food"]}},
        "eat/kahve": {"story": {"text": "トルココーヒーも、トルコのチャイも、美味しかったです。", "facts": [f"{HOST}@380#food"]}},
        "buy/kilim": {"story": {"text": "グランドバザールで、手織りの絨毯が、見る方向で色の濃さが変わるのを、実際に見て確かめました。",
                                "facts": [f"{GBZ}@2040#fact"]}},
        "buy/spice": {"story": {"text": "エジプシャン・バザールのスパイス売り場には、ローズマリーやクローブがありました。", "facts": [f"{SPC}@1265#fact"]}},
        "guide/airport": {"story": {"text": "アジア寄りのサビハ・ギョクチェン空港に着いて、市街まで3時間ほど。帰りの空港は荷物検査が2回あって、ドライバーを取られました。",
                                    "facts": [f"{AIR}@185#place", f"{TOWN}@20#move", f"{BYE}@240#caution", f"{BYE}@375#caution"]},
                          "article": "arrival"},
        "guide/safety": {"story": {"text": "着いた初日に、公園で声をかけてきたおじさんについて行きました。親戚の絨毯屋とケバブ屋を回って、"
                                           "ビール代は全部こちらが払うと思われていて、最後は走って帰りました。",
                                   "facts": [f"{PARK}@420#caution", f"{PARK}@600#place", f"{PARK}@990#caution", f"{PARK}@1320#quote"]},
                         "article": "touts"},
    },
    "about": {"crossroads": {"q": "なぜ「文明の十字路」？", "icon": "bridge"}, "history": {"q": "どんな歴史？", "icon": "castle"},
              "ayasofya": {"q": "アヤソフィアって何？", "icon": "mosque"}},
    "areas": {"oldcity": {"color": "#ffd98a", "plan": [1, 2, 2]}, "beyoglu": {"color": "#d9ccf5", "plan": [1, 1, 2]},
              "asian": {"color": "#ffc4d2", "plan": [3, 2, 1]}},
    "summary": {
        "season": {"icon": "sun", "value": "4〜10月", "lead": "平年の最高気温が16〜28℃", "to": "#guide-season"},
        "safety": {"icon": "key", "value": "ぼったくりに注意", "lead": "旧市街とタクシムの夜のバー", "to": "#guide-safety"},
        "budget": {"icon": "wallet", "label": "乗り物の目安", "value": "1回46.20リラ", "lead": "メトロ・トラム・バス", "to": "#budget"},
        "transit": {"icon": "tram", "value": "トラムT1", "lead": "旧市街の名所を結ぶ", "to": "#guide-transit"},
    },
    "guides": {
        "airport": {"icon": "plane", "lead": "メトロM11かバスのハヴァイストで"},
        "transit": {"icon": "tram", "lead": "イスタンブールカードで乗る"},
        "pay": {"icon": "currency", "lead": "通貨はリラ。両替は街で"},
        "sim": {"icon": "sim", "lead": "4G はどの会社でも使える"},
        "safety": {"icon": "key", "lead": "ぼったくりバーと流しのタクシー"},
        "phrases": {"icon": "phrase"},
    },
    "season": {"lead": "歩きやすいのは4〜10月"},
    "pack": {"passport": "passport", "cash": "coin", "scarf": "shirt", "bottle": "bottle", "insurance": "firstaid", "umbrella": "umbrella"},
}
