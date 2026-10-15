// render.py が書いた plan.json（時間割）と style.json を受け取り、同じ見た目を React で描く。
// 書き出し（remotion render）と、人が直す画面の下見（@remotion/player）が同じこの部品を使う。
import React, {useEffect, useState} from 'react';
import {
	AbsoluteFill,
	Audio,
	OffthreadVideo,
	Sequence,
	continueRender,
	delayRender,
	staticFile,
} from 'remotion';

export type Cut = {src: string; file: string; in: number; out: number; at: number; frames: number; w: number; h: number; fit: string; focus_x?: number; focus_y?: number};
export type Card = {from: number; to: number; lines: string[]; x?: number; y?: number; w?: number; h?: number; line?: number};
export type Line = {at: number; frames: number; text: string; norm: string};
export type Plan = {
	fps: number;
	size: [number, number];
	frames: number;
	cuts: Cut[];
	captions: Card[];
	titles: Card[];
	narration: Line[];
	bgm?: {norm: string; duck_db: number; attack_s: number; release_s: number; fade_out_s: number} | null;
};
export type Props = {plan: Plan; style: any; fontBase?: string; mediaBase?: string; lineH?: {title?: number; caption?: number}};

const db = (x: number) => Math.pow(10, x / 20);

// 下見の画面では media を URL から読む（mediaBase）。書き出しでは public/ から読む。
const media = (p: Props, name: string) => (p.mediaBase ? `${p.mediaBase}/${name}` : staticFile(name));

const useFonts = (p: Props) => {
	const [handle] = useState(() => delayRender('fonts'));
	useEffect(() => {
		const base = p.fontBase ?? staticFile('fonts');
		const faces = [
			new FontFace('ShortsTitle', `url(${base}/${p.style.fonts.title})`),
			new FontFace('ShortsCaption', `url(${base}/${p.style.fonts.caption})`),
		];
		Promise.all(faces.map((f) => f.load()))
			.then((loaded) => {
				loaded.forEach((f) => document.fonts.add(f));
				continueRender(handle);
			})
			.catch((e) => {
				console.error(e);
				continueRender(handle);
			});
	}, [handle, p.fontBase, p.style]);
};

const CutView: React.FC<{c: Cut; p: Props}> = ({c, p}) => {
	const [W, H] = p.plan.size;
	const vol = db(p.style.audio.source_db);
	const pos = `${(c.focus_x ?? 0.5) * 100}% ${(c.focus_y ?? 0.5) * 100}%`;
	const src = media(p, c.file);
	if (c.fit === 'blur') {
		return (
			<AbsoluteFill>
				<OffthreadVideo src={src} trimBefore={c.in} trimAfter={c.out} muted
					style={{width: W, height: H, objectFit: 'cover', filter: 'blur(40px) brightness(0.9)', transform: 'scale(1.1)'}} />
				<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
					<OffthreadVideo src={src} trimBefore={c.in} trimAfter={c.out} volume={vol}
						style={{width: W, height: H, objectFit: 'contain'}} />
				</AbsoluteFill>
			</AbsoluteFill>
		);
	}
	return (
		<OffthreadVideo src={src} trimBefore={c.in} trimAfter={c.out} volume={vol}
			style={{width: W, height: H, objectFit: 'cover', objectPosition: pos}} />
	);
};

const CardView: React.FC<{card: Card; kind: 'title' | 'caption'; p: Props}> = ({card, kind, p}) => {
	const st = p.style[kind];
	const stroke = st.stroke ?? 0;
	const n = card.lines.length;
	// 行の高さは render.py（PIL）の箱の高さから逆算して、同じ箱の大きさにする。
	// 人が直した字幕（w が無い）は、同じ様式の元の行の高さを使って CSS で並べる。
	const lineH = card.h
		? (card.h - 2 * st.pad_y - 2 * stroke - (n - 1) * st.line_gap) / n
		: (p.lineH?.[kind] ?? st.size * 1.48);
	const bg = kind === 'caption' ? `rgba(0,0,0,${st.bg_alpha ?? 1})` : st.bg;
	const box: React.CSSProperties = {
		background: bg, borderRadius: st.radius, boxSizing: 'border-box',
		display: 'flex', flexDirection: 'column', alignItems: 'center', gap: st.line_gap,
	};
	const lines = card.lines.map((ln, i) => (
		<div key={i} style={{
			fontFamily: kind === 'title' ? 'ShortsTitle' : 'ShortsCaption',
			fontSize: st.size, lineHeight: `${lineH}px`, height: lineH, color: st.color,
			whiteSpace: 'nowrap',
			...(stroke ? {WebkitTextStroke: `${stroke * 2}px ${st.stroke_color}`, paintOrder: 'stroke fill'} : {}),
		}}>{ln}</div>
	));
	if (card.w) {
		return (
			<div style={{...box, position: 'absolute', left: card.x, top: card.y, width: card.w, height: card.h,
				padding: `${st.pad_y + stroke}px 0`}}>{lines}</div>
		);
	}
	const [W] = p.plan.size;
	const top = kind === 'title' ? st.top : st.center_y;
	return (
		<div style={{position: 'absolute', left: 0, width: W, top, display: 'flex', justifyContent: 'center',
			transform: kind === 'title' ? undefined : 'translateY(-50%)'}}>
			<div style={{...box, padding: `${st.pad_y + stroke}px ${st.pad_x + stroke}px`, maxWidth: st.max_width}}>{lines}</div>
		</div>
	);
};

export const Short: React.FC<Props> = (p) => {
	useFonts(p);
	const {plan} = p;
	const fps = plan.fps;
	const bgmGain = (f: number) => {
		const b = plan.bgm;
		if (!b) return 0;
		const t = f / fps;
		const low = db(b.duck_db);
		let g = 1;
		for (const ln of plan.narration) {
			const s = ln.at / fps;
			const e = (ln.at + ln.frames) / fps;
			const k = Math.min(1, Math.max(0, Math.max((s - t) / b.attack_s, (t - e) / b.release_s)));
			g = Math.min(g, low + (1 - low) * k);
		}
		if (b.fade_out_s) g *= Math.min(1, Math.max(0, (plan.frames / fps - t) / b.fade_out_s));
		return g;
	};
	return (
		<AbsoluteFill style={{background: 'black'}}>
			{plan.cuts.map((c, i) => (
				<Sequence key={`c${i}`} from={c.at} durationInFrames={c.frames} layout="none">
					<AbsoluteFill><CutView c={c} p={p} /></AbsoluteFill>
				</Sequence>
			))}
			{plan.titles.map((t, i) => (
				<Sequence key={`t${i}`} from={t.from} durationInFrames={t.to - t.from} layout="none">
					<CardView card={t} kind="title" p={p} />
				</Sequence>
			))}
			{plan.captions.map((c, i) => (
				<Sequence key={`s${i}`} from={c.from} durationInFrames={c.to - c.from} layout="none">
					<CardView card={c} kind="caption" p={p} />
				</Sequence>
			))}
			{plan.narration.map((ln, i) => (
				<Sequence key={`n${i}`} from={ln.at} layout="none">
					<Audio src={media(p, ln.norm)} />
				</Sequence>
			))}
			{plan.bgm ? <Audio src={media(p, plan.bgm.norm)} volume={bgmGain} /> : null}
		</AbsoluteFill>
	);
};
