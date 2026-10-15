// 人が直す画面（PoC）。issue に貼った URL を開くと、今回の編集が読み込まれた状態で開く。
//   ?data=<bundle.json の URL>
// bundle.json = render.py の plan.json ＋ style.json ＋ 素材の置き場（mediaBase）。
// 直せるもの: タイトル・字幕の文字（改行も）・各カットの入り/出（1コマ単位）。
// 直した結果は「指示書への差分（patch）」として書き出し、issue に貼る → Actions が書き直す。
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player, type PlayerRef} from '@remotion/player';
import {Short, type Plan, type Props, type Card} from '../src/Short';

type Bundle = Props & {id: string; issue?: string};
type Patch = {title?: string; captions: Record<string, string>; cuts: Record<string, {in: number; out: number}>};

const fmt = (f: number, fps: number) => {
	const s = f / fps;
	return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};

// 直した内容から、下見用の時間割を作り直す（カットの長さが変われば後ろを詰める）
const derive = (base: Plan, patch: Patch): Plan => {
	const plan: Plan = JSON.parse(JSON.stringify(base));
	let at = 0;
	const shifts: {from: number; delta: number}[] = [];
	plan.cuts.forEach((c, i) => {
		const ov = patch.cuts[i];
		const oldEnd = c.at + c.frames;
		if (ov) {
			c.in = ov.in;
			c.out = ov.out;
			c.frames = ov.out - ov.in;
		}
		const delta = at + c.frames - oldEnd;
		c.at = at;
		at += c.frames;
		if (delta) shifts.push({from: oldEnd, delta});
	});
	const shift = (f: number) => f + shifts.filter((s) => f >= s.from).reduce((a, s) => a + s.delta, 0);
	plan.frames = at;
	plan.narration.forEach((ln) => (ln.at = shift(ln.at)));
	plan.captions = plan.captions.map((c) => {
		const out: Card = {...c, from: shift(c.from), to: Math.min(shift(c.to), at)};
		const t = c.line !== undefined ? patch.captions[c.line] : undefined;
		if (t !== undefined) {
			out.lines = t.split('\n').filter((x) => x.trim());
			delete out.w; delete out.h; delete out.x; delete out.y;
		}
		return out;
	}).filter((c) => c.lines.length && c.to > c.from);
	plan.titles = plan.titles.map((t) => {
		const out: Card = {...t, to: at};
		if (patch.title !== undefined) {
			out.lines = patch.title.split('\n').filter((x) => x.trim());
			delete out.w; delete out.h; delete out.x; delete out.y;
		}
		return out;
	});
	return plan;
};

const App: React.FC = () => {
	const [bundle, setBundle] = useState<Bundle | null>(null);
	const [err, setErr] = useState('');
	const [patch, setPatch] = useState<Patch>({captions: {}, cuts: {}});
	const [showOut, setShowOut] = useState(false);
	const player = useRef<PlayerRef>(null);

	useEffect(() => {
		const url = new URLSearchParams(location.search).get('data');
		if (!url) return setErr('?data= が無い');
		fetch(url).then((r) => r.json()).then(setBundle).catch((e) => setErr(String(e)));
	}, []);

	const plan = useMemo(() => (bundle ? derive(bundle.plan, patch) : null), [bundle, patch]);
	if (err) return <p style={{padding: 16}}>{err}</p>;
	if (!bundle || !plan) return <p style={{padding: 16}}>読み込み中…</p>;
	const fps = plan.fps;
	const lineH = {
		title: bundle.plan.titles[0]?.h ? (bundle.plan.titles[0].h! - 2 * bundle.style.title.pad_y - (bundle.plan.titles[0].lines.length - 1) * bundle.style.title.line_gap) / bundle.plan.titles[0].lines.length : undefined,
		caption: bundle.plan.captions[0]?.h ? (bundle.plan.captions[0].h! - 2 * bundle.style.caption.pad_y - 2 * bundle.style.caption.stroke - (bundle.plan.captions[0].lines.length - 1) * bundle.style.caption.line_gap) / bundle.plan.captions[0].lines.length : undefined,
	};
	const seek = (f: number) => player.current?.seekTo(f);
	const nudge = (i: number, key: 'in' | 'out', d: number) => {
		const c = bundle.plan.cuts[i];
		const cur = patch.cuts[i] ?? {in: c.in, out: c.out};
		const next = {...cur, [key]: Math.max(0, cur[key] + d)};
		if (next.out - next.in < 1) return;
		setPatch({...patch, cuts: {...patch.cuts, [i]: next}});
		const at = derive(bundle.plan, {...patch, cuts: {...patch.cuts, [i]: next}}).cuts[i].at;
		seek(key === 'in' ? at : at + next.out - next.in - 1);
	};
	const lines = bundle.plan.narration.map((ln, i) => ({i, ln}));
	const captionText = (i: number) => {
		if (patch.captions[i] !== undefined) return patch.captions[i];
		return bundle.plan.captions.filter((c) => c.line === i).map((c) => c.lines.join('\n')).join('\n');
	};
	const changed = patch.title !== undefined || Object.keys(patch.captions).length || Object.keys(patch.cuts).length;
	const out = JSON.stringify({edit: bundle.id, patch}, null, 1);

	return (
		<div style={{maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui, sans-serif', paddingBottom: 96}}>
			<div style={{position: 'sticky', top: 0, background: '#111', zIndex: 2, display: 'flex', justifyContent: 'center'}}>
				<Player ref={player} component={Short as React.FC<any>}
					inputProps={{plan, style: bundle.style, fontBase: bundle.fontBase, mediaBase: bundle.mediaBase, lineH}}
					durationInFrames={plan.frames} fps={fps} compositionWidth={plan.size[0]} compositionHeight={plan.size[1]}
					controls style={{width: 'min(100%, calc(46vh * 9 / 16))', aspectRatio: '9 / 16'}} acknowledgeRemotionLicense />
			</div>
			<section style={{padding: '12px 16px'}}>
				<h2 style={{fontSize: 18, margin: '8px 0'}}>タイトル</h2>
				<textarea data-testid="title" rows={2} style={{width: '100%', fontSize: 17, boxSizing: 'border-box'}}
					value={patch.title ?? bundle.plan.titles[0]?.lines.join('\n') ?? ''}
					onChange={(e) => setPatch({...patch, title: e.target.value})} />
				<h2 style={{fontSize: 18, margin: '16px 0 8px'}}>字幕</h2>
				{lines.map(({i, ln}) => (
					<div key={i} style={{marginBottom: 12}}>
						<button onClick={() => seek(plan.narration[i].at)} style={{fontSize: 14, border: 0, background: 'none', color: '#06c', padding: 0}}>
							{fmt(plan.narration[i].at, fps)} から ▶
						</button>
						<textarea data-testid={`caption-${i}`} rows={2} style={{width: '100%', fontSize: 17, boxSizing: 'border-box'}}
							value={captionText(i)}
							onFocus={() => seek(plan.narration[i].at + 10)}
							onChange={(e) => setPatch({...patch, captions: {...patch.captions, [i]: e.target.value}})} />
					</div>
				))}
				<h2 style={{fontSize: 18, margin: '16px 0 8px'}}>カット（1コマ = 1/{fps}秒）</h2>
				{bundle.plan.cuts.map((c, i) => {
					const cur = patch.cuts[i] ?? {in: c.in, out: c.out};
					const b = (label: string, key: 'in' | 'out', d: number) => (
						<button data-testid={`cut-${i}-${key}-${d}`} onClick={() => nudge(i, key, d)}
							style={{minWidth: 44, minHeight: 44, fontSize: 15}}>{label}</button>
					);
					return (
						<div key={i} style={{borderTop: '1px solid #ddd', padding: '8px 0'}}>
							<div style={{fontSize: 15}}>{i + 1}本目（{fmt(plan.cuts[i].at, fps)}〜 / {cur.out - cur.in}コマ）</div>
							<div style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'}}>
								<span>入り {cur.in}</span>{b('−1', 'in', -1)}{b('+1', 'in', 1)}
								<span style={{marginLeft: 8}}>出 {cur.out}</span>{b('−1', 'out', -1)}{b('+1', 'out', 1)}
							</div>
						</div>
					);
				})}
			</section>
			<div style={{position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #ccc', padding: 12, zIndex: 3}}>
				<button data-testid="export" disabled={!changed} onClick={() => setShowOut(true)}
					style={{width: '100%', minHeight: 48, fontSize: 17, background: changed ? '#0a7' : '#ccc', color: '#fff', border: 0, borderRadius: 8}}>
					直したところを issue に貼る形にする
				</button>
			</div>
			{showOut ? (
				<div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 4, display: 'flex', alignItems: 'flex-end'}}>
					<div style={{background: '#fff', width: '100%', padding: 16, boxSizing: 'border-box'}}>
						<p style={{margin: '0 0 8px'}}>これをコピーして、issue にそのまま貼ってください。書き直した動画が返ってきます。</p>
						<textarea data-testid="patch" readOnly rows={10} style={{width: '100%', fontSize: 13, boxSizing: 'border-box'}} value={'```json\n' + out + '\n```'} />
						<div style={{display: 'flex', gap: 8, marginTop: 8}}>
							<button style={{flex: 1, minHeight: 44}} onClick={() => navigator.clipboard?.writeText('```json\n' + out + '\n```')}>コピー</button>
							{bundle.issue ? <a style={{flex: 1, minHeight: 44, textAlign: 'center', lineHeight: '44px'}} href={bundle.issue}>issue を開く</a> : null}
							<button style={{flex: 1, minHeight: 44}} onClick={() => setShowOut(false)}>閉じる</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
};

createRoot(document.getElementById('root')!).render(<App />);
