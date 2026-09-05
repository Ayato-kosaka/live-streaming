/**
 * 配信のうち、コメントがいちばん重なったところ。
 * python/build_stream_peaks.py が BigQuery から作る。**手で編集しない。**
 *
 * 3時間のアーカイブは、入口が無いと誰も再生しない。
 * ここが「そこだけ見にいく」ための入口になる。
 *
 * **出せる配信のほうが少ない。** 山が雑音と区別できるものだけ焼いてあるので、
 * 引けなかったら黙る。無い配信に何か出すために基準を下げると、
 * 出ているものまで信用されなくなる（基準は焼くスクリプトに書いてある）。
 *
 * **サーバー側でだけ使う。** ここをブラウザに配ると、
 * 使わない212本ぶんまで一緒に落ちていく。
 * 「1年前の今日」のぶんは `content/onThisDay.ts` に焼き込んである。
 */

export type Peak = {
  /** 配信のはじめから何秒のところか。ここから YouTube を開く */
  k: number;
  /** その3分に付いたコメントの数 */
  n: number;
};

const PEAKS: Record<string, Peak> = {"-5Ihju_Nzgc":{"k":14760,"n":24},"-o85VHYmVII":{"k":3480,"n":26},"0yjsa9Rd7sY":{"k":1500,"n":29},"1QyrfgL0Tek":{"k":2700,"n":21},"1S4oRJ7we5Q":{"k":5160,"n":26},"1qGn9cUznOM":{"k":3960,"n":17},"29oBRzeiYek":{"k":5100,"n":15},"2ekSjK7YSew":{"k":3600,"n":16},"2fdbFpZgWVs":{"k":5040,"n":15},"2ia-7g3Nt4g":{"k":2400,"n":23},"2lSA1CP1NK8":{"k":6840,"n":26},"2zzbFQe52cc":{"k":20160,"n":19},"4L89TGy7_SU":{"k":2400,"n":27},"4cwHL30x2-0":{"k":3000,"n":27},"4uICARYwXbY":{"k":5040,"n":18},"5-1bHix5X1s":{"k":1440,"n":20},"5D_7RU9cX8A":{"k":4680,"n":19},"5NocPi8ceUE":{"k":4440,"n":16},"5RdUgq87ROI":{"k":4380,"n":19},"6_2Pw1uIDqI":{"k":6960,"n":24},"6xJcC1XELZo":{"k":1920,"n":15},"74c2AutI7PY":{"k":840,"n":20},"7R7xote6efA":{"k":2820,"n":18},"7msFTwtmLrE":{"k":600,"n":16},"7oWA7JEZC6k":{"k":3660,"n":21},"80yNqqNdYD4":{"k":5340,"n":27},"8FwBXXD97Ik":{"k":18060,"n":27},"8Hhmi6vk0QY":{"k":4740,"n":24},"8I2AUKaWgH4":{"k":2760,"n":34},"8SyKyMPpWNE":{"k":3840,"n":15},"8aRncmOfBL8":{"k":13320,"n":29},"8t2avE85sAw":{"k":4020,"n":15},"9WpNkeeUWs0":{"k":3660,"n":29},"A-gx1RqF0Cg":{"k":8580,"n":29},"At9H2OwVyAc":{"k":4380,"n":25},"B-q2T09qPig":{"k":4560,"n":23},"C1OZn_OPv6M":{"k":2220,"n":20},"CWUem6wsuq0":{"k":4320,"n":25},"Cn24SbkDqG0":{"k":1740,"n":23},"DOVZ-SqlER0":{"k":2460,"n":20},"DRw8ZsNHvms":{"k":4200,"n":20},"DVCbM_kZpaA":{"k":1320,"n":22},"EjRXQuzubLo":{"k":5040,"n":17},"EulWB4cVngk":{"k":3960,"n":20},"F7iiCj2EXXg":{"k":11340,"n":28},"G0v78SOLkJM":{"k":2820,"n":31},"G6MZgV1kYeE":{"k":3120,"n":22},"G9xQx9sDi8Q":{"k":3000,"n":25},"GEthwfE5_vU":{"k":7680,"n":19},"GKLTbjA32MI":{"k":3180,"n":23},"GU_Yuc2Vn5s":{"k":11580,"n":27},"Gc2if__b96w":{"k":2460,"n":29},"Gjv9LCg5f9A":{"k":960,"n":20},"Gr4RW4u9IFs":{"k":1020,"n":19},"HfH1RooVuEQ":{"k":360,"n":20},"I-9ORIGJG-w":{"k":4080,"n":16},"I5O7KhOAuV0":{"k":3120,"n":21},"IGZMcJAIkyE":{"k":2520,"n":26},"IWposViqyKw":{"k":3300,"n":25},"IjcyQPvmdeI":{"k":5100,"n":20},"J3n_LknJ1Bs":{"k":3480,"n":27},"JJ3Wooni8iQ":{"k":1680,"n":15},"JJdPN0ozwZI":{"k":4200,"n":23},"JQSbj449rjU":{"k":120,"n":36},"JU6DK-n5ezw":{"k":1080,"n":15},"J_l0cVwfMPo":{"k":4260,"n":24},"Jk8jWqh1iQU":{"k":13140,"n":23},"JpChMMLo8aQ":{"k":5160,"n":19},"JsGBdZGn9PE":{"k":1560,"n":18},"KAgYIsACo50":{"k":3060,"n":21},"KEW0_QbKEZc":{"k":3180,"n":25},"L1YzClufXdY":{"k":4380,"n":15},"LQ-SN_IPcNY":{"k":5280,"n":16},"L_NXNNvLvqM":{"k":360,"n":30},"LjE5Zen0f7g":{"k":3120,"n":20},"M8uZJ2SuSX8":{"k":3840,"n":22},"MGQ2P2t39K0":{"k":660,"n":33},"NZrmlN6SsL0":{"k":1740,"n":16},"NgRP5qSJry0":{"k":2700,"n":19},"OwYrjuMWJ5s":{"k":1620,"n":16},"Q3f5230slnk":{"k":3420,"n":22},"Q7It0Xsv0so":{"k":2640,"n":20},"QO-Bu5vERZQ":{"k":6000,"n":17},"QPTKsGZ1oCM":{"k":2580,"n":27},"QeD5XWpAzRc":{"k":3000,"n":20},"QieWHVc69q8":{"k":2400,"n":19},"QmUl3HrOOC4":{"k":1380,"n":19},"QrgoRk4F-D4":{"k":3600,"n":22},"RFpKH_hIKcw":{"k":4560,"n":22},"RfOyZTBI5zw":{"k":780,"n":24},"RmJDoe6U5Yw":{"k":1140,"n":21},"RrvA0YA7SdQ":{"k":2040,"n":23},"SQXQOF1_Qhg":{"k":5700,"n":23},"SbeFAEeSyM0":{"k":1680,"n":23},"SkT5fy70EcM":{"k":4860,"n":31},"Sw9gFWCvsfk":{"k":1080,"n":20},"SwiwzGx_y-0":{"k":3600,"n":24},"TGO_a-3ZwHM":{"k":5160,"n":15},"TLBRBVpJb-0":{"k":3180,"n":16},"Td0AVFbSLk8":{"k":2280,"n":20},"To47u31DKmI":{"k":3360,"n":20},"UULcHjBHSJM":{"k":17520,"n":28},"UbbfjRJ6KTM":{"k":4260,"n":22},"UvJzCI27X4Q":{"k":5640,"n":20},"V6lxgRozDJk":{"k":300,"n":19},"VB1x0w4ejdo":{"k":15840,"n":20},"W5Q-wKTzflY":{"k":10800,"n":18},"WQbsQTaaoq8":{"k":7980,"n":19},"X9_x5stfZ7s":{"k":5400,"n":26},"XjZU6PKL_Zs":{"k":3000,"n":20},"YjiWI5reVCo":{"k":5880,"n":16},"YybNMUq8mpY":{"k":1260,"n":15},"Z0AI9LY0Z2U":{"k":7020,"n":20},"Z1kBaSiCJnk":{"k":1680,"n":25},"ZBWzE7WKIsk":{"k":8820,"n":15},"ZcchwhRE_Ks":{"k":6180,"n":25},"ZcnUMu_O5Hw":{"k":3240,"n":23},"_Crl6Z-HlBA":{"k":20220,"n":18},"_kEWvunKOfo":{"k":1620,"n":17},"_vsZP29JsNo":{"k":180,"n":17},"aL_ApWXgWoM":{"k":3180,"n":20},"aS5lLR8iCMs":{"k":1980,"n":20},"aUpMiuFhaMk":{"k":2700,"n":22},"anL82TSPG4c":{"k":11880,"n":15},"av9Aqdi0l7A":{"k":480,"n":22},"aymUG1Q0Kec":{"k":3660,"n":16},"bL9GKNX0J8M":{"k":240,"n":16},"bTIkiuHw4LQ":{"k":2880,"n":16},"bW2PJln-5mA":{"k":480,"n":16},"baIpMjZRFpE":{"k":5280,"n":18},"c-ogYrwX8iA":{"k":4260,"n":15},"c47TW6GtOCA":{"k":1320,"n":17},"cH-oHRqut_k":{"k":3240,"n":17},"cK0tttTZ3as":{"k":18060,"n":28},"dRXae0mJw8M":{"k":1020,"n":25},"e-UXOUdzTLU":{"k":7260,"n":36},"ed8voejW_3M":{"k":2460,"n":22},"esevUsePhMQ":{"k":3360,"n":22},"f0D0YNq41lI":{"k":19860,"n":21},"fH13PheJneU":{"k":14220,"n":15},"gHTWAMKCITo":{"k":3660,"n":24},"hJW3dD7yOT0":{"k":120,"n":17},"hhW0LTh3xIw":{"k":19800,"n":24},"hwJOAa5Kt8U":{"k":7920,"n":23},"iI35QPmp8x8":{"k":8100,"n":33},"iLNWFjrdVFw":{"k":6060,"n":27},"i_P1pRTEps8":{"k":2820,"n":15},"iaz-gO_NK8M":{"k":4560,"n":23},"j9I6IVo86w8":{"k":2580,"n":16},"j9le-e_raKA":{"k":4200,"n":18},"jWHxbg9IUOE":{"k":11820,"n":16},"jX6NIopOoLY":{"k":2460,"n":17},"j_yInDStbKg":{"k":4260,"n":22},"jwh1FeaQwzE":{"k":1980,"n":18},"k-3fN6Ynsok":{"k":4320,"n":17},"lAzVgZ_DdTw":{"k":1260,"n":16},"lPCx2VMe4pc":{"k":6960,"n":15},"lbK3rhH7ksw":{"k":840,"n":21},"lm4dJAF5Szs":{"k":2880,"n":20},"mXs3RCOS1JQ":{"k":3360,"n":22},"mdua-Zf4tGU":{"k":8940,"n":28},"mnI9zAyPBTU":{"k":3540,"n":17},"n-BJIqSuH9M":{"k":5520,"n":20},"n2cVA2HMm8g":{"k":540,"n":23},"n9FK4SYbcpA":{"k":6960,"n":22},"nJzo0OMugaM":{"k":1260,"n":26},"nKTakrtzWM8":{"k":17880,"n":24},"nvm2i_dWnN8":{"k":840,"n":20},"nwhLr4AuS1M":{"k":7380,"n":17},"o3QVUx15mg4":{"k":1140,"n":16},"oQaJUJLzRf8":{"k":3960,"n":27},"otPMZDtsjTI":{"k":4620,"n":26},"otmpvC--TvQ":{"k":1080,"n":20},"ouCH9DYvTAA":{"k":4440,"n":20},"p6dOZMX2lAE":{"k":1680,"n":22},"pXWS_86re8c":{"k":2880,"n":22},"pcATx8Qq4s8":{"k":6600,"n":20},"q9spJNn9Glk":{"k":900,"n":15},"qMmJYgQww8Y":{"k":600,"n":18},"qnOk5802V0o":{"k":1620,"n":18},"qxanAsHsufU":{"k":14280,"n":15},"r72uWC2eMz0":{"k":9480,"n":27},"rHUoWeMPa1o":{"k":4920,"n":36},"ri120z7_4Ic":{"k":1920,"n":23},"ri3_F6zhtDA":{"k":3060,"n":16},"s1qwqPP7Gak":{"k":2880,"n":27},"tIe-g2p6FGA":{"k":4800,"n":20},"tKLZa989tCs":{"k":1560,"n":17},"tQvjhxMivZQ":{"k":2340,"n":22},"u2bIxRNKa6g":{"k":180,"n":15},"u9jY4KyIHKQ":{"k":2820,"n":21},"uTgvBEi0FsM":{"k":240,"n":23},"uo_bFhXjla8":{"k":7800,"n":17},"v3L539GafQo":{"k":9720,"n":16},"v9geddQY-24":{"k":8940,"n":19},"vPgcesGxtvY":{"k":4200,"n":16},"vwJNPrluyUE":{"k":2760,"n":27},"w5cSdSGRJ2E":{"k":3840,"n":19},"w_kql8jnB30":{"k":1800,"n":25},"x6s9FF_lNlI":{"k":5820,"n":17},"x8Kbm9dDpYg":{"k":5040,"n":23},"xkyo4nbwGYE":{"k":180,"n":15},"xo1eYfB4RyU":{"k":9540,"n":15},"xuC2Qbr3wpE":{"k":60,"n":25},"xud2lfBsF48":{"k":600,"n":21},"yftA1HCSLiQ":{"k":6180,"n":29},"yj1lPCg5e20":{"k":2460,"n":25},"zB7LHQkGmXM":{"k":1680,"n":21},"zDQm0D-YmGA":{"k":17940,"n":28},"zQJSiKL0D3U":{"k":8820,"n":28},"zhpKovQTr24":{"k":3180,"n":19},"zlgM1S0yl2Q":{"k":15000,"n":27}};

/** その配信の山。無ければ null。 */
export const peakOf = (videoId: string): Peak | null => PEAKS[videoId] ?? null;

/**
 * 「1時間12分」。1時間に満たなければ分だけ。
 * 秒は出さない。3分の窓で数えているので、秒まで言うと精度を偽ることになる。
 */
export function atText(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}時間${m % 60}分` : `${m}分`;
}

/** その時刻から開く YouTube の URL。 */
export const watchAt = (videoId: string, sec: number) =>
  `https://www.youtube.com/watch?v=${videoId}&t=${sec}s`;
