/** IslandScene の飾りの形だけを、大きさ別に並べて焼く。島を通さないので速い。 */
import { writeFileSync } from "fs";
function rng(seed){let a=seed>>>0;return()=>{a+=0x6d2b79f5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const f=(n)=>n.toFixed(1);
function oval(x,y,rx,ry){return `M${f(x-rx)},${f(y)}a${f(rx)},${f(ry)} 0 1,0 ${f(rx*2)},0a${f(rx)},${f(ry)} 0 1,0 ${f(-rx*2)},0`;}
function facet(x,y,rx,ry,n,r){let d="";for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2-Math.PI/2+(r()-0.5)*0.42;const k=0.78+r()*0.22;d+=`${i?"L":"M"}${f(x+Math.cos(a)*rx*k)},${f(y+Math.sin(a)*ry*k)}`;}return d+"Z";}
function bladeClump(x,y,s,lean,n,r){let d="";for(let i=0;i<n;i++){const dx=(i-(n-1)/2)*2.6*s;const h=(5.5+r()*4.5)*s;d+=`M${f(x+dx)},${f(y)}q${f(dx*0.4+lean)},${f(-h*0.6)} ${f(dx*0.9+lean*2)},${f(-h)}q${f(-dx*0.2)},${f(h*0.55)} ${f(-dx*0.6-lean*1.4)},${f(h)}Z`;}return d;}
function bakeDeco(list,seed){const r=rng(seed);const b={shade:"",rock:"",rockLit:"",bush:"",bushLit:"",bark:"",barkTop:"",cap:"",stem:"",tuft:"",tuftLit:""};
for(const it of list){const{x,y,s}=it;
 if(it.k==="rock"){const w=s*1.34;b.shade+=oval(x+w*0.12,y+s*0.1,w*0.6,s*0.3);b.rock+=facet(x,y-s*0.42,w*0.5,s*0.5,6,r);b.rockLit+=facet(x-w*0.12,y-s*0.62,w*0.28,s*0.26,5,r);}
 else if(it.k==="bush"){const w=s*1.12;b.shade+=oval(x+w*0.12,y+s*0.07,w*0.58,s*0.26);b.bush+=oval(x,y-s*0.46,w*0.5,s*0.48)+oval(x-w*0.3,y-s*0.3,w*0.31,s*0.3)+oval(x+w*0.31,y-s*0.32,w*0.29,s*0.29);b.bushLit+=oval(x-w*0.13,y-s*0.66,w*0.29,s*0.23)+oval(x+w*0.17,y-s*0.56,w*0.18,s*0.15);}
 else if(it.k==="stump"){const hw=s*0.44;b.shade+=oval(x+hw*0.34,y+s*0.07,hw*1.32,s*0.26);b.bark+=`M${f(x-hw)},${f(y-s*0.62)}L${f(x-hw)},${f(y-s*0.16)}a${f(hw)},${f(s*0.2)} 0 0,0 ${f(hw*2)},0L${f(x+hw)},${f(y-s*0.62)}Z`;b.barkTop+=oval(x,y-s*0.62,hw,s*0.21);b.bark+=oval(x,y-s*0.62,hw*0.44,s*0.09);}
 else if(it.k==="shroom"){b.shade+=oval(x+s*0.12,y+s*0.04,s*0.42,s*0.17);b.stem+=`M${f(x-s*0.15)},${f(y)}L${f(x-s*0.12)},${f(y-s*0.42)}h${f(s*0.24)}L${f(x+s*0.15)},${f(y)}Z`;b.cap+=`M${f(x-s*0.44)},${f(y-s*0.4)}a${f(s*0.44)},${f(s*0.38)} 0 0,1 ${f(s*0.88)},0Z`;b.stem+=oval(x-s*0.14,y-s*0.56,s*0.1,s*0.07)+oval(x+s*0.16,y-s*0.5,s*0.08,s*0.06);}
 else{const k=1.1+r()*1.1;const d=bladeClump(x,y,k*(s/14),(r()-0.5)*2.4,3+Math.floor(r()*3),r);if(r()<0.5)b.tuftLit+=d;else b.tuft+=d;}}
return b;}
const kinds=["rock","bush","stump","shroom","tuft"];
const list=[];
kinds.forEach((k,row)=>{[10,14,18,24,30].forEach((s,col)=>{list.push({k,x:60+col*70,y:70+row*70,s});});});
const b=bakeDeco(list,5502);
const g=(d,fill,op=1)=>`<path d="${d}" fill="${fill}"${op<1?` opacity="${op}"`:""}/>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${420*2}" height="${400*2}" viewBox="0 0 420 400">
<rect width="420" height="400" fill="#7cc24a"/>
${g(b.shade,"#2f4a33",0.3)}
${g(b.tuft,"#4f9c3a",0.75)}${g(b.tuftLit,"#a8d466",0.88)}
${g(b.bush,"#2c6b30")}${g(b.bushLit,"#a8d466")}
${g(b.bark,"#8a5c36")}${g(b.barkTop,"#c69a63")}
${g(b.rock,"#8d9aa0")}${g(b.rockLit,"#c3ccd0")}
${g(b.cap,"#e2522d")}${g(b.stem,"#f6efe0")}
</svg>`;
writeFileSync("/tmp/shots/deco.svg", svg);
console.log("wrote /tmp/shots/deco.svg");
