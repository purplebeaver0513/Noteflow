
(function(root){
'use strict';
function fft(real,imag,inverse=false){
 const n=real.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]]}}
 for(let length=2;length<=n;length<<=1){const angle=(inverse?2:-2)*Math.PI/length,wr=Math.cos(angle),wi=Math.sin(angle);for(let i=0;i<n;i+=length){let ur=1,ui=0;for(let j=0;j<length/2;j++){const k=i+j,l=k+length/2,vr=real[l]*ur-imag[l]*ui,vi=real[l]*ui+imag[l]*ur;real[l]=real[k]-vr;imag[l]=imag[k]-vi;real[k]+=vr;imag[k]+=vi;const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next}}}
 if(inverse)for(let i=0;i<n;i++){real[i]/=n;imag[i]/=n}
}
const median=values=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]||0};
async function reduce(data,rate,mode='balanced',progress=()=>{},cancel=()=>false){
 if(mode==='off')return {samples:data.slice(),reductionDb:0,profile:'off'};
 const size=1024,hop=256,bins=size/2+1,window=Float64Array.from({length:size},(_,i)=>Math.sin(Math.PI*i/(size-1))**2),real=new Float64Array(size),imag=new Float64Array(size),frames=[];
 // Survey the entire recording so an introductory note is never assumed to be noise.
 const stride=Math.max(hop,Math.floor(data.length/96/hop)*hop);
 for(let pos=0;pos<data.length;pos+=stride){let energy=0;for(let i=0;i<size;i++){const sample=data[pos+i]||0;energy+=sample*sample;real[i]=sample*window[i];imag[i]=0}fft(real,imag);frames.push({energy:energy/size,power:Float64Array.from({length:bins},(_,k)=>real[k]**2+imag[k]**2)})}
 if(!frames.length)return {samples:data.slice(),reductionDb:0,profile:'silent'};
 const sorted=[...frames].sort((a,b)=>a.energy-b.energy),max=sorted.at(-1).energy;let quiet=sorted.filter(f=>f.energy<max*.12).slice(0,24);const hasRoomTone=quiet.length>=3;
 if(!hasRoomTone)quiet=sorted.slice(0,Math.max(3,Math.ceil(sorted.length*.3)));
 const profile=new Float64Array(bins);
 for(let k=0;k<bins;k++)profile[k]=median(quiet.map(f=>{if(hasRoomTone)return f.power[k];const near=[];for(let j=Math.max(1,k-12);j<=Math.min(bins-1,k+12);j++)near.push(f.power[j]);return Math.min(f.power[k],median(near))}));
 const output=new Float64Array(data.length+size),weights=new Float64Array(output.length),last=new Float64Array(bins).fill(1),strength=mode==='light'?1.1:mode==='strong'?2.5:1.65,floor=mode==='strong'?.06:mode==='light'?.22:.12;
 let before=0,after=0;
 for(let pos=-size+hop,frame=0;pos<data.length;pos+=hop,frame++){
  if(cancel())throw new Error('Cancelled');for(let i=0;i<size;i++){real[i]=(data[pos+i]||0)*window[i];imag[i]=0}fft(real,imag);
  for(let k=0;k<bins;k++){const power=real[k]**2+imag[k]**2,estimate=profile[k]*strength;let gain=Math.max(floor,Math.sqrt(Math.max(0,1-estimate/(power+1e-12))));gain=.75*gain+.25*last[k];last[k]=gain;if(k*rate/size<22)gain*=.1;real[k]*=gain;imag[k]*=gain;if(k>0&&k<size/2){real[size-k]*=gain;imag[size-k]*=gain}}
  fft(real,imag,true);for(let i=0;i<size;i++)if(pos+i>=0&&pos+i<output.length){output[pos+i]+=real[i]*window[i];weights[pos+i]+=window[i]*window[i]}
  if(frame%64===0){progress(Math.max(0,pos/data.length));await new Promise(resolve=>setTimeout(resolve,0))}
 }
 const samples=new Float32Array(data.length);for(let i=0;i<data.length;i++){samples[i]=weights[i]>1e-8?output[i]/weights[i]:data[i];before+=data[i]**2;after+=samples[i]**2}
 progress(1);return {samples,reductionDb:Math.max(0,10*Math.log10((before+1e-12)/(after+1e-12))),profile:hasRoomTone?'quiet passages':'adaptive'};
}
const api={fft,reduce};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.NoteflowNoise=api;
})(globalThis);

