import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Short, type Props} from './Short';

const Root: React.FC = () => (
	<Composition
		id="Short"
		component={Short as React.FC<any>}
		width={1080}
		height={1920}
		fps={30}
		durationInFrames={900}
		defaultProps={{} as Props}
		calculateMetadata={({props}) => {
			const p = props as Props;
			return {
				durationInFrames: p.plan.frames,
				fps: p.plan.fps,
				width: p.plan.size[0],
				height: p.plan.size[1],
			};
		}}
	/>
);

registerRoot(Root);
