export const settings = {
  "alertDelay": 5,
  "alertOrder": [
    "donation",
    "superchat",
    "youtubeSubscriber",
    "membership",
    "raid",
    "twitchSubscriber",
    "bit",
    "follower",
    "trialDonation",
    "support"
  ],
  "backgroundColor": "#ffffff",
  "customCss": "h1[data-v-0eb18151], h2[data-v-0eb18151] {\n    display: block;\n    margin: 0;\n    padding: 0;\n    line-height: 1.5;\n    text-align: center;\n    text-shadow: 0 0 1px blue;\n    word-wrap: break-word;\n}",
  "piggyGauge": {
    "targetAmount": 100000,
    "currentAmount": 65000,
    "label": "なに食べよの広告費"
  },
  "donation": {
    "enable": 1,
    "layout": 2,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 0,
    "textAnimation": "headShake",
    "font": "Kosugi Maru",
    "fontSize": 26,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#37a9fd",
    "messageTemplate": "{名前} 様 {金額} 円ドネ ありやとう！！",
    "imageSource": {
      "hash": "2b8554b15282b1xnx11m5ikor9y.png",
      "name": "1tkeBy9mMwKZPYn1736018521_1736018626.png"
    },
    "soundSource": {
      "name": "Coins.mp3",
      "hash": "Coins.mp3"
    },
    "soundVolume": 80,
    "alertDuration": 30,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 20,
      "fontWeight": 800,
      "fontColor": "#ffffff",
      "emote": 1
    },
    "tts": {
      "enable": 0,
      "minAmount": 0,
      "volume": 80,
      "speed": 100,
      "spamProtectedLevel": 0
    },
    "customAlert": []
  },
  "bit": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 100,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "messageTemplate": "{名前}さんが{ビッツ}ビッツで応援しました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "1000.gif",
      "hash": "1000.gif"
    },
    "soundSource": {
      "name": "bit.ogg",
      "hash": "bit.ogg"
    },
    "soundVolume": 80,
    "alertDuration": 10,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 400,
      "fontColor": "#ffffff"
    },
    "tts": {
      "enable": 0,
      "minAmount": 0,
      "volume": 80
    },
    "customAlert": []
  },
  "follower": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "messageTemplate": "{名前}さんがフォローしました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6"
  },
  "raid": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 10,
    "messageTemplate": "{名前}さんが{人数}人をraidしました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "customAlert": []
  },
  "loadOnReload": 0,
  "membership": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "messageTemplate": "{名前}さんが{レベル}のメンバーになりました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "customAlert": []
  },
  "superchat": {
    "enable": 0,
    "layout": 2,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 100,
    "font": "Kosugi Maru",
    "fontSize": 32,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#37a9fd",
    "messageTemplate": "{名前} 様、{単位}{金額}の投げ銭ありがとうございます！",
    "textAnimation": "headShake",
    "imageSource": {
      "hash": "2b8554b15282b1xnx11m5ikor9y.png",
      "name": "1tkeBy9mMwKZPYn1736018521_1736018626.png"
    },
    "soundSource": {
      "name": "Coins.mp3",
      "hash": "Coins.mp3"
    },
    "soundVolume": 80,
    "alertDuration": 10,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 400,
      "fontColor": "#ffffff"
    },
    "tts": {
      "enable": 0,
      "minAmount": 0,
      "volume": 80
    },
    "customAlert": []
  },
  "support": {
    "enable": 1,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 0,
    "textAnimation": "headShake",
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "messageTemplate": "{名前}さんが{月数}ヶ月目{金額}どねをサポートしました！",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Coins.mp3",
      "hash": "Coins.mp3"
    },
    "soundVolume": 80,
    "alertDuration": 10,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 800,
      "fontColor": "#ffffff",
      "emote": 1
    },
    "tts": {
      "enable": 0,
      "minAmount": 0,
      "volume": 80,
      "speed": 100,
      "spamProtectedLevel": 0
    },
    "customAlert": []
  },
  "twitchSubscriber": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "messageTemplate": "{名前}さんが{ティア}をサブスクしました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "message": {
      "enable": 1,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 400,
      "fontColor": "#ffffff"
    },
    "tts": {
      "enable": 0,
      "volume": 80,
      "spamProtectedLevel": 0
    },
    "customAlert": []
  },
  "youtubeSubscriber": {
    "enable": 1,
    "layout": 3,
    "startAnimation": "slideInLeft",
    "endAnimation": "slideOutRight",
    "messageTemplate": "{名前}様、チャンネル登録いただき感謝いたします。\nお茶とお菓子をお供に、ゆっくりとお楽しみくださいませ。",
    "textAnimation": "headShake",
    "imageSource": {
      "hash": "bda4b50da7d5b1xnx11m6as6l5o.png",
      "name": "YoP5WY4mGKBaRK01737724157_1737724259.png"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 17,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#37a9fd"
  }
}
