"""エレバンの材料（guidebook.json）と組み立て（compose.json）の台本。

    python3 python/guide_book_build.py build armenia/yerevan           # 書く
    python3 python/guide_book_build.py build armenia/yerevan --check   # 台本と JSON が同じか

道具（`s` `t` `loc` `osm` `at` `maps` `photo` `store` `lm` `todo` `dish`）は `python/guide_book_build.py` が入れる。
座標は同じ置き場の `geo.json`、借りた写真の欄は `photos.json`（どちらも同じ道具の `geo` `photo` で足す）。
**JSON を手で直さない。** ここを直して build する。

エレバンは「行った」街（2026-04-19〜04-28・05-10〜05-23）。骨組み（外の出どころの事実）のほかに、
行った箱を配信の facts（streams/2026/04-05）から肉付けしている（下の「行った」。`.claude/skills/city-guide/briefs/articles.md`）。厚い所は記事
骨組みの品は、配信で行った所・食べたもの（カスケード・オペラ座・虐殺記念館・ブルーモスク・グム市場・エレバン湖・
セヴァン湖・ラフマジョ・ラヴァシュ・ガタ・シャウルマ）が肉付けの先になるように選んだ（facts から品は作らない）。
店に結ぶ品は、その店のいまの品書き（Glovo の配達の品書き。2026-11-23 に見た）か、2024年以降の Wikivoyage の店の欄に載っている品だけ。
"""

SEEN = "2026-11-23"
TOWN = "yerevan"
MAPS_AREA = "Yerevan"
# 日帰りの町の、地図の検索語に足す名前（鍵は cities.json の trips）
TRIP_AREAS = {"garni": "Garni", "etchmiadzin": "Vagharshapat", "khor-virap": "Lusarat", "sevan-lake": "Sevan", "noravank": "Areni"}
DISH_LOCAL_SRC = "wvam"

SRC = {
    "wv": ("Wikivoyage「Yerevan」", "https://en.wikivoyage.org/wiki/Yerevan"),
    "wvam": ("Wikivoyage「Armenia」", "https://en.wikivoyage.org/wiki/Armenia"),
    "wvgarni": ("Wikivoyage「Garni」", "https://en.wikivoyage.org/wiki/Garni"),
    "wvech": ("Wikivoyage「Echmiadzin」", "https://en.wikivoyage.org/wiki/Echmiadzin"),
    "wvsevan": ("Wikivoyage「Sevan」", "https://en.wikivoyage.org/wiki/Sevan"),
    "wvart": ("Wikivoyage「Artashat」", "https://en.wikivoyage.org/wiki/Artashat"),
    "wvyegh": ("Wikivoyage「Yeghegnadzor」", "https://en.wikivoyage.org/wiki/Yeghegnadzor"),
    "wvphr": ("Wikivoyage「Armenian phrasebook」", "https://en.wikivoyage.org/wiki/Armenian_phrasebook"),
    "jawp": ("Wikipedia（日本語）「エレバン」", "https://ja.wikipedia.org/wiki/%E3%82%A8%E3%83%AC%E3%83%90%E3%83%B3"),
    "rep": ("Wikipedia「Republic Square, Yerevan」", "https://en.wikipedia.org/wiki/Republic_Square,_Yerevan"),
    "casc": ("Wikipedia「Yerevan Cascade」", "https://en.wikipedia.org/wiki/Yerevan_Cascade"),
    "mat": ("Wikipedia「Matenadaran」", "https://en.wikipedia.org/wiki/Matenadaran"),
    "tsits": ("Wikipedia「Tsitsernakaberd」", "https://en.wikipedia.org/wiki/Tsitsernakaberd"),
    "mother": ("Wikipedia「Mother Armenia」", "https://en.wikipedia.org/wiki/Mother_Armenia"),
    "greg": ("Wikipedia「Saint Gregory the Illuminator Cathedral, Yerevan」",
             "https://en.wikipedia.org/wiki/Saint_Gregory_the_Illuminator_Cathedral,_Yerevan"),
    "blue": ("Wikipedia「Blue Mosque, Yerevan」", "https://en.wikipedia.org/wiki/Blue_Mosque,_Yerevan"),
    "ereb": ("Wikipedia「Erebuni Fortress」", "https://en.wikipedia.org/wiki/Erebuni_Fortress"),
    "opera": ("Wikipedia「Yerevan Opera Theatre」", "https://en.wikipedia.org/wiki/Yerevan_Opera_Theatre"),
    "hist": ("Wikipedia「History Museum of Armenia」", "https://en.wikipedia.org/wiki/History_Museum_of_Armenia"),
    "ybc": ("Wikipedia「Yerevan Brandy Company」", "https://en.wikipedia.org/wiki/Yerevan_Brandy_Company"),
    "parj": ("Wikipedia「Sergei Parajanov Museum」", "https://en.wikipedia.org/wiki/Sergei_Parajanov_Museum"),
    "ylake": ("Wikipedia「Yerevan Lake」", "https://en.wikipedia.org/wiki/Yerevan_Lake"),
    "garni": ("Wikipedia「Temple of Garni」", "https://en.wikipedia.org/wiki/Temple_of_Garni"),
    "ggorge": ("Wikipedia「Garni Gorge」", "https://en.wikipedia.org/wiki/Garni_Gorge"),
    "gegh": ("Wikipedia「Geghard」", "https://en.wikipedia.org/wiki/Geghard"),
    "ech": ("Wikipedia「Etchmiadzin Cathedral」", "https://en.wikipedia.org/wiki/Etchmiadzin_Cathedral"),
    "hrip": ("Wikipedia「Saint Hripsime Church」", "https://en.wikipedia.org/wiki/Saint_Hripsime_Church"),
    "zvar": ("Wikipedia「Zvartnots Cathedral」", "https://en.wikipedia.org/wiki/Zvartnots_Cathedral"),
    "khor": ("Wikipedia「Khor Virap」", "https://en.wikipedia.org/wiki/Khor_Virap"),
    "sevv": ("Wikipedia「Sevanavank」", "https://en.wikipedia.org/wiki/Sevanavank"),
    "sevl": ("Wikipedia「Lake Sevan」", "https://en.wikipedia.org/wiki/Lake_Sevan"),
    "nora": ("Wikipedia「Noravank」", "https://en.wikipedia.org/wiki/Noravank"),
    "ararat": ("Wikipedia「Mount Ararat」", "https://en.wikipedia.org/wiki/Mount_Ararat"),
    "cuis": ("Wikipedia「Armenian cuisine」", "https://en.wikipedia.org/wiki/Armenian_cuisine"),
    "lavash": ("Wikipedia「Lavash」", "https://en.wikipedia.org/wiki/Lavash"),
    "khorov": ("Wikipedia「Khorovats」", "https://en.wikipedia.org/wiki/Khorovats"),
    "khash": ("Wikipedia「Khash (dish)」", "https://en.wikipedia.org/wiki/Khash_(dish)"),
    "spas": ("Wikipedia「Spas (soup)」", "https://en.wikipedia.org/wiki/Spas_(soup)"),
    "ghap": ("Wikipedia「Ghapama」", "https://en.wikipedia.org/wiki/Ghapama"),
    "lahm": ("Wikipedia「Lahmacun」", "https://en.wikipedia.org/wiki/Lahmacun"),
    "gata": ("Wikipedia「Gata (food)」", "https://en.wikipedia.org/wiki/Gata_(food)"),
    "zhing": ("Wikipedia「Zhingyalov hats」", "https://en.wikipedia.org/wiki/Zhingyalov_hats"),
    "matn": ("Wikipedia「Matnakash」", "https://en.wikipedia.org/wiki/Matnakash"),
    "khach": ("Wikipedia「Khachapuri」", "https://en.wikipedia.org/wiki/Khachapuri"),
    "areni": ("Wikipedia「Areni (grape)」", "https://en.wikipedia.org/wiki/Areni_(grape)"),
    "khk": ("Wikipedia「Khachkar」", "https://en.wikipedia.org/wiki/Khachkar"),
    "carpet": ("Wikipedia「Armenian carpet」", "https://en.wikipedia.org/wiki/Armenian_carpet"),
    "duduk": ("Wikipedia「Duduk」", "https://en.wikipedia.org/wiki/Duduk"),
    "tz": ("Wikipedia「Time in Armenia」", "https://en.wikipedia.org/wiki/Time_in_Armenia"),
    "hol": ("Wikipedia「Public holidays in Armenia」", "https://en.wikipedia.org/wiki/Public_holidays_in_Armenia"),
    "evn": ("Wikipedia「Zvartnots International Airport」", "https://en.wikipedia.org/wiki/Zvartnots_International_Airport"),
    "metro": ("Wikipedia「Yerevan Metro」", "https://en.wikipedia.org/wiki/Yerevan_Metro"),
    "tel": ("Wikipedia「Telecommunications in Armenia」", "https://en.wikipedia.org/wiki/Telecommunications_in_Armenia"),
    "mofa": ("外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
             "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html"),
    "cba": ("アルメニア中央銀行の為替レート（2026年11月20日）", "https://api.cba.am/exchangerates.asmx"),
    "veltra": ("VELTRA「エレバン市内半日観光ツアー＜貸切／日本語ガイド／4時間／エレバン発＞」（2026年2月20日）",
               "https://www.veltra.com/jp/europe/armenia/a/188787"),
    "tj": ("トラベルjp「【2025年最新】アルメニアでおすすめの観光地14選 ミステリアスな風景の虜に」（2025年4月14日更新）",
           "https://www.travel.co.jp/guide/matome/3139/"),
    "trip": ("Trip.com「2024年版エレバン観光ガイド」（Trip Moments）", "https://jp.trip.com/moments/yerevan-21357/"),
    # 店のいまの品書き（Glovo の配達の品書き。値段は配達の値段で、店で食べる値段と違うことがある）
    "gkaras": ("Glovo「KARAS」（配達の品書き）", "https://glovoapp.com/en/am/yerevan/stores/karas-yvn"),
    "gartlunch": ("Glovo「Art Lunch」（配達の品書き）", "https://glovoapp.com/en/am/yerevan/stores/art-lunch-yrv-yrv"),
    "gmaster": ("Glovo「Master Class」（配達の品書き）", "https://glovoapp.com/en/am/yerevan/stores/master-class-yrv"),
    "gost": ("Glovo「OST」（配達の品書き）", "https://glovoapp.com/en/am/yerevan/stores/ost"),
    "gtumanyan": ("Glovo「Tumanyan Shaurma」（配達の品書き）", "https://glovoapp.com/en/am/yerevan/stores/tumanyan-shaurma"),
}


STORES = {
    "karas": store("karas", "カラス（郷土料理のチェーン）", "Karas", "west", "karas",
                   "郷土料理のチェーン。品書きに鶏のホロヴァツ（3,730ドラム）・ドルマ（2,160ドラム）・ハシュ（2,730ドラム）・"
                   "ハリサ（1,370ドラム）・スパス（950ドラム）・ラフマジョ（480ドラム）・タン。",
                   s("gkaras")),
    "artlunch": store("artlunch", "アート・ランチ（食堂）", "Art Lunch", "south", "artlunch",
                      "スープと家庭料理の食堂。品書きにハリサ（930ドラム）・スパス（560ドラム）・キュフタ（1,080ドラム）・"
                      "ガタ（100gで250ドラム）・ラヴァシュ（50gで60ドラム）・ハチャプリ・タン。",
                      s("gartlunch")),
    "masterclass": store("masterclass", "マスター・クラス（シャウルマとラフマジョ）", "Master Class", "south", "masterclass",
                         "シャウルマとラフマジョの店。品書きに鶏のシャウルマ（小さいもので820ドラム）・ラフマジョ（1,100ドラム）・タン。",
                         s("gmaster")),
    "ost": store("ost", "オスト（ラフマジョとハチャプリ）", "OST", "center", "ost",
                 "安い軽食の店。品書きにラフマジョ（1,400ドラム）・メグレリ風のハチャプリ（3,500ドラム）・タン（500ドラム）。",
                 s("gost", "wv")),
    "tumanyan": store("tumanyan", "トゥマニャン・シャウルマ", "Tumanyan Shaurma", "republic", "tumanyan",
                      "エレバン風のシャウルマの地元のチェーンで、街に十数店ある。品書きに鶏のシャウルマ（XL 1,950ドラム）・"
                      "豚のシャウルマ（XL 2,050ドラム）。どちらも細く削ったじゃがいもを巻く。",
                      s("wv", "gtumanyan")),
    "mertaghe": store("mertaghe", "メル・タゲ（ラフマジョの店）", "Mer Taghe", "center", "mertaghe",
                      "トゥマニャン通りの小さなラフマジョの店。マンティと、地方のラザニアに似たノラハルスもある。",
                      s("wv")),
    "tunlahmajo": store("tunlahmajo", "トゥン・ラフマジョ（ラフマジョの店）", "Tun Lahmajo", "center", "tunlahmajo",
                        "とても安いラフマジョの店で、いつも地元の人でいっぱい。",
                        s("wv")),
    "grandcandy": store("grandcandy", "グランド・キャンディのポンチク屋", "Ponchikanots", "cascade", "grandcandy",
                        "ソ連の時代のポンチク屋のあとに入った、菓子の会社グランド・キャンディの店。揚げたてのポンチクを安く出し、"
                        "地元で作った飴とチョコレートも売る。10時〜20時。",
                        s("wv")),
    "gum": store("gum", "グム市場", "GUM Market", "south", "gum",
                 "タシール・モールの近くの、屋根つきの大きな市場。果物と野菜、ドライフルーツ、肉、干したハーブの売り場がある。",
                 s("wvam")),
    "vernissage": store("vernissage", "ヴェルニサージュ（週末の青空市）", "Vernissage", "republic", "vernissage",
                        "土曜と日曜に開く青空の市。古いじゅうたん・木彫り・バックギャモンの盤・絵・みやげ・古い磁器・刺しゅう・石の細工・楽器が並ぶ。",
                        s("wvam", "wv")),
}

# ------------------------------------------------------------------ 見たいもの
see = [
    {"key": "republic", "town": "yerevan", "name": "共和国広場", "local": loc("Հանրապետության հրապարակ", "Hanrapetutyan hraparak", "rep"),
     "rank": 1, "what": t("街のまん中の広場。楕円の広場と、音楽に合わせて動く噴水の池からなる。まわりの5つの建物は、ピンクと黄色の凝灰岩で建てた、アルメニアの模様を使った新古典様式。", "rep"),
     "went": False, **at("republic"), "info": [], "maps": maps("Republic Square"),
     "photo": photo("republic", "共和国広場。ピンクの石の建物が広場を囲む")},
    {"key": "cascade", "town": "yerevan", "name": "カスケード", "local": loc("Կասկադ", "Kaskad", "casc"),
     "rank": 1, "what": t("テラス・噴水・彫刻・展示室を段々に重ねた、大きな階段の建物。街のまん中と北の高台を結び、街の象徴の1つ。", "casc"),
     "went": False, **at("cascade"),
     "info": [{"label": "入場", "text": "1階と、上まで行く中のエスカレーターはただ。カフェスジアン美術館の展示は大人1,000ドラム（約440円）", "src": s("wv")}],
     "maps": maps("Cascade Complex"), "links": {"todo": ["cascade"]},
     "photo": photo("cascade", "カスケード。白い大きな階段と噴水")},
    {"key": "matenadaran", "town": "yerevan", "name": "マテナダラン（古文書館）", "local": loc("Մատենադարան", "Matenadaran", "mat"),
     "rank": 1, "what": t("アルメニアの写本を世界でいちばん多く持つ、博物館と研究所を兼ねた古文書館。前に、アルメニア文字を作ったメスロプ・マシュトツの像が立つ。", "mat", "wv"),
     "went": False, **at("matenadaran"), "info": [], "maps": maps("Matenadaran"),
     "photo": photo("matenadaran", "マテナダランの建物と、前に立つ像")},
    {"key": "genocide", "town": "yerevan", "name": "アルメニア人虐殺記念館（ツィツェルナカベルド）", "local": loc("Ծիծեռնակաբերդ", "Tsitsernakaberd", "tsits"),
     "rank": 1, "what": t("1915年ごろのオスマン帝国によるアルメニア人虐殺の犠牲者をしのぶ、国の記念碑と博物館。1967年に「つばめの砦」という名の丘に建てた。毎年4月24日には多くの人が花を手向ける。", "tsits", "wv"),
     "went": False, **at("genocide"),
     "info": [{"label": "開館", "text": "記念碑はいつでも入れる。博物館は火〜日曜の11時〜16時で、入場はただ", "src": s("wv")}],
     "maps": maps("Tsitsernakaberd"), "photo": photo("genocide", "丘の上の虐殺記念碑を上から")},
    {"key": "mother", "town": "yerevan", "name": "母なるアルメニア像", "local": loc("Մայր Հայաստան", "Mayr Hayastan", "mother"),
     "rank": 2, "what": t("勝利公園から街を見下ろす女性の像。1967年に、スターリンの像に代えて立てた。", "mother", "wv"),
     "went": False, **at("mother"), "info": [], "maps": maps("Mother Armenia"), "links": {"todo": ["cascade"]},
     "photo": photo("mother", "剣を持って立つ母なるアルメニア像")},
    {"key": "gregory", "town": "yerevan", "name": "聖グレゴリー啓蒙者大聖堂", "local": loc("Սուրբ Գրիգոր Լուսավորիչ", "Surb Grigor Lusavorich", "greg"),
     "rank": 2, "what": t("アルメニア使徒教会でいちばん大きな大聖堂。キリスト教の国になって1700年を記念して、2001年にできた。", "greg", "wv"),
     "went": False, **at("gregory"), "info": [], "maps": maps("Saint Gregory the Illuminator Cathedral"),
     "photo": photo("gregory", "聖グレゴリー啓蒙者大聖堂の外観")},
    {"key": "bluemosque", "town": "yerevan", "name": "ブルーモスク", "local": loc("Կապույտ մզկիթ", "Kapuyt mzkit", "blue"),
     "rank": 2, "what": t("18世紀にイランのハーンが建てたシーア派のモスク。街のまん中に残るいちばん古い建物の1つで、いまアルメニアで礼拝をしているただ1つのモスク。", "blue"),
     "went": False, **at("bluemosque"), "info": [], "maps": maps("Blue Mosque"),
     "photo": photo("bluemosque", "ブルーモスクの青いタイルの丸屋根")},
    {"key": "vernissage", "town": "yerevan", "name": "ヴェルニサージュ", "local": loc("Վեռնիսաժ", "Vernisazh", "wv"),
     "rank": 1, "what": t("共和国広場の近くで、土曜と日曜に開く工芸品と古物の青空市。", "wvam", "wv"),
     "went": False, **at("vernissage"),
     "info": [{"label": "開く日", "text": "土曜・日曜", "src": s("wv")}],
     "maps": maps("Vernissage"), "links": {"todo": ["vernissage"]},
     "photo": photo("vernissage", "ヴェルニサージュの工芸品の売り場")},
    {"key": "erebuni", "town": "yerevan", "name": "エレブニ要塞", "local": loc("Էրեբունի", "Erebuni", "ereb"),
     "rank": 2, "what": t("ウラルトゥ王国の要塞の町の跡。紀元前782年から丘の上に建ち、エレバンという名前はエレブニから来ている。", "ereb", "wv"),
     "went": False, **at("erebuni"),
     "info": [{"label": "入場", "text": "博物館と遺跡で1,000ドラム（約440円）、遺跡だけなら500ドラム。火〜日曜の10時半〜16時半", "src": s("wv")}],
     "maps": maps("Erebuni Fortress"), "photo": photo("erebuni", "丘の上のエレブニ要塞の石の壁")},
    {"key": "opera", "town": "yerevan", "name": "オペラ座（オペラ・バレエ劇場）", "local": loc("Օպերայի և բալետի թատրոն", "Operayi yev baleti tatron", "opera"),
     "rank": 2, "what": t("1933年に開いた、オペラとバレエの劇場。設計は街の計画を手がけた建築家タマニャン。前は自由広場。", "opera", "wv"),
     "went": False, **at("opera"), "info": [], "maps": maps("Yerevan Opera Theatre"),
     "photo": photo("opera", "円い形のオペラ座の建物")},
    {"key": "history", "town": "yerevan", "name": "アルメニア歴史博物館", "local": loc("Հայաստանի պատմության թանգարան", "Hayastani patmutyan tangaran", "hist"),
     "rank": 2, "what": t("共和国広場に建つ国の博物館。1920年にでき、40万点を持つ。考古・貨幣・民族の部がある。", "hist"),
     "went": False, **at("history"),
     "info": [{"label": "入場", "text": "2,000ドラム（約880円）。火〜土曜の11時〜18時、日曜は11時〜17時", "src": s("wv")}],
     "maps": maps("History Museum of Armenia"), "photo": photo("history", "夜の歴史博物館。共和国広場に面した建物")},
    {"key": "brandy", "town": "yerevan", "name": "エレバン・ブランデー工場（アララト）", "local": loc("Երևանի կոնյակի գործարան", "Yerevani konyaki gortsaran", "ybc"),
     "rank": 2, "what": t("アララトの名前でブランデーを造る工場。フラズダン川を見下ろす建物は1953年にでき、敷地の中にアララト博物館がある。", "ybc"),
     "went": False, **at("brandy"), "info": [], "maps": maps("Yerevan Brandy Company"), "links": {"todo": ["brandy"]},
     "photo": photo("brandy", "川の上に建つブランデー工場の建物")},
    {"key": "gum", "town": "yerevan", "name": "グム市場", "local": loc("ԳՈՒՄ շուկա", "GUM shuka", "wvam"),
     "rank": 2, "what": t("タシール・モールの近くの、屋根つきの大きな市場。果物と野菜、ドライフルーツ、肉、干したハーブの売り場がある。", "wvam"),
     "went": False, **at("gum"), "info": [], "maps": maps("GUM Market"),
     "photo": photo("gum", "グム市場に山と積まれたドライフルーツ")},
    {"key": "northern", "town": "yerevan", "name": "北大通り", "local": loc("Հյուսիսային պողոտա", "Hyusisayin poghota", "wv"),
     "rank": 3, "what": t("オペラ座と共和国広場を結ぶ、歩行者の通り。2008年に開いた。", "wv"),
     "went": False, **at("northern"), "info": [], "maps": maps("Northern Avenue"),
     "photo": photo("northern", "北大通り。両側に石の建物が並ぶ歩行者の道")},
    {"key": "parajanov", "town": "yerevan", "name": "パラジャーノフ博物館", "local": loc("Սերգեյ Փարաջանովի թանգարան", "Sergey Parajanovi tangaran", "parj"),
     "rank": 2, "what": t("ソ連の映画監督で美術家のセルゲイ・パラジャーノフの家の博物館。コラージュの作品で知られる。", "parj", "wv"),
     "went": False, **at("parajanov"),
     "info": [{"label": "入場", "text": "1,000ドラム（約440円）。毎日10時〜17時半", "src": s("wv")}],
     "maps": maps("Sergei Parajanov Museum"), "photo": photo("parajanov", "峡谷の上に建つパラジャーノフ博物館")},
    {"key": "yerevanlake", "town": "yerevan", "name": "エレバン湖", "local": loc("Երևանյան լիճ", "Yerevanyan lich", "ylake"),
     "rank": 3, "what": t("街の南西、フラズダン渓谷の先にある人造の湖。1963年に造られ、広さは57.45ha。", "ylake", "wv"),
     "went": False, **at("yerevanlake"), "info": [], "maps": maps("Yerevan Lake"),
     "photo": photo("yerevanlake", "エレバン湖と、まわりの街")},
    # 日帰り
    {"key": "garni", "town": "garni", "name": "ガルニ神殿", "local": loc("Գառնիի տաճար", "Garnii tachar", "garni"),
     "rank": 1, "what": t("イオニア式の柱が並ぶ神殿で、キリスト教より前のアルメニアのいちばんの象徴。旧ソ連でただ1つ、ほぼ形の残るヘレニズムの建物。1679年の地震で崩れ、1970年代に建て直した。", "garni", "wvgarni"),
     "went": False, **at("garni"), "info": [], "maps": maps("Garni Temple", "garni"), "links": {"todo": ["garni"]},
     "photo": photo("garni", "ガルニ神殿。石の階段の上に柱が並ぶ")},
    {"key": "geghard", "town": "garni", "name": "ゲガルド修道院", "local": loc("Գեղարդ", "Geghard", "gegh"),
     "rank": 1, "what": t("山を半分掘って造った修道院で、ユネスコの世界遺産。4世紀にグレゴリウスが洞窟の泉に開き、いまの本堂は1215年にできた。", "gegh"),
     "went": False, **at("geghard"), "info": [], "maps": maps("Geghard Monastery", "garni"), "links": {"todo": ["garni"]},
     "photo": photo("geghard", "崖を背にしたゲガルド修道院")},
    {"key": "symphony", "town": "garni", "name": "石のシンフォニー（ガルニ渓谷）", "local": loc("Քարերի սիմֆոնիա", "Kareri simfonia", "ggorge"),
     "rank": 3, "what": t("アザト川が削ったガルニ渓谷の壁に、六角の玄武岩の柱が並ぶ。上の岬にガルニ神殿が建つ。", "ggorge", "wvgarni"),
     "went": False, **at("symphony"), "info": [], "maps": maps("Symphony of Stones", "garni"), "links": {"todo": ["garni"]},
     "photo": photo("symphony", "渓谷の壁に並ぶ六角の石の柱")},
    {"key": "etchmiadzin", "town": "etchmiadzin", "name": "エチミアジン大聖堂", "local": loc("Էջմիածնի Մայր տաճար", "Ejmiatsni Mayr tachar", "ech"),
     "rank": 1, "what": t("アルメニア使徒教会の総本山。言い伝えでは301〜303年にグレゴリウスが建て、世界でいちばん古い大聖堂とされることが多い。", "ech", "wvech"),
     "went": False, **at("etchmiadzin"), "info": [], "maps": maps("Etchmiadzin Cathedral", "etchmiadzin"), "links": {"todo": ["etchmiadzin"]},
     "photo": photo("etchmiadzin", "エチミアジン大聖堂の石の外観")},
    {"key": "hripsime", "town": "etchmiadzin", "name": "聖フリプシメ教会", "local": loc("Սուրբ Հռիփսիմե", "Surb Hripsime", "hrip"),
     "rank": 2, "what": t("618年に、アルメニアのキリスト教化の話に出てくるローマの乙女フリプシメの墓の上に建てた教会。アルメニアの古い建築の傑作とされる。", "hrip"),
     "went": False, **at("hripsime"), "info": [], "maps": maps("Saint Hripsime Church", "etchmiadzin"), "links": {"todo": ["etchmiadzin"]},
     "photo": photo("hripsime", "聖フリプシメ教会の石の外観")},
    {"key": "zvartnots", "town": "etchmiadzin", "name": "ズヴァルトノツ古代遺跡", "local": loc("Զվարթնոց", "Zvartnots", "zvar"),
     "rank": 2, "what": t("643〜652年に建てた大聖堂の跡。外が円い三層の建物で、中世のアルメニアの建物では他に例が無い。小さな博物館がある。", "zvar", "wvech", "tj"),
     "went": False, **at("zvartnots"), "info": [], "maps": maps("Zvartnots Cathedral", "etchmiadzin"), "links": {"todo": ["etchmiadzin"]},
     "photo": photo("zvartnots", "ズヴァルトノツの大聖堂の跡。円く並ぶ柱")},
    {"key": "khorvirap", "town": "khor-virap", "name": "ホル・ヴィラップ修道院", "local": loc("Խոր Վիրապ", "Khor Virap", "khor"),
     "rank": 1, "what": t("トルコとの国境の近く、アララト平原の修道院。国の守護聖人グレゴリウスが王に13年閉じ込められた所で、巡礼の地。", "khor"),
     "went": False, **at("khorvirap"), "info": [], "maps": maps("Khor Virap Monastery", "khor-virap"), "links": {"todo": ["khorvirap"]},
     "photo": photo("khorvirap", "ホル・ヴィラップ修道院と、うしろのアララト山")},
    {"key": "sevanavank", "town": "sevan-lake", "name": "セヴァナヴァンク（セヴァン修道院）", "local": loc("Սևանավանք", "Sevanavank", "sevv"),
     "rank": 1, "what": t("セヴァン湖の北西の半島に建つ修道院で、874年にできた。もとは島だったが、スターリンの時代に湖の水を抜いて水面が約20m下がり、半島になった。", "sevv"),
     "went": False, **at("sevanavank"), "info": [], "maps": maps("Sevanavank", "sevan-lake"), "links": {"todo": ["sevan"]},
     "photo": photo("sevanavank", "セヴァナヴァンクの壁にはめ込まれた、十字と組みひもを彫った古い石")},
    {"key": "noravank", "town": "noravank", "name": "ノラヴァンク修道院", "local": loc("Նորավանք", "Noravank", "nora"),
     "rank": 2, "what": t("エレバンから122km、アマグ川の細い渓谷にある13世紀の修道院。向かいの赤い崖と、壁から突き出た石の階段で上る2階建ての教会で知られる。", "nora", "tj"),
     "went": False, **at("noravank"),
     "info": [{"label": "行き方", "text": "エレバンのゴルツァラナイン駅の近くから、イェゲグナゾル行きのマルシュルートカ（乗合バス）で1時間半〜2時間、2,000ドラム（2025年4月）。8時〜18時に出る", "src": s("wvyegh")}],
     "maps": maps("Noravank Monastery", "noravank"), "photo": photo("noravank", "赤い崖の下のノラヴァンク修道院")},
]

# ------------------------------------------------------------------ やりたいこと
todos = [
    todo("cascade", "大階段カスケードを上りたい！", "上の段から、アララト山と街を見渡す", {
        "what": [t("テラスと噴水と彫刻のある大きな階段の建物、カスケードを上る。", "casc")],
        "why": [t("建築家タマニャンが描いた街の計画の軸の上にあり、街の象徴の1つ。", "casc"),
                t("上の段からは、アララト山と街のまん中が見渡せる。", "wv")],
        "how": [t("オペラ座のすぐ北。ふもとの彫刻の庭には、ボテロなど世界の作家の作品が並ぶ。", "wv")],
        "time": [t("中のエスカレーターは毎日8時〜20時。段ごとに外へ出られる。", "wv")],
        "money": [t("1階と中のエスカレーターはただ。カフェスジアン美術館の展示は大人1,000ドラム（約440円）。", "wv")],
        "tips": [t("夕方に上ると、街とアララト山の眺めがいい。", "wv")],
        "route": [t("上ったら道を渡って勝利公園へ。母なるアルメニア像と遊園地がある。", "wv")],
    }, link_see=["cascade", "mother"], ph="do"),
    todo("khorovats", "本場のホロヴァツを食べたい！", "肉も野菜も炭火で焼く、アルメニアのバーベキュー", {
        "what": [t("アルメニアの焼き肉、ホロヴァツを食べる。", "khorov", "wvam")],
        "why": [t("豚・羊・鶏・牛の塊を焼き、玉ねぎとアルメニアのスパイスで味をつける。トマト・なす・ピーマンも一緒に焼く。", "wvam"),
                t("ひき肉で作るものはキャバブと呼び、ホロヴァツより安い。", "wvam"),
                t("焼いた肉は、薄いパンのラヴァシュで包んで食べる。", "lavash")],
        "how": [t("郷土料理のチェーン、カラスの品書きに鶏のホロヴァツがある。ラヴァシュ4枚と玉ねぎ、香草が付く。", "gkaras")],
        "money": [t("カラスの鶏のホロヴァツは3,730ドラム（約1,640円）。", "gkaras")],
        "tips": [t("夏は、フラズダン渓谷の店で地元の人がホロヴァツとザリガニを囲む。値段は店でまちまちなので、先に確かめる。", "wv")],
    }, link_eat=["khorovats", "kebab", "lavash"], ph="do"),
    todo("brandy", "アララトのブランデー工場を見学したい！", "1887年から続く蒸留所の熟成庫へ", {
        "what": [t("アララトの名前でブランデーを造るエレバン・ブランデー工場の、博物館のツアーに入る。", "ybc")],
        "why": [t("1887年に商人のネルセス・タイリャンがエレバンに開いた蒸留所が始まり。", "ybc"),
                t("1902年のボルドーの博覧会で、コニャックの造りの基準にかなうと認められた。", "ybc"),
                t("1940年代にできた「ドヴィン」は、イギリスの首相に好まれたと伝わる。", "ybc")],
        "how": [t("フラズダン川を見下ろす建物で、1953年にできた。", "ybc")],
        "time": [t("ツアーは、いまも使う熟成庫を通って、たいてい試飲で終わる。", "ybc")],
        "tips": [t("アルメニアのブランデーは土産の定番。街なかにアララトのブランデーだけを売る店がいくつもあり、空港の免税店でも買える。", "wv")],
    }, link_see=["brandy"], ph="do"),
    todo("vernissage", "ヴェルニサージュでおみやげを探したい！", "週末だけの青空市に、じゅうたんと工芸品", {
        "what": [t("共和国広場の近くで週末に開く青空の市、ヴェルニサージュを歩く。", "wvam")],
        "why": [t("古いじゅうたん、木彫りとバックギャモンの盤、絵、みやげ、古い磁器、刺しゅう、石の細工が並ぶ。", "wvam")],
        "how": [t("アラム通りとブザンド通りのあいだの公園。共和国広場から歩ける。", "wv")],
        "time": [t("開くのは土曜と日曜。", "wv")],
        "tips": [t("古いじゅうたんを国の外へ持ち出すには、文化省の輸出の証明が要る。買うときに売り手に取ってもらう。", "wv")],
    }, link_see=["vernissage"], ph="do"),
    todo("garni", "ガルニ神殿とゲガルド修道院へ行きたい！", "ギリシャ風の神殿と、岩を掘った世界遺産", {
        "what": [t("エレバンの東の、ガルニ神殿とゲガルド修道院を1日で回る。", "wvgarni")],
        "why": [t("ガルニ神殿はイオニア式の柱が並ぶ神殿で、キリスト教より前のアルメニアのいちばんの象徴。", "garni"),
                t("ゲガルド修道院は山を半分掘って造った修道院で、ユネスコの世界遺産。", "gegh"),
                t("神殿の下のガルニ渓谷には、六角の玄武岩の柱が並ぶ。", "ggorge")],
        "how": [t("エレバンのガイ・バスステーションから266番のマルシュルートカ（乗合バス）でガルニへ。約30分おきに出る。", "wvgarni"),
                t("いちばん速いのはタクシー。", "wvgarni")],
        "route": [t("先にゲガルドへ行き、そこからガルニへ戻るように回るとよい。ガルニ・ゴグト・ゲガルドのあいだは3〜4kmずつ。", "wvgarni")],
    }, link_see=["garni", "geghard", "symphony"], ph="do", town="garni"),
    todo("khorvirap", "ホル・ヴィラップからアララト山を見たい！", "トルコ国境の近くで、聖書の山を正面に", {
        "what": [t("トルコとの国境の近くの修道院、ホル・ヴィラップへ行き、アララト山を見る。", "khor", "tj")],
        "why": [t("国の守護聖人グレゴリウスが、王に13年閉じ込められた所。", "khor"),
                t("アララト山は、ノアの箱舟がたどり着いたと伝わる山。", "ararat")],
        "how": [t("エレバンの南バスステーションから467番のマルシュルートカで、修道院から1.5kmの所まで行ける。", "wvart")],
        "tips": [t("グレゴリウスが閉じ込められた深い穴には、いまも下りられる。", "wvart")],
        "route": [t("エレバン発の1日ツアーは、ホル・ヴィラップと、さらに南のノラヴァンクを合わせて回ることが多い。", "wvart")],
    }, link_see=["khorvirap", "noravank"], ph="do", town="khor-virap"),
    todo("etchmiadzin", "世界最古の大聖堂へ行きたい！", "301年にキリスト教を選んだ国の総本山", {
        "what": [t("アルメニア使徒教会の総本山、エチミアジン大聖堂へ行く。", "ech")],
        "why": [t("言い伝えでは301〜303年にグレゴリウスが建てた。世界でいちばん古い大聖堂とされることが多い。", "ech"),
                t("アルメニアは301年に、世界で最初に公式にキリスト教を受け入れた国。", "mofa")],
        "how": [t("エレバンの中央（キリキア）バスステーションから203番のマルシュルートカで20〜30分。", "wvech")],
        "route": [t("途中のズヴァルトノツ大聖堂の跡でも降りられる。", "wvech"),
                  t("同じ街に、618年に建てた聖フリプシメ教会がある。", "hrip")],
    }, link_see=["etchmiadzin", "hripsime", "zvartnots"], ph="do", town="etchmiadzin"),
    todo("sevan", "セヴァン湖へ日帰りしたい！", "コーカサスでいちばん大きな湖と、半島の修道院", {
        "what": [t("アルメニアとコーカサスでいちばん大きな湖、セヴァン湖へ行く。", "sevl")],
        "why": [t("湖の北西の半島に、874年にできた修道院セヴァナヴァンクが建つ。", "sevv"),
                t("修道院からは、広い湖が見渡せる。", "wvsevan")],
        "how": [t("エレバンの北バスステーションから、セヴァンの町へマルシュルートカで1時間。", "wvsevan")],
        "tips": [t("湖のあたりの名物は魚とザリガニ。焼いても、揚げても、燻しても出す。", "wvsevan")],
    }, link_see=["sevanavank"], ph="do", town="sevan-lake"),
]

# ------------------------------------------------------------------ 食べたいもの
eat_items = [
    dish("khorovats", "ホロヴァツ（アルメニアのバーベキュー）", "Khorovats", ["local"], False, None,
         t("肉の塊を焼き、玉ねぎとアルメニアのスパイスで味をつける。トマト・なす・ピーマンも一緒に焼く。", "wvam", "khorov"), ["karas"],
         pork_note=t("豚・羊・鶏・牛のどれでも作る。カラスの品書きのホロヴァツは鶏。", "wvam", "gkaras")),
    dish("kebab", "キャバブ（ひき肉の串焼き）", "Kebab", ["local", "quick"], False, None,
         t("ホロヴァツをひき肉で作ったもので、ホロヴァツより安い。", "wvam"),
         pork_note=t("ひき肉が何の肉かは、出どころに書かれていない。", "wvam")),
    dish("lavash", "ラヴァシュ（薄いパン）", "Lavash", ["local", "quick"], False, False,
         t("薄くて大きなパン。タンドールの壁に貼って焼く。アルメニアでは毎日食べ、焼いた肉を包むのにも使う。", "lavash"), ["artlunch"]),
    dish("dolma", "ドルマ（ぶどうの葉の包み）", "Dolma", ["local"], False, None,
         t("ぶどうの葉で包む。キャベツの葉や、ピーマン・なすに詰める作りもある。", "wvam"), ["karas"],
         pork_note=t("中の肉が何の肉かは、品書きに書かれていない。", "gkaras")),
    dish("khash", "ハシュ（牛の足の煮込み）", "Khash", ["local"], False, False,
         t("牛や羊の頭・足・胃を煮た、アルメニアの古い料理。冬のごちそうで、慣れの要る味と言われる。", "khash", "wvam"), ["karas"]),
    dish("harissa", "ハリサ（麦と肉の粥）", "Harissa", ["local"], False, False,
         t("煮てほぐした鶏か羊の肉と、ひいた麦を粥のように煮る。復活祭に食べ、国の料理とされる。", "wvam"), ["karas", "artlunch"]),
    dish("spas", "スパス（ヨーグルトのスープ）", "Spas", ["local"], False, False,
         t("発酵乳マツンのスープ。香草と皮をむいた麦を入れ、卵と小麦粉で分離を防ぐ。", "spas"), ["karas", "artlunch"]),
    dish("lahmajo", "ラフマジョ（薄焼きの肉のパン）", "Lahmajo", ["local", "quick"], False, None,
         t("薄い生地に、ひき肉・刻んだ野菜・香草をのせて焼く。", "lahm"), ["tunlahmajo", "mertaghe", "ost", "karas"],
         pork_note=t("のせるひき肉は牛か羊が多い。オストとカラスの品書きは牛肉。", "lahm", "gost", "gkaras")),
    dish("khachapuri", "ハチャプリ（チーズのパン）", "Khachapuri", ["quick"], False, False,
         t("チーズを詰めて焼く、ジョージアのパン。", "khach"), ["ost", "artlunch"]),
    dish("shaurma", "シャウルマ（エレバン風のシャワルマ）", "Shaurma", ["quick"], False, None,
         t("肉と、細く削ったじゃがいも・玉ねぎ・香草・トマト・漬けたきゅうりを巻く。", "gtumanyan"), ["tumanyan", "masterclass"],
         pork_note=t("トゥマニャン・シャウルマの品書きには鶏と豚がある。マスター・クラスの品書きは鶏。", "gtumanyan", "gmaster")),
    dish("zhingyalov", "ジンガロフ・ハツ（香草を包んだパン）", "Jingalov Hats", ["local"], False, False,
         t("刻んだ香草と青い野菜を包んだ平たいパン。アルツァフとシュニクのアルメニア人の料理。", "zhing", "wvam")),
    dish("manti", "マンティ（小さな肉のギョウザ）", "Manti", ["local"], False, None,
         t("ギョウザの一種。ラフマジョの店メル・タゲでも出す。", "wvam", "wv"), ["mertaghe"],
         pork_note=t("中の肉が何の肉かは、出どころに書かれていない。", "wvam", "wv")),
    dish("kufta", "キュフタ（肉団子）", "Kufta", ["local"], False, None,
         t("肉を使った団子の料理。挽き割り麦と合わせたイシュリ・キュフタもある。", "wvam"), ["artlunch"],
         pork_note=t("アート・ランチの品書きのキュフタは牛肉。", "gartlunch")),
    dish("ghapama", "ガパマ（かぼちゃの詰め物）", "Ghapama", ["local", "sweets"], False, None,
         t("中をくりぬいたかぼちゃに、米・バター・はちみつ・ドライフルーツ・木の実を詰めて焼く。デザートとして出すことが多い。", "ghap"),
         pork_note=t("肉を詰める作りもあり、何の肉かは出どころに書かれていない。", "ghap")),
    dish("sujukh", "スジュフ（干したソーセージ）", "Sujukh", ["local"], False, False,
         t("牛肉で作る、干して塩漬けにした辛いソーセージ。トルコのスジュクより詰まっていて辛い。", "cuis")),
    dish("matnakash", "マトナカシュ（ふんわりしたパン）", "Matnakash", ["local"], False, False,
         t("発酵させたふっくらしたパン。指で筋をつけて形を作り、甘い紅茶を塗って焼くので皮が金色になる。", "matn")),
    dish("matsun", "マツン（ヨーグルト）", "Matsun", ["local"], False, False,
         t("何世紀も前からある、アルメニアのヨーグルト。冷やして食べると、夏の暑い日にさっぱりする。", "wvam")),
    dish("gata", "ガタ（甘いパン）", "Gata", ["sweets"], False, False,
         t("アルメニアの甘いパン。町や地方で形が違う。よく食べられるコリツは、小麦粉・バター・砂糖の詰め物を入れる。", "gata"), ["artlunch"]),
    dish("ponchik", "ポンチク（カスタードの揚げパン）", "Ponchik", ["sweets"], False, False,
         t("揚げた生地にカスタードを詰め、粉砂糖をかけたドーナツ。", "wv"), ["grandcandy"]),
    dish("apricot", "あんず（アプリコット）", "Tsiran", ["sweets"], False, False,
         t("あんずの学名プルヌス・アルメニアカは、アルメニアにちなむ。生でも、干しても食べる。", "cuis")),
    dish("tan", "タン（塩味のヨーグルトの飲み物）", "Tan", ["drinks"], False, False,
         t("ヨーグルトを水でのばし、塩を少し入れた飲み物。炭酸入りの瓶もある。", "wv"), ["karas", "ost"]),
    dish("brandy", "アルメニアのブランデー", "Konyak", ["drinks"], True, False,
         t("アルメニアの人はコニャックとも呼ぶ。熟成が長いほど味がまろやかで、値段も上がる。", "wv")),
    dish("areni", "アレニのワイン", "Areni", ["drinks"], True, False,
         t("アルメニアにしかない赤ぶどうの品種。アレニ村の近くの洞窟で、2007年に世界でいちばん古いワインの醸造所の跡が見つかった。", "areni")),
    dish("oghi", "果物のウォッカ（オギ）", "Oghi", ["drinks"], True, False,
         t("果物だけで造る蒸留酒。いちばん人気は桑の実のトゥティ・オギ。セイヨウサンシュユ・梨・あんず・桃のものもある。", "wv")),
]

buy_items = [
    {"key": "brandy", "name": "アルメニアのブランデー（アララト）", "local": loc("ARARAT", "ARARAT", "ybc"),
     "what": t("土産の定番。街なかにアララトの工場のブランデーだけを売る店がいくつもあり、空港の免税店でも買える。熟成が長いほど高い。", "wv"),
     "alcohol": True, "stores": [], "went": False},
    {"key": "wine", "name": "アレニのワイン", "local": loc("Areni", "Areni", "areni"),
     "what": t("アルメニアにしかない赤ぶどうの品種アレニのワイン。ヴァヨツ・ゾルの高い所のぶどう畑で多く育つ。", "areni"),
     "alcohol": True, "stores": [], "went": False},
    {"key": "carpet", "name": "アルメニアのじゅうたん", "local": loc("Հայկական գորգ", "Haykakan gorg", "carpet"),
     "what": t("新しいものも古いものも土産に人気。古いじゅうたんはヴェルニサージュにも並ぶ。古いものを持ち出すには文化省の輸出の証明が要る。", "wv", "wvam"),
     "alcohol": False, "stores": [STORES["vernissage"]], "went": False},
    {"key": "khachkar", "name": "ハチュカル（十字架石）を彫った石の細工", "local": loc("Խաչքար", "Khachkar", "khk"),
     "what": t("十字架を彫った石の碑ハチュカルは、中世のアルメニアの美術。彫る技はユネスコの無形文化遺産。ヴェルニサージュには石の細工の売り場がある。", "khk", "wvam"),
     "alcohol": False, "stores": [STORES["vernissage"]], "went": False},
    {"key": "duduk", "name": "ドゥドゥク（あんずの木の笛）", "local": loc("Դուդուկ", "Duduk", "duduk"),
     "what": t("あんずの木で作る、二枚のリードの笛。ヴェルニサージュには楽器も並ぶ。", "duduk", "wv"),
     "alcohol": False, "stores": [STORES["vernissage"]], "went": False},
    {"key": "driedfruit", "name": "ドライフルーツ", "local": loc("Dried fruits", "Dried fruits", "wvam"),
     "what": t("グム市場の中に、ドライフルーツの売り場が並ぶ。種を抜いた干し桃に、くるみと砂糖を詰めたアラニという菓子もある。", "wvam"),
     "alcohol": False, "stores": [STORES["gum"]], "went": False},
    {"key": "ttulavash", "name": "トゥトゥ・ラヴァシュ（果物の干した板）", "local": loc("Ttu lavash", "Ttu lavash", "wvam"),
     "what": t("すももやあんず、さくらんぼを薄い板に干したもの。", "wvam"),
     "alcohol": False, "stores": [], "went": False},
    {"key": "jam", "name": "くるみやサジーのジャム", "local": loc("Chichkhan", "Chichkhan", "wv"),
     "what": t("アルメニアでは、とれるものはほとんど何でも瓶に詰める。くるみの実のジャムや、サジー（チチハン）のジャムが土産になる。", "wv"),
     "alcohol": False, "stores": [], "went": False},
    {"key": "chocolate", "name": "グランド・キャンディの飴とチョコレート", "local": loc("Grand Candy", "Grand Candy", "wv"),
     "what": t("菓子の会社グランド・キャンディの店は、ポンチクのほかに地元で作った飴とチョコレートを売る。", "wv"),
     "alcohol": False, "stores": [STORES["grandcandy"]], "went": False},
]

# ------------------------------------------------------------------ どんな街・地区
P = {
    "republic": [[40.1815, 44.5040], [40.1815, 44.5175], [40.1785, 44.5215], [40.1705, 44.5205], [40.1690, 44.5130], [40.1745, 44.5035]],
    "cascade": [[40.1975, 44.5120], [40.1975, 44.5265], [40.1915, 44.5260], [40.1845, 44.5205], [40.1818, 44.5175], [40.1818, 44.5110], [40.1880, 44.5100]],
}

areas = [
    {"key": "republic", "name": "共和国広場周辺", "local": loc("Հանրապետության հրապարակ", "Hanrapetutyan hraparak", "rep"),
     "tone": t("ピンクと黄色の石の建物に囲まれた広場のまわりに、歴史博物館、週末の青空市、ブルーモスク、大聖堂が集まる街のまん中。", "rep", "wvam"),
     "center": at("republic"),
     "range": {"polygon": P["republic"], "how": "共和国広場のまわりに、歴史博物館・ヴェルニサージュ・ブルーモスク・聖グレゴリー啓蒙者大聖堂を囲んだおおよその範囲",
               "src": osm("republic") + osm("history") + osm("vernissage") + osm("bluemosque") + osm("gregory")},
     "landmarks": [lm("history", "アルメニア歴史博物館", "History Museum of Armenia"), lm("vernissage", "ヴェルニサージュ", "Vernissage")],
     "went": False,
     "name_src": [{"name": SRC["veltra"][0], "url": SRC["veltra"][1], "seen": SEEN, "words": "ソ連時代の名残を感じさせる共和国広場周辺を中心に"},
                  {"name": SRC["tj"][0], "url": SRC["tj"][1], "seen": SEEN, "words": "定番観光地【6】共和国広場／エレバン"}]},
    {"key": "cascade", "name": "カスケード周辺", "local": loc("Կասկադ", "Kaskad", "casc"),
     "tone": t("オペラ座から北の丘へ、大きな階段のカスケードが上る。丘の上には古文書館と、街を見下ろす母なるアルメニア像。", "casc", "wv"),
     "center": at("cascade"),
     "range": {"polygon": P["cascade"], "how": "カスケードのまわりに、オペラ座・北大通りの北の端・マテナダラン・母なるアルメニア像を囲んだおおよその範囲",
               "src": osm("cascade") + osm("opera") + osm("northern") + osm("matenadaran") + osm("mother")},
     "landmarks": [lm("opera", "オペラ座", "Yerevan Opera Theatre"), lm("matenadaran", "マテナダラン", "Matenadaran")],
     "went": False,
     "name_src": [{"name": SRC["trip"][0], "url": SRC["trip"][1], "seen": SEEN, "words": "カスケード・コンプレックス（目印＋周辺。docs/guide-copy.md 5章の2）"},
                  {"name": SRC["tj"][0], "url": SRC["tj"][1], "seen": SEEN, "words": "穴場観光地【4】カスカード／エレバン"}]},
]

about = {
    "cards": [
        {"key": "history", "title": "世界最古の都市のひとつ", "text": "紀元前782年、ウラルトゥ王国がエレブニの要塞を築いた。エレバンの名前はエレブニから来ている。",
         "src": s("ereb", "wv", "tj")},
        {"key": "ararat", "title": "アララト山", "text": "街の南に見える山。ノアの箱舟がたどり着いたと伝わる。いまはトルコの側にある。",
         "src": s("ararat", "tj")},
        {"key": "pink", "title": "ピンクシティ", "text": "共和国広場の建物は、ピンクや黄色の凝灰岩で建てた。濃さのちがうピンクの凝灰岩から「ピンクシティ」と呼ばれる。",
         "src": s("rep", "veltra")},
    ],
    "why_src": [
        {"name": SRC["tj"][0], "url": SRC["tj"][1], "seen": SEEN, "words": "世界最古の都市の1つである「エレバン」は南にアララト山を望み"},
        {"name": SRC["veltra"][0], "url": SRC["veltra"][1], "seen": SEEN, "words": "「ピンクシティ」と呼ばれるエレバン独特の、濃淡さまざまなピンク色の凝灰岩"},
    ],
    "areas": areas,
}

catch = [
    {"text": "「ピンクシティ」と称えられた街", "type": "型3（「愛称」と称えられた＋呼び名。手本「『東欧のパリ』と称えられた街」ブカレスト・「『ドナウの真珠』と称えられる歴史都市ブダペスト」）",
     "src": s("veltra")},
    {"text": "アララト山に見守られた 石の都", "type": "型2（決まった動詞＋呼び名。手本「アルプスに抱かれた 中世の街 ザルツブルク」）", "src": s("tj", "rep")},
    {"text": "世界最古の都市のひとつ、エレバンへ", "type": "型5（呼びかけ。手本「光の国、スウェーデンへ」）", "src": s("tj")},
]

# ------------------------------------------------------------------ 基本情報
basics = {
    "summary": [
        {"key": "season", "title": "旬の季節", "text": "平年の最高気温は5月24.3℃・9月29.0℃・10月20.7℃。7月は34.0℃、1月は0.6℃。雨は1年を通じて少ない。", "src": s("jawp", "mofa")},
        {"key": "safety", "title": "治安", "text": "治安は比較的安定しているが、スリと置き引きが多い。観光地で一緒に写真を撮ろうと近づく手口がある。", "src": s("mofa")},
        {"key": "budget", "title": "予算", "text": "空港から街のまん中へのバス201番は300ドラム（約130円）で約30分。歴史博物館は2,000ドラム（約880円）。", "src": s("evn", "wv")},
        {"key": "transit", "title": "移動", "text": "地下鉄は1本の路線。QRコードか、NFCのカードで乗る。流しのタクシーより配車アプリ。", "src": s("metro", "mofa")},
    ],
    "guide": [
        {"key": "airport", "title": "空港から市内へ", "points": [
            t("ズヴァルトノツ国際空港（EVN）。街の中心まで車で12km、約20分。", "evn"),
            t("201番のバスが7時〜23時は30分おき、0時〜6時は1時間おきに出る。片道300ドラム（約130円）で約30分。終点はアミリャン通り。", "evn"),
            t("タクシーは配車アプリの gg か Yandex Go を使うと、法外な料金を求められにくい。", "mofa")]},
        {"key": "transit", "title": "市内の乗り物", "points": [
            t("地下鉄は南北に1本の路線。2024年11月からトークンは使えず、QRコード（Telcellのアプリか端末で買う）か、NFCの銀行カードで払う。", "metro"),
            t("紙の切符は2025年8月で終わった。", "metro"),
            t("流しのタクシーは法外な料金を求めることがあるので、gg や Yandex Go の配車アプリを使う。", "mofa")]},
        {"key": "pay", "title": "払いかたとチップ", "points": [
            t("通貨はドラム（AMD）。1ドラムは約0.44円（2026年11月20日のアルメニア中央銀行のレート）。", "cba"),
            t("レストランは10%のサービス料を付けるところが増えた。品書きに書いていないこともあるので、聞いて確かめる。", "wvam"),
            t("チップは端数を切り上げるか、10%を置く人が多い。タクシーではふつう要らない。", "wvam"),
            t("現金は合わせて1万米ドル相当まで、申告なしで持ち込める。", "mofa")]},
        {"key": "sim", "title": "ネットと SIM", "points": [
            t("携帯の会社は Viva・Team・Ucom の3つ。大きな町に店があり、SIM を買える。", "tel"),
            t("旅行者には、料金の組み合わせが多く、いろいろな言葉で助けてもらえる Ucom と Viva がよくすすめられる。", "tel"),
            t("街のカフェは無料の Wi-Fi が多い。", "wvam")]},
        {"key": "safety", "title": "治安のコツ", "points": [
            t("スリと置き引きが多い。貴重品は体に付け、バッグはたすき掛けにして手で押さえる。", "mofa"),
            t("観光地で一緒に写真を撮ろうと声をかけ、肩を組むなどして財布を抜く手口がある。", "mofa"),
            t("運転手は交通の決まりを守らないことが多い。横断歩道でも気をつける。", "mofa"),
            t("知らない人から荷物を預からない。", "mofa")]},
        {"key": "phrases", "title": "アルメニア語のひとこと", "phrases": [
            {"local": "Բարև ձեզ", "roman": "barev dzez", "kana": "バレヴ・ズェズ", "ja": "こんにちは"},
            {"local": "Բարի լույս", "roman": "bari luys", "kana": "バリ・ルイス", "ja": "おはようございます"},
            {"local": "Բարի երեկո", "roman": "bari yereko", "kana": "バリ・イェレコ", "ja": "こんばんは"},
            {"local": "Շնորհակալություն", "roman": "shnorhakalutyun", "kana": "シュノラカルチュン", "ja": "ありがとう"},
            {"local": "Այո", "roman": "ayo", "kana": "アヨ", "ja": "はい"},
            {"local": "Ոչ", "roman": "voch", "kana": "ヴォチ", "ja": "いいえ"},
            {"local": "Կներեք", "roman": "knereq", "kana": "クネレク", "ja": "すみません（呼びかけ）"},
            {"local": "Խնդրեմ", "roman": "khndrem", "kana": "ヘンドレム", "ja": "お願いします"},
            {"local": "Սա ինչ արժե", "roman": "sa inch arzhe", "kana": "サ・インチ・アルジェ？", "ja": "これはいくらですか？"},
            {"local": "Ցտեսություն", "roman": "tstesutyun", "kana": "ツテスチュン", "ja": "さようなら"}],
         "phrases_src": s("wvphr")},
    ],
    "budget": {"days": [], "extras": [
        {"label": "空港バス201番（街のまん中まで）", "local": "300", "yen": "130", "src": s("evn")},
        {"label": "カフェスジアン美術館（カスケード）", "local": "1,000", "yen": "440", "src": s("wv")},
        {"label": "アルメニア歴史博物館", "local": "2,000", "yen": "880", "src": s("wv")},
        {"label": "エレブニ要塞（博物館と遺跡）", "local": "1,000", "yen": "440", "src": s("wv")},
        {"label": "ノラヴァンクの近くのイェゲグナゾルまでマルシュルートカ", "local": "2,000", "yen": "880", "src": s("wvyegh")},
        {"label": "鶏のホロヴァツ（カラス）", "local": "3,730", "yen": "1,640", "src": s("gkaras")},
        {"label": "ラフマジョ（カラス）", "local": "480", "yen": "210", "src": s("gkaras")}]},
    "packing": [
        {"key": "passport", "text": "パスポート。日本の人は、観光などで滞在が180日までなら査証が要らない。", "src": s("mofa")},
        {"key": "bottle", "text": "水のボトル。街の中心の水道の水は歯みがきや料理には使えるが、飲むならミネラルウォーター。", "src": s("mofa")},
        {"key": "insurance", "text": "海外旅行の保険。新しい医療の機械を持つ病院は限られている。", "src": s("mofa")},
        {"key": "coat", "text": "冬は厚いコート。12〜2月は雪が積もり、マイナス10〜20度まで下がる。", "src": s("mofa")},
        {"key": "sun", "text": "夏は日差しの備え。7月の平年の最高気温は34.0℃。", "src": s("jawp")}],
    "climate": {"where": "エレバン（平年値）", "src": s("jawp"), "months": [
        {"month": f"{i + 1}月", "high": h, "low": lo, "rain_mm": mm} for i, (h, lo, mm) in enumerate([
            (0.6, -7.8, 22), (3.7, -5.3, 25), (11.7, 0.3, 30), (19.5, 6.9, 37), (24.3, 10.8, 44), (29.6, 14.7, 21),
            (34.0, 18.8, 9), (33.0, 17.8, 8), (29.0, 13.3, 8), (20.7, 7.0, 27), (12.1, 1.4, 23), (4.5, -3.6, 23)])]},
    "emergency": {
        "numbers": [{"no": "102", "what": "警察", "src": s("mofa")},
                    {"no": "103", "what": "救急車", "src": s("mofa")},
                    {"no": "101", "what": "消防", "src": s("mofa")}],
        "embassy": {"name": "在アルメニア日本国大使館", "exists": True, "address": "Babayan street 23/4, Yerevan 0037",
                    "tel": "+374-11-52-30-10", "url": "https://www.am.emb-japan.go.jp/itprtop_ja/index.html",
                    "text": "エレバンに日本の大使館がある。",
                    "src": s("mofa") + osm("embassy"), **at("embassy"), "maps": maps("Embassy of Japan in Armenia")},
        "water": t("水道の水は歯みがきや料理には使えるが、飲むならミネラルウォーターがすすめられている。", "mofa")},
    "holidays": t("4月24日はアルメニア人虐殺の犠牲者を追悼する日で、国の休み。", "hol"),
    "time": {"text": "アルメニアは UTC+4 で、日本より5時間遅い。", "src": s("tz")},
}

unknown = [
    {"what": "地下鉄と市バスの1回の運賃", "why": "Wikivoyage の地下鉄100ドラムに日付が無い。払いかた（QRコード・NFCのカード）は Wikipedia の2024〜2025年の書き込みで確かめた"},
    {"what": "アララト博物館（エレバン・ブランデー工場）のツアーの値段と時間", "why": "公式の頁（araratbrandy.com）がこの箱から開けなかった（403）。Wikivoyage の3,500／5,000ドラムは、どちらの工場の値段か書きかたから分からない"},
    {"what": "ガルニ・ゲガルドへの266番のマルシュルートカの運賃と、ガイ・バスステーションの場所", "why": "Wikivoyage に日付が無い（500ドラムと書く）"},
    {"what": "ガルニ神殿の入場料と時間", "why": "Wikivoyage の1,500ドラムは2019年の書き込み"},
    {"what": "エチミアジン行きの203番のマルシュルートカの運賃", "why": "Wikivoyage の250〜300ドラムに日付が無い"},
    {"what": "ズヴァルトノツの入場料", "why": "Wikivoyage の1,300ドラムは2018年の書き込みで、OpenStreetMap の切符売り場の点は1,500ドラムと書く"},
    {"what": "ホル・ヴィラップへの467番のマルシュルートカの運賃と、降りる所", "why": "Wikivoyage の350ドラムに日付が無い"},
    {"what": "セヴァン湖（セヴァンの町）へのマルシュルートカの時刻と運賃", "why": "Wikivoyage は「1日に何本か・1時間」とだけ書き、日付が無い"},
    {"what": "ノラヴァンク修道院の、イェゲグナゾルから先の足", "why": "Wikivoyage はイェゲグナゾルまでの行き方（2025年4月）だけを書く"},
    {"what": "マテナダランの入場料と時間", "why": "2024年以降の出どころで値段と時間を書いたものが見つからない（Wikivoyage は案内の別料金があるとだけ書く）"},
    {"what": "店の値段（Glovo の品書き）が店で食べる値段と同じか", "why": "載せた値段は Glovo の配達の品書きの値段"},
    {"what": "カラス・アート・ランチ・マスター・クラスの、地図の点の店で品書きの品を出すか", "why": "どれもチェーンで、Glovo の品書きがどの店のものかは書かれていない。地図の点は OpenStreetMap の1店"},
    {"what": "ジンガロフ・ハツ・ガパマ・スジュフ・マトナカシュ・マツンを出す店", "why": "見た店の品書き（Glovo）と Wikivoyage の店の欄に載っていなかった"},
    {"what": "アルメニアのブランデー・ワイン・トゥトゥ・ラヴァシュ・ジャムを買える店", "why": "店の名前と、いまも置いていることを書いた2024年以降の出どころが見つからない"},
    {"what": "グム市場の場所", "why": "Wikivoyage の「屋根つき市場（G.U.M.）」の点はマシュトツ通りの古い市場の建物を指していて、OpenStreetMap のグム市場と約1.2kmずれる。面は OpenStreetMap の点にした"},
]

# ------------------------------------------------------------------ 行った（配信の facts。行った担当が足す）
# エレバンに居たのは 2026-04-19〜04-28・05-10〜05-23 の27本。facts は `streams/2026/<月>/<stem>.facts.json`（`python/guide_facts.py`）。
# **ガイドの品にだけ肉付けする**（facts から品を作らない）。骨組みの字（出どころつき）には混ぜず、行った箱に入る字だけを持つ。
# 配信で名前を言っていない所・品を、ガイドの品に結んだものは、何で結んだかを書いておく:
#   - マーケット街の串焼き屋の串（04-23）→ キャバブ（ひき肉の串焼き）: その日に「中身はつくね・ネギ・コリアンダー」と言った（ひき肉の串）
#   - エレバンマーケットで買わされた干し柿（05-21）→ ドライフルーツ: 干した果物そのもの（グム市場かどうかは言っていないので、店には結ばない）
# 結ばなかったもの: 緑のハーブのピザ（04-22・04-26。ジンガロフ・ハツらしいが名前を言っていない）・串のバーベキュー（04-26。
# ホロヴァツかキャバブか言っていない）・シャウルマの品書き（04-22 のカード。食べたかを言っていない）・
# 広場の警察（05-19。どの広場かを言っていない）・中心地のカジノ（05-17。うろ覚えと言った）
# 配信の一覧（cityStreams.ts）のエレバンの回は、#1402 で題名だけでなく滞在の回が寄るようになり、5本から28本になった。
# 記事の一言と場面は一覧に在る回からしか引けないので、それまで書けなかったカスケード・記念碑・パン屋・市場を記事にした
# （ラフマジョは配信1本で話が窓に収まるので、窓の肉付けだけ）

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


SUNSET = "5cWmE-KqHLA"  # 04-25 夕日に間に合わせてカスケードを駆け上がった回
LAST = "YFxoJhKOasQ"    # 05-22 最後の日にもう一度カスケードへ行った回
WALK = "2y4IbYu-ZeI"    # 05-17 虐殺記念碑まで歩いた回
GO, BACK = "haHAczqMooM", "JJdPN0ozwZI"  # 05-20 セヴァン湖の行きと、湖から帰るまで
LAKE = "c-ogYrwX8iA"    # 05-16 エレバン湖まで歩いた回

went(see, "cascade", [f"{SUNSET}@19830#move", f"{SUNSET}@19950#quote", f"{SUNSET}@19980#fact", f"{SUNSET}@20010#caution",
                      f"{LAST}@6300#move", f"{LAST}@6360#fact", f"{LAST}@7170#caution"], f"{SUNSET}@19950#quote")
went(see, "genocide", [f"{WALK}@8910#place", f"{WALK}@8960#fact", f"{WALK}@9060#fact", f"{WALK}@9120#quote", f"{WALK}@9360#place",
                       "2u4HfAvQdsI@1290#place"], f"{WALK}@8910#place")
went(see, "opera", ["5cWmE-KqHLA@14310#place", "2u4HfAvQdsI@200#place", "2u4HfAvQdsI@270#caution"], "2u4HfAvQdsI@200#place")
went(see, "bluemosque", ["1KWNenbPR5A@1190#place"], "1KWNenbPR5A@1190#place")
went(see, "yerevanlake", [f"{LAKE}@1170#move", f"{LAKE}@4140#place", f"{LAKE}@4145#quote", f"{LAKE}@4260#caution"], f"{LAKE}@4140#place")
went(see, "sevanavank", [f"{GO}@14070#place", f"{GO}@14880#fact", f"{GO}@15780#place", f"{BACK}@1110#place", f"{BACK}@1230#fact"],
     f"{GO}@15780#place")

went(todos, "cascade", [f"{SUNSET}@19830#move", f"{SUNSET}@19980#fact", f"{LAST}@6420#move", f"{LAST}@7860#caution"], f"{SUNSET}@19830#move")
went(todos, "sevan", [f"{GO}@1800#move", f"{GO}@3540#price", f"{GO}@8880#move", f"{GO}@9870#fact", f"{GO}@9900#quote", f"{BACK}@6480#price"],
     f"{GO}@9900#quote")

went(eat_items, "kebab", ["o7OIStvxT0Q@4440#fact", "o7OIStvxT0Q@4530#food", "o7OIStvxT0Q@4870#quote", "o7OIStvxT0Q@4890#price",
                          "o7OIStvxT0Q@5130#food", "o7OIStvxT0Q@5170#food"], "o7OIStvxT0Q@4870#quote")
went(eat_items, "lavash", ["k-3fN6Ynsok@5200#food", "gHTWAMKCITo@2100#food", f"{LAST}@3300#quote", "1KWNenbPR5A@2820#fact"],
     f"{LAST}@3300#quote")
went(eat_items, "lahmajo", ["j_yInDStbKg@1000#food", "j_yInDStbKg@1020#caution", "j_yInDStbKg@3100#caution", "j_yInDStbKg@3180#place", "j_yInDStbKg@3330#food", "j_yInDStbKg@3450#food",
                            "j_yInDStbKg@6030#caution", "j_yInDStbKg@6090#food"], "j_yInDStbKg@3450#food")
went(eat_items, "khachapuri", ["k-3fN6Ynsok@3365#place", "k-3fN6Ynsok@3695#price"], "k-3fN6Ynsok@3695#price")
went(eat_items, "gata", ["7R7xote6efA@6750#place", "7R7xote6efA@7020#price", "7R7xote6efA@7110#food", "XE0lZY5fzEQ@4380#food",
                         "XE0lZY5fzEQ@4950#food"], "7R7xote6efA@7110#food")
went(eat_items, "apricot", ["74c2AutI7PY@4950#food"], "74c2AutI7PY@4950#food")

went(buy_items, "driedfruit", ["74c2AutI7PY@3960#place", "74c2AutI7PY@4530#caution", "74c2AutI7PY@4650#price", "74c2AutI7PY@4680#food"],
     "74c2AutI7PY@4530#caution")


def own(key: str, text: str, ids: list) -> None:
    """基本情報の札に、行った人の話を1つ足す（出どころの無い、facts だけを持つ字。行った箱に入る）"""
    g = next(g for g in basics["guide"] if g["key"] == key)
    g["points"].append({"text": text, "facts": [fx(i) for i in ids]})


own("transit", "バスでは現金もカードも使えず、乗車券は街なかの券売機テルセルで買いました。待っていた49番はなかなか来ず、"
               "乗れたのは、位置の分かるアプリで見つけてからです。",
    ["ey_pIoeVo_8@690#move", "ey_pIoeVo_8@600#place", "ey_pIoeVo_8@2310#caution", "ey_pIoeVo_8@2460#move"])
own("pay", "ATMで下ろすときに間違えて、1,000円ほどしか下ろせておらず、パン屋で払ったら所持金がちょうど0円になりました。"
           "セヴァン湖の店では、カードは使えないと言われたのに、それなら帰りますと言ったら使えました。",
    ["7R7xote6efA@6900#caution", f"{BACK}@3240#caution"])
own("sim", "SIMは1ヶ月無制限で1,600円ほど。10分以内に使えると言われたのに、開通まで30分ほどかかって使えず、店に戻って直してもらいました。",
    ["jTpvux9mM44@3660#price", "aYXWyg1ANh0@3560#caution"])
own("safety", "差別は受けず、めちゃくちゃ平和だと感じました。ただ、横断歩道は怖くて、信号をつけてほしいと思いました。"
              "夜中の1時ごろには、道路で車が衝突する事故を見ました。",
    ["jTpvux9mM44@5530#quote", "gHTWAMKCITo@3480#caution", "2u4HfAvQdsI@1350#caution"])
basics["holidays"]["went"] = {"text": "4月24日の前の晩、帰り道で、ろうそくのようなものを持って音楽を流す大行列に出会いました。"
                                      "昔の大量虐殺を忘れないための行列らしく、道は警察に封鎖されていました。",
                              "facts": [fx("7R7xote6efA@5700#fact")]}

book = {
    "_meta": {
        "何か": "エレバンを「ガイドブック型の街の面」（/travel/armenia/yerevan）にするための材料。行った街（2026-04-19〜04-28・05-10〜05-23）。焼くのは python/guidebook_bake.py",
        "見張り": "python3 python/guide_book_check.py armenia/yerevan（出どころの無い事実・座標の無い店・枠の外の座標）。マイマップの CSV も同じ道具が書く（--mymaps）",
        "出どころ": "事実を持つ欄には src（https と見た日）。座標は OpenStreetMap（Nominatim）。値段と「いまも」は2024年以降の出どころ（Wikivoyage の店と名所の欄は 2024-09 以降の書き込み）。確かめきれないものは unknown へ",
        "行った": "行った街（2026-04-19〜04-28・05-10〜05-23）。went は配信の facts の行だけを持つ（台本の「行った」の段。名前を言っていない所を品に結んだ理由もそこ）。骨組みの字には混ぜない",
        "店": "店に結ぶ品は、その店のいまの品書き（Glovo の配達の品書き。2026-11-23 に見た）か、2024年以降の Wikivoyage の店の欄に載っている品だけ。値段は配達の値段",
        "円": "円は 1ユーロ＝395.18ドラム・10円＝22.695ドラム（2026年11月20日のアルメニア中央銀行のレート。1ドラム＝約0.4406円）で直し、10円で丸めた",
        "地図": "多角形（range.polygon）は、その地区に入っている目印の座標を囲んで外へ広げた、おおよその範囲。区の境ではない。虐殺記念館・エレブニ・エレバン湖・グム市場・ブランデー工場・日帰りの5つの町は見どころマップの外（矢印）",
        "rank": "見たいものの rank は、初めての人に向けた見どころの大きさ（1 が定番）",
        "選んだ問い": "どんな街の問いは、日本語の頁がエレバンを語る3つ。トラベルjp の「世界最古の都市の1つ」「南にアララト山を望み」と、VELTRA の「『ピンクシティ』と呼ばれるエレバン」（about.why_src）。前の街の問いは写していない",
        "キャッチの手本": "型3の手本は「『東欧のパリ』と称えられた街」（ブカレスト）と「『ドナウの真珠』と称えられる歴史都市ブダペスト」（docs/guide-copy.md 8章）。愛称は VELTRA の「ピンクシティ」の字のまま",
    },
    "city": {"key": "armenia/yerevan", "name": "エレバン", "town": "yerevan",
             "local": {"text": "Երևան", "lang": "hy", "roman": "Yerevan", "src": s("jawp")}},
    "rate": {"text": "1ドラムは約0.44円。アルメニアのドラム（AMD）は変動相場で、円は1ユーロ＝395.18ドラム・10円＝22.695ドラム（2026年11月20日のアルメニア中央銀行のレート）で直した。",
             "src": s("cba"), "unit": "ドラム", "eur_local": 395.18, "eur_jpy": 174.13, "date": "2026-11-20"},
    "cover": {"catch": catch, "photo": photo("republic", "共和国広場。ピンクの石の建物が広場を囲む")},
    "about": about,
    "todo": todos,
    "see": see,
    "eat": {"kinds": [{"key": "local", "name": "アルメニアの料理"}, {"key": "quick", "name": "安く手早く"},
                      {"key": "sweets", "name": "甘いもの"}, {"key": "drinks", "name": "飲み物"}], "items": eat_items},
    "buy": {"items": buy_items},
    "basics": basics,
    "unknown": unknown,
    "shorts": {"src": [{"name": "site/content/shorts.ts の章（チャンネルのショートのタブから焼いたもの）",
                        "url": "https://www.youtube.com/channel/UCCwutAH6ieHNvdyJAfSld7w/shorts", "seen": SEEN}], "items": []},
}

compose = {
    "_meta": {
        "何か": "エレバンのガイドブックの面（/travel/armenia/yerevan）の組み立て。材料（guidebook.json）にあるのは事実で、ここにあるのは選びかたと並べかただけ。焼くのは python/guidebook_bake.py",
        "行った": "行った街。カードはその日のあやと島カード（札の絵には使わず、窓の中の行った箱に）。話（story）は facts の行をつないだあやとの一人称（docs/guide-blog.md）で、記事のある品は要約だけ（article）。一言は節に1つ",
        "どんな街": "問いは日本語の頁がエレバンを語る3つ（材料の about.why_src）。前の街の問いを写していない",
        "題": "「エレバン観光ガイド」が頭（docs/island-misses.md #332・#333）",
    },
    "title": "エレバン観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜アルメニア",
    "description": {"text": "アルメニアの首都エレバンの観光ガイド。見どころマップと、やりたいこと{todo}つ（大階段カスケード、アララトのブランデー工場、ガルニ神殿とゲガルド修道院への日帰り）、ホロヴァツとラヴァシュ。",
                    "facts": []},
    "persona": [
        "コーカサスを周る20〜30代の個人旅行者。ジョージアから陸路で入り、エレバンに何日いて何をするか決めかねている（いちばん大事な読み手）",
        "ガルニ・ゲガルド・エチミアジン・ホル・ヴィラップ・セヴァン湖への日帰りの拠点を探している人",
        "世界で最初にキリスト教を国の宗教にした国の、教会と修道院を見たい人",
    ],
    "terms": ["エレバン 観光", "エレバン 見どころ", "エレバン 地図", "アルメニア エレバン 観光", "エレバン 日帰り"],
    "published": "2026-11-23",
    "cover": {"catch": 0},
    "cards": {
        "lake": {"id": "VuLK3vxONnoR2nLdQDlq", "day": "2026-05-16", "alt": "エレバン湖。曇り空の下の湖と、対岸の建物（2026年5月16日）"},
        "hill": {"id": "p2u29ckWY2SqmpvnFSoL", "day": "2026-05-17", "alt": "丘の上から見た街。雲のすきまから光が差す（2026年5月17日）"},
    },
    "say": {"see": "cascade", "todo": "sevan", "eat": "kebab"},
    "items": {
        "see/cascade": {"story": {"text": "夕日まで20分しかなく、大階段を爆速で登りました。階段に座る人たちが見ていたのは、夕日の沈む方向ではありませんでした。"
                                          "最後にもう一度行った日は、エスカレーターで上へ。",
                                  "facts": ["5cWmE-KqHLA@19830#move", "5cWmE-KqHLA@20010#caution", "YFxoJhKOasQ@5220#move",
                                            "YFxoJhKOasQ@6420#move"]},
                        "article": "cascade"},
        "see/genocide": {"card": "hill",
                         "story": {"text": "街から坂道や階段を登って歩きました。記念碑の44mの塔は民族の復活、12の石板は失われた土地を表すそうです。"
                                           "犠牲者は100万〜150万人とされると聞いて、えげつないと感じました。",
                                   "facts": ["2y4IbYu-ZeI@2160#move", "2y4IbYu-ZeI@8960#fact", "2y4IbYu-ZeI@9060#fact", "2y4IbYu-ZeI@9120#quote"]},
                         "article": "memorial"},
        "see/opera": {"story": {"text": "オペラ座の前の広場では、スティッチのダーツに当てると景品がもらえる遊びをやっていました。"
                                        "遠くから投げたダーツが外れて飛んでくるのが怖くて、ベンチの端でサングラスをして備えていました。",
                                "facts": ["2u4HfAvQdsI@200#place", "2u4HfAvQdsI@270#caution"]}},
        "see/bluemosque": {"story": {"text": "ブルーモスクの前を通りました。アルメニアにも、ブルーモスクがあるんです。",
                                     "facts": ["1KWNenbPR5A@1190#place"]}},
        "see/yerevanlake": {"card": "lake",
                            "story": {"text": "街から歩いて1時間ほど。大きくて、晴れていればアララト山も見える眺めでしたが、近くで見ると汚くてびっくりしました。",
                                      "facts": ["c-ogYrwX8iA@1170#move", "c-ogYrwX8iA@4140#place", "c-ogYrwX8iA@4260#caution"]},
                            "article": "lake"},
        "see/sevanavank": {"story": {"text": "丘の上に教会が2つあって、片方は中に入れました。中は石でできていて、カトリックの大聖堂とは雰囲気が全然違います。"
                                             "ふもとは、お祭りみたいなにぎわいでした。",
                                     "facts": ["haHAczqMooM@15780#place", "JJdPN0ozwZI@1110#place", "JJdPN0ozwZI@1230#fact", "haHAczqMooM@14880#fact"]},
                           "article": "sevan"},
        "todo/cascade": {"story": {"text": "上の段からは、富士山のような山が見えました。もう一度行った日は、次の日の大事な移動に備えて、エスカレーターで上へ。"
                                           "エスカレーターでも、上まで結構長かったです。",
                                   "facts": ["5cWmE-KqHLA@19980#fact", "YFxoJhKOasQ@6420#move", "YFxoJhKOasQ@7860#caution"]},
                         "article": "cascade"},
        "todo/sevan": {"story": {"text": "市バスとミニバスを乗り継ぎ、最後はヒッチハイクで湖へ。対岸が見えないほど大きな湖で、ほとりの店で1,200円の魚料理を食べました。",
                                 "facts": ["haHAczqMooM@1800#move", "haHAczqMooM@3540#price", "haHAczqMooM@8880#move", "haHAczqMooM@9870#fact",
                                           "JJdPN0ozwZI@6480#price"]},
                       "article": "sevan"},
        "eat/kebab": {"story": {"text": "マーケット街の串焼き屋で、チキンの串を温めてもらいました。中身はつくね・ネギ・コリアンダーで、"
                                        "トルティーヤの上につくね串を敷いたような味。串焼きとトルティーヤで200円ぐらいでした。",
                                "facts": ["o7OIStvxT0Q@4530#food", "o7OIStvxT0Q@5130#food", "o7OIStvxT0Q@5170#food", "o7OIStvxT0Q@4890#price"]},
                      "article": "market"},
        "eat/lavash": {"story": {"text": "スーパーでは、ラヴァシュを1枚ずつ量り売りで買えます。パンがおいしくて、毎日のようにスーパーで買って食べていました。"
                                         "街のパン屋では、ラヴァシュを機械を使って伸ばして焼いていました。",
                                 "facts": ["k-3fN6Ynsok@5200#food", "YFxoJhKOasQ@3300#quote", "gHTWAMKCITo@2100#food"]},
                       "article": "bakery"},
        "eat/lahmajo": {"story": {"text": "ラフマジュンは、アルメニアのソウルフード。前に食べようとしたときは、売り切れでした。"
                                          "裏路地の奥の専門店は、探すのに迷いましたが、まずザクロのソースを使ったアラビックを頼みました。"
                                          "2枚でお腹いっぱいになり、閉店時間を過ぎて店から追い出されました。",
                                  "facts": ["j_yInDStbKg@1000#food", "j_yInDStbKg@1020#caution", "j_yInDStbKg@3100#caution", "j_yInDStbKg@3180#place",
                                            "j_yInDStbKg@3330#food", "j_yInDStbKg@3450#food", "j_yInDStbKg@6090#food", "j_yInDStbKg@6030#caution"]}},
        "eat/khachapuri": {"story": {"text": "中東寄りの店ザ・ピザでは、品書きのアジャリ・ハチャプリが480円。ジョージアより安かったです。",
                                     "facts": ["k-3fN6Ynsok@3365#place", "k-3fN6Ynsok@3695#price"]}},
        "eat/gata": {"story": {"text": "フードマーケットのパン屋で買ったガタは100円。パイ生地に、カスタードのような中身が入っていました。"
                                       "お気に入りのパン屋のガタは、固くてずっしり重く、中に砂糖菓子のようなものが入っていて、おいしかったです。",
                               "facts": ["7R7xote6efA@6750#place", "7R7xote6efA@7020#price", "7R7xote6efA@7110#food", "XE0lZY5fzEQ@4950#food"]},
                     "article": "bakery"},
        "eat/apricot": {"story": {"text": "あんずを初めて食べました。うまかったです。", "facts": ["74c2AutI7PY@4950#food"]}},
        "buy/driedfruit": {"story": {"text": "エレバンマーケットで干し柿を買おうとしたら、果物をどんどん詰められて、所持金を全部持っていかれました。"
                                             "干し柿は3つで200円。硬めで、思ったより悪くなかったです。",
                                     "facts": ["74c2AutI7PY@3960#place", "74c2AutI7PY@4530#caution", "74c2AutI7PY@4650#price", "74c2AutI7PY@4680#food"]},
                           "article": "market"},
        "guide/transit": {"story": {"text": "切符は券売機テルセルで買う形で、バスでは現金もカードも使えませんでした。待っていた49番はなかなか来ず、降りる場所にも迷いました。",
                                    "facts": ["ey_pIoeVo_8@600#place", "ey_pIoeVo_8@690#move", "ey_pIoeVo_8@2310#caution", "ey_pIoeVo_8@4050#caution"]},
                          "article": "bus"},
    },
    "about": {"history": {"q": "歴史は？", "icon": "ruins"}, "ararat": {"q": "アララト山は？", "icon": "mountain"},
              "pink": {"q": "なぜピンクシティ？", "icon": "plaza"}},
    "areas": {"republic": {"color": "#ffc4d2", "plan": [2, 1, 2]}, "cascade": {"color": "#d9ccf5", "plan": [1, 2, 2]}},
    "summary": {
        "season": {"icon": "sun", "value": "5月・9〜10月", "lead": "平年の最高気温が20.7〜29.0℃", "to": "#guide-season"},
        "safety": {"icon": "key", "value": "スリと置き引きに注意", "lead": "写真を口実に近づく手口がある", "to": "#guide-safety"},
        "budget": {"icon": "wallet", "label": "乗り物の目安", "value": "空港バス201番", "lead": "街のまん中まで約30分", "to": "#budget"},
        "transit": {"icon": "bus", "value": "地下鉄は1路線", "lead": "QRコードかカードで乗る", "to": "#guide-transit"},
    },
    "guides": {
        "airport": {"icon": "plane", "lead": "201番のバスで街のまん中へ"},
        "transit": {"icon": "bus", "lead": "地下鉄はQRコードかカード。タクシーはアプリで"},
        "pay": {"icon": "currency", "lead": "通貨はドラム。サービス料に気をつける"},
        "sim": {"icon": "sim", "lead": "旅行者には Ucom か Viva"},
        "safety": {"icon": "key", "lead": "スリと、荒い車に気をつける"},
        "phrases": {"icon": "phrase"},
    },
    "season": {"lead": "歩きやすいのは5月と9〜10月"},
    "pack": {"passport": "passport", "bottle": "bottle", "insurance": "firstaid", "coat": "jacket", "sun": "sunglasses"},
}
