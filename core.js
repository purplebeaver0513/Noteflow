
(function(root){
'use strict';
const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=m=>m===null?'Rest':names[m%12]+(Math.floor(m/12)-1);
const pitch=m=>({step:names[m%12][0],alter:names[m%12].includes('#')?1:0,octave:Math.floor(m/12)-1});
const escape=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function totalBeats(notes){return notes.reduce((a,n)=>a+n.beats,0)}
function barLength(meter){const [a,b]=meter.split('/').map(Number);return a*4/b}
function measures(notes,meter){
 const length=barLength(meter),bars=[];let current=[],used=0,beat=0;
 notes.forEach((n,index)=>{let left=n.beats,part=0;while(left>0.001){const available=Math.min(length-used,left);const d=[4,3,2,1.5,1,.75,.5,.25].find(x=>x<=available+.001)||.25;
 const segment={...n,index,beats:d,start:beat,tieIn:n.midi!==null&&part>0,tieOut:n.midi!==null&&left-d>.001};current.push(segment);left-=d;used+=d;beat+=d;part++;
 if(used>=length-.001){bars.push(current);current=[];used=0}}
 });
 if(current.length){let left=length-used;while(left>.001){const d=[4,3,2,1.5,1,.75,.5,.25].find(x=>x<=left+.001)||.25;current.push({midi:null,beats:d,index:-1,start:beat});left-=d;beat+=d}bars.push(current)}
 return bars.length?bars:[[{midi:null,beats:length,index:-1,start:0}]];
}
function duration(beats){return ({4:['w','whole',false],3:['h','half',true],2:['h','half',false],1.5:['q','quarter',true],1:['q','quarter',false],.75:['8','eighth',true],.5:['8','eighth',false],.25:['16','16th',false]})[beats]||['q','quarter',false]}
function musicXML(state){
 const [count,unit]=state.meter.split('/'),avg=state.notes.filter(n=>n.midi!==null).reduce((a,n,_,ar)=>a+n.midi/ar.length,0),bass=avg&&avg<58;
 const bars=measures(state.notes,state.meter).map((bar,i)=>`<measure number="${i+1}">${i===0?`<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>${count}</beats><beat-type>${unit}</beat-type></time><clef><sign>${bass?'F':'G'}</sign><line>${bass?'4':'2'}</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${state.tempo}</per-minute></metronome></direction-type><sound tempo="${state.tempo}"/></direction>`:''}${bar.map(n=>{const p=n.midi===null?null:pitch(n.midi);return `<note>${p?`<pitch><step>${p.step}</step>${p.alter?'<alter>1</alter>':''}<octave>${p.octave}</octave></pitch>`:'<rest/>'}<duration>${Math.round(n.beats*4)}</duration>${n.tieIn?'<tie type="stop"/>':''}${n.tieOut?'<tie type="start"/>':''}<type>${duration(n.beats)[1]}</type>${duration(n.beats)[2]?'<dot/>':''}${n.tieIn||n.tieOut?`<notations>${n.tieIn?'<tied type="stop"/>':''}${n.tieOut?'<tied type="start"/>':''}</notations>`:''}</note>`}).join('')}${i===measures(state.notes,state.meter).length-1?'<barline location="right"><bar-style>light-heavy</bar-style></barline>':''}</measure>`).join('');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>${escape(state.title)}</work-title></work><identification><creator type="composer">Created with Noteflow</creator></identification><part-list><score-part id="P1"><part-name>${escape(state.instrument)}</part-name></score-part></part-list><part id="P1">${bars}</part></score-partwise>`;
}
function midiFile(state){
 const bytes=[],push=(...a)=>bytes.push(...a),variable=n=>{let a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a};
 const tempo=Math.round(60000000/state.tempo),[count,den]=state.meter.split('/').map(Number);push(0,255,81,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,0,255,88,4,count,Math.log2(den),24,8,0,192,({piano:0,violin:40,flute:73,guitar:24,other:0})[state.instrument]||0);
 let rest=0;for(const n of state.notes){const ticks=Math.round(n.beats*480);if(n.midi===null){rest+=ticks;continue}push(...variable(rest),144,n.midi,88,...variable(ticks),128,n.midi,0);rest=0}push(...variable(rest),255,47,0);
 const size=bytes.length;return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,(size>>>24)&255,(size>>>16)&255,(size>>>8)&255,size&255,...bytes]);
}
function wavFile(samples,rate){const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);return buffer}
function yin(data,start,rate,minFreq,maxFreq,gate){
 const w=512,maxTau=Math.min(Math.ceil(rate/minFreq),data.length-start-w-1),minTau=Math.max(2,Math.floor(rate/maxFreq));if(maxTau<minTau)return null;
 let energy=0;for(let i=0;i<w;i++)energy+=data[start+i]*data[start+i];const rms=Math.sqrt(energy/w);if(rms<gate)return {midi:null,rms,confidence:0};
 const diff=new Float64Array(maxTau+1);let cumulative=0,tau=-1;
 for(let t=1;t<=maxTau;t++){let d=0;for(let j=0;j<w;j++){const delta=data[start+j]-data[start+j+t];d+=delta*delta}cumulative+=d;diff[t]=cumulative?d*t/cumulative:1;
 if(t>minTau+1&&diff[t-1]<.16&&diff[t]>diff[t-1]){tau=t-1;break}}
 if(tau<0){let min=1;for(let t=minTau;t<=maxTau;t++)if(diff[t]<min){min=diff[t];tau=t}if(min>.28)return {midi:null,rms,confidence:0}}
 const prev=diff[tau-1]??diff[tau],cur=diff[tau],next=diff[tau+1]??cur;const divisor=2*(2*cur-next-prev);let better=tau+(divisor?(next-prev)/divisor:0);if(!Number.isFinite(better)||better<minTau)better=tau;
 const frequency=rate/better;const midi=Math.round(69+12*Math.log2(frequency/440));return {midi:midi>=21&&midi<=108?midi:null,rms,confidence:1-cur};
}
async function detectEvents(data,rate,options,onProgress=()=>{},isCancelled=()=>false){
 const ranges={piano:[55,2100],violin:[190,3100],flute:[245,2300],guitar:[75,1400],trombone:[40,1200],cello:[55,1400],viola:[120,1900],other:[55,2100]},[lo,hi]=ranges[options.instrument]||ranges.other,hop=Math.round(rate*.01),frames=[];
 let peak=0;for(let i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));if(peak<.002)return [];const gate=Math.max(.0015,Math.min(.012,peak*.017))*(options.sensitivity==='strict'?1.5:options.sensitivity==='sensitive'?.6:1);
 const end=data.length-512-Math.ceil(rate/lo)-1;
 for(let i=0;i<end;i+=hop){if(isCancelled())throw new Error('Cancelled');frames.push({...yin(data,i,rate,lo,hi,gate),time:i/rate});if(frames.length%45===0){onProgress(i/Math.max(1,end));await new Promise(r=>setTimeout(r,0))}}
 const pitches=frames.map(f=>f.midi);for(let i=1;i<frames.length-1;i++)if(pitches[i-1]===pitches[i+1])frames[i].midi=pitches[i-1];
 const events=[];let active=null;
 function finish(time){if(active&&time-active.start>=.06)events.push({...active,end:time});active=null}
 for(let i=0;i<frames.length;i++){const f=frames[i],next=frames[i+1],prev=frames[i-1];const stable=f.midi!==null&&(f.midi===next?.midi||f.midi===prev?.midi);const reattack=active&&f.midi===active.midi&&f.time-active.start>.12&&prev&&f.rms>prev.rms*2.1&&f.rms>gate*4;
 if(!stable||f.midi!==active?.midi||reattack){if(active)finish(f.time);if(stable)active={midi:f.midi,start:f.time,confidence:f.confidence}}}
 finish(frames.length?frames[frames.length-1].time+.03:0);onProgress(1);return events;
}
function quantize(events,tempo,grid){
 if(!events.length)return [];const base=events[0].start,factor=tempo/60,notes=[];let cursor=0;
 for(let i=0;i<events.length;i++){const e=events[i],next=events[i+1];let start=Math.max(cursor,Math.round((e.start-base)*factor/grid)*grid);const roundedEnd=Math.round((e.end-base)*factor/grid)*grid;let end=Math.max(start+grid,roundedEnd);
 if(next){const nextStart=Math.round((next.start-base)*factor/grid)*grid;end=Math.min(end,Math.max(start+grid,nextStart));if((next.start-e.end)*factor<grid*.75)end=Math.max(start+grid,nextStart)}
 if(start>cursor+.001)notes.push({midi:null,beats:start-cursor});notes.push({midi:e.midi,beats:end-start});cursor=end;
 }return notes;
}
function validateProject(s){
 if(!s||s.format!=='noteflow'||s.version!==1||!Array.isArray(s.notes)||s.notes.length<1||s.notes.length>1500)throw new Error('This is not a supported Noteflow project.');
 if(!['piano','violin','flute','guitar','other'].includes(s.instrument)||!['4/4','3/4','6/8'].includes(s.meter)||!Number.isFinite(s.tempo)||s.tempo<40||s.tempo>240||![.25,.5,1].includes(s.grid))throw new Error('This project has invalid settings.');
 if(s.notes.some(n=>!n||!(n.midi===null||Number.isInteger(n.midi)&&n.midi>=21&&n.midi<=108)||!Number.isFinite(n.beats)||n.beats<=0||n.beats>32||Math.abs(n.beats*4-Math.round(n.beats*4))>.001)||totalBeats(s.notes)>1024||totalBeats(s.notes)*60/s.tempo>300)throw new Error('This project contains invalid notes.');
 return {format:'noteflow',version:1,title:String(s.title||'Untitled melody').slice(0,80),instrument:s.instrument,tempo:s.tempo,meter:s.meter,grid:s.grid,notes:s.notes.map(n=>({midi:n.midi,beats:n.beats})),isDemo:false};
}
function demo(){return {format:'noteflow',version:1,title:'A little morning melody',instrument:'piano',tempo:100,meter:'4/4',grid:.5,isDemo:true,notes:[[64,1],[67,.5],[69,.5],[67,1],[64,1],[62,1],[64,1],[60,2],[65,1],[69,.5],[71,.5],[69,1],[65,1],[64,1],[62,1],[60,2],[67,1],[72,.5],[71,.5],[69,1],[67,1],[65,1],[64,1],[62,2],[64,.5],[65,.5],[67,1],[64,1],[62,1],[60,4]].map(([midi,beats])=>({midi,beats}))}}
const api={noteName,pitch,escape,totalBeats,barLength,measures,duration,musicXML,midiFile,wavFile,yin,detectEvents,quantize,validateProject,demo};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.NF=api;
})(typeof globalThis!=='undefined'?globalThis:this);

