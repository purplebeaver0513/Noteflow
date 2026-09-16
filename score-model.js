
/* Version 2 score model: simultaneous pitches and ties, with v1 migration. */
(function(root){
'use strict';
const N=root.NF,oldDemo=N.demo;
const instruments={
 piano:{name:'Piano',clefs:['treble','bass'],program:0,description:'Grand staff · treble + bass'},
 flute:{name:'Flute',clefs:['treble'],program:73,description:'Treble clef'},
 violin:{name:'Violin',clefs:['treble'],program:40,description:'Treble clef'},
 trombone:{name:'Trombone',clefs:['bass'],program:57,description:'Bass clef'},
 cello:{name:'Cello',clefs:['bass'],program:42,description:'Bass clef'},
 viola:{name:'Viola',clefs:['alto'],program:41,description:'Alto clef'},
 guitar:{name:'Guitar',clefs:['treble'],program:24,description:'Treble clef · concert pitch'},
 other:{name:'Other / voice',clefs:['treble'],program:0,description:'Treble clef'}
};
function pitches(n){return Array.isArray(n.pitches)?n.pitches:n.midi===null?[]:[n.midi]}
function staffPitches(n,instrument,staff){return pitches(n).filter(p=>instrument!=='piano'||(staff===0?p>=60:p<60))}
function parsePitches(value){
 const text=String(value).trim();if(!text||/^rest$/i.test(text))return [];
 const notes=text.split(/[\s,;]+/).map(token=>{const match=token.replace(/♯/g,'#').replace(/♭/g,'b').match(/^([A-Ga-g])([#b]?)(-?\d)$/);if(!match)throw new Error('Use note names such as C4 E4 G4, F#3, Bb3, or Rest.');const base={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1].toUpperCase()],midi=(Number(match[3])+1)*12+base+(match[2]==='#'?1:match[2]==='b'?-1:0);if(midi<21||midi>108)throw new Error('Choose notes from A0 to C8.');return midi});
 const unique=[...new Set(notes)].sort((a,b)=>a-b);if(unique.length>16)throw new Error('Use up to 16 simultaneous notes.');return unique;
}
function measures(notes,meter){
 const length=N.barLength(meter),bars=[];let current=[],used=0,beat=0;
 notes.forEach((n,index)=>{let left=n.beats,part=0;const ps=pitches(n),previous=index? pitches(notes[index-1]):[];
  while(left>.001){const room=Math.min(length-used,left),d=[4,3,2,1.5,1,.75,.5,.25].find(x=>x<=room+.001)||.25;
   const from=part?ps:(n.tieFrom||[]).filter(p=>ps.includes(p)&&previous.includes(p));
   const to=left>d+.001?ps:(notes[index+1]?.tieFrom||[]).filter(p=>ps.includes(p)&&pitches(notes[index+1]).includes(p));
   current.push({...n,pitches:ps,index,beats:d,start:beat,tieFrom:from,tieTo:to,tieIn:from.length>0,tieOut:to.length>0});
   left-=d;used+=d;beat+=d;part++;if(used>=length-.001){bars.push(current);current=[];used=0}
  }
 });
 if(current.length){let left=length-used;while(left>.001){const d=[4,3,2,1.5,1,.75,.5,.25].find(x=>x<=left+.001)||.25;current.push({midi:null,pitches:[],beats:d,index:-1,start:beat,tieFrom:[],tieTo:[]});left-=d;beat+=d}bars.push(current)}
 return bars.length?bars:[[{midi:null,pitches:[],beats:length,index:-1,start:0,tieFrom:[],tieTo:[]}]];
}
function soundEvents(notes){
 const events=[];let beat=0,active=new Map();
 for(const n of notes){const next=new Map();for(const midi of pitches(n)){if((n.tieFrom||[]).includes(midi)&&active.has(midi)){const event=active.get(midi);event.end=beat+n.beats;next.set(midi,event)}else{const event={midi,start:beat,end:beat+n.beats};events.push(event);next.set(midi,event)}}active=next;beat+=n.beats}
 return events;
}
function quantizePoly(events,tempo,grid){
 if(!events.length)return [];const base=Math.min(...events.map(e=>e.start)),factor=tempo/60;
 const quantized=events.map((e,id)=>({midi:e.midi,id,start:Math.max(0,Math.round((e.start-base)*factor/grid)*grid),end:Math.max(grid,Math.round((e.end-base)*factor/grid)*grid)})).map(e=>({...e,end:Math.max(e.start+grid,e.end)}));
 const boundaries=[...new Set(quantized.flatMap(e=>[e.start,e.end]))].sort((a,b)=>a-b),notes=[];let previous=new Map();
 for(let i=0;i<boundaries.length-1;i++){const t=boundaries[i],end=boundaries[i+1],active=new Map();for(const e of quantized)if(e.start<=t+.001&&e.end>t+.001)active.set(e.midi,e.id);
  const ps=[...active.keys()].sort((a,b)=>a-b),from=ps.filter(m=>previous.get(m)===active.get(m)&&previous.has(m)),last=notes.at(-1);
  if(last&&ps.length===pitches(last).length&&ps.every(p=>pitches(last).includes(p))&&from.length===ps.length&&last.beats+end-t<=32){last.beats+=end-t}
  else notes.push({midi:ps[0]??null,pitches:ps,beats:end-t,tieFrom:from});previous=active;
 }
 return notes;
}
function validateProject(s){
 if(!s||s.format!=='noteflow'||![1,2].includes(s.version)||!Array.isArray(s.notes)||!s.notes.length||s.notes.length>1500)throw new Error('This is not a supported Noteflow project.');
 if(!instruments[s.instrument]||!['4/4','3/4','6/8'].includes(s.meter)||!Number.isFinite(s.tempo)||s.tempo<40||s.tempo>240||![.25,.5,1].includes(s.grid))throw new Error('This project has invalid settings.');
 const notes=s.notes.map(n=>{if(!n)throw new Error('Invalid note.');const ps=pitches(n);if(!Array.isArray(ps)||ps.length>16||new Set(ps).size!==ps.length||ps.some(p=>!Number.isInteger(p)||p<21||p>108)||!Number.isFinite(n.beats)||n.beats<=0||n.beats>32||Math.abs(n.beats*4-Math.round(n.beats*4))>.001)throw new Error('This project contains invalid notes.');const from=n.tieFrom||[];if(!Array.isArray(from)||from.some(p=>!ps.includes(p)))throw new Error('This project has invalid ties.');return {midi:ps[0]??null,pitches:[...ps].sort((a,b)=>a-b),beats:n.beats,tieFrom:[...new Set(from)]}});
 if(N.totalBeats(notes)>1024||N.totalBeats(notes)*60/s.tempo>300)throw new Error('Please keep scores under 5 minutes.');
 return {format:'noteflow',version:2,title:String(s.title||'Untitled music').slice(0,80),instrument:s.instrument,sourceInstrument:instruments[s.sourceInstrument]?s.sourceInstrument:s.instrument,tempo:s.tempo,meter:s.meter,grid:s.grid,noise:['off','light','balanced','strong'].includes(s.noise)?s.noise:'balanced',mode:s.mode==='melody'?'melody':'poly',sensitivity:['balanced','strict','sensitive'].includes(s.sensitivity)?s.sensitivity:'balanced',notes,isDemo:false};
}
function musicXML(s){
 const spec=instruments[s.instrument],bars=measures(s.notes,s.meter),[count,unit]=s.meter.split('/');
 const body=bars.map((bar,i)=>`<measure number="${i+1}">${i===0?`<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>${count}</beats><beat-type>${unit}</beat-type></time>${spec.clefs.length===2?'<staves>2</staves>':''}${spec.clefs.map((clef,staff)=>`<clef number="${staff+1}"><sign>${clef==='bass'?'F':clef==='alto'?'C':'G'}</sign><line>${clef==='bass'?4:clef==='alto'?3:2}</line></clef>`).join('')}</attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${s.tempo}</per-minute></metronome></direction-type><sound tempo="${s.tempo}"/></direction>`:''}${spec.clefs.map((_,staff)=>`${staff?`<backup><duration>${N.barLength(s.meter)*4}</duration></backup>`:''}${bar.map(n=>{const ps=staffPitches(n,s.instrument,staff),chord=ps.length?ps:[null];return chord.map((m,j)=>{const p=m===null?null:N.pitch(m),from=n.tieFrom.includes(m),to=n.tieTo.includes(m);return `<note>${j?'<chord/>':''}${p?`<pitch><step>${p.step}</step>${p.alter?'<alter>1</alter>':''}<octave>${p.octave}</octave></pitch>`:'<rest/>'}<duration>${n.beats*4}</duration>${from?'<tie type="stop"/>':''}${to?'<tie type="start"/>':''}<voice>${staff+1}</voice><type>${N.duration(n.beats)[1]}</type>${N.duration(n.beats)[2]?'<dot/>':''}${spec.clefs.length===2?`<staff>${staff+1}</staff>`:''}${from||to?`<notations>${from?'<tied type="stop"/>':''}${to?'<tied type="start"/>':''}</notations>`:''}</note>`}).join('')}).join('')}`).join('')}${i===bars.length-1?'<barline location="right"><bar-style>light-heavy</bar-style></barline>':''}</measure>`).join('');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>${N.escape(s.title)}</work-title></work><identification><creator type="composer">Created with Noteflow</creator></identification><part-list><score-part id="P1"><part-name>${N.escape(spec.name)}</part-name><score-instrument id="I1"><instrument-name>${N.escape(spec.name)}</instrument-name></score-instrument><midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>${spec.program+1}</midi-program></midi-instrument></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}
function midiFile(s){
 const bytes=[],variable=n=>{let a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a},push=(...v)=>bytes.push(...v),tempo=Math.round(60000000/s.tempo),[count,den]=s.meter.split('/').map(Number);
 push(0,255,81,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,0,255,88,4,count,Math.log2(den),24,8,0,192,instruments[s.instrument].program);
 const events=soundEvents(s.notes).flatMap(e=>[{tick:Math.round(e.start*480),on:true,midi:e.midi},{tick:Math.round(e.end*480),on:false,midi:e.midi}]).sort((a,b)=>a.tick-b.tick||Number(a.on)-Number(b.on)||a.midi-b.midi);
 let tick=0;for(const e of events){push(...variable(e.tick-tick),e.on?144:128,e.midi,e.on?85:0);tick=e.tick}push(...variable(Math.max(0,N.totalBeats(s.notes)*480-tick)),255,47,0);const size=bytes.length;
 return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,(size>>>24)&255,(size>>>16)&255,(size>>>8)&255,size&255,...bytes]);
}
function demo(){const original=oldDemo(),events=[];let beat=0;for(const n of original.notes){events.push({midi:n.midi,start:beat,end:beat+n.beats});beat+=n.beats}for(let b=0;b<32;b+=4){const root=[48,48,53,48,48,53,55,48][b/4];events.push({midi:root,start:b,end:b+4},{midi:root+7,start:b,end:b+4})}return {...original,version:2,sourceInstrument:'piano',mode:'poly',noise:'balanced',sensitivity:'balanced',notes:quantizePoly(events,60,.5)}}
Object.assign(N,{instruments,pitches,staffPitches,parsePitches,measures,soundEvents,quantizePoly,validateProject,musicXML,midiFile,demo});
})(globalThis);

