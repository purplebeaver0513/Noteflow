
/* Windowed Basic Pitch inference. Model and postprocessing: Spotify AB.
 * Each window is disposed before the next to bound TensorFlow memory use. */
(function(root){
'use strict';
let modelPromise;
const supportWindow=Float64Array.from({length:2048},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/2047));
// Reject model proposals with no corresponding tonal energy in the recording.
// Check harmonics too, to allow instruments with a weak fundamental.
function hasTonalSupport(data,rate,n,sensitivity){
 const frequency=440*2**((n.midi-69)/12),threshold=sensitivity==='sensitive'?.035:sensitivity==='strict'?.13:.08;
 for(const position of [.2,.5,.75]){
  const center=Math.round((n.start+(n.end-n.start)*position)*rate),begin=center-1024;let rms=0;
  for(let i=0;i<2048;i++)rms+=(data[begin+i]||0)**2;rms=Math.sqrt(rms/2048);if(rms<.0001)continue;
  const amplitudes=[];
  for(const harmonic of [1,2,3]){let peak=0;for(const tuning of [.99,1,1.01]){
   const f=frequency*harmonic*tuning;if(f>=rate*.48)continue;const coefficient=2*Math.cos(2*Math.PI*f/rate);let a=0,b=0;
   for(let i=0;i<2048;i++){const next=(data[begin+i]||0)*supportWindow[i]+coefficient*a-b;b=a;a=next}
   peak=Math.max(peak,2*Math.sqrt(Math.max(0,a*a+b*b-coefficient*a*b))/1023.5/rms);
  }amplitudes.push(peak)}
  if(amplitudes[0]>threshold||Math.min(amplitudes[1],amplitudes[2])>threshold*1.5)return true;
 }
 return false;
}
async function loadModel(){
 if(!root.tf||!root.NoteflowPitchModel)throw new Error('The chord detection files are missing. Please open the complete downloaded app.');
 if(!modelPromise)modelPromise=(async()=>{
  const tf=root.tf;await tf.ready();
  if(typeof window!=='undefined'){try{const available=await tf.setBackend('webgl');if(!available)await tf.setBackend('cpu')}catch{await tf.setBackend('cpu')}}
  const asset=root.NoteflowPitchModel,graph=asset.graph,raw=atob(asset.weights),data=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
  return tf.loadGraphModel(tf.io.fromMemory({modelTopology:graph.modelTopology,weightSpecs:graph.weightsManifest.flatMap(g=>g.weights),weightData:data.buffer,format:graph.format,generatedBy:graph.generatedBy,convertedBy:graph.convertedBy}));
 })().catch(error=>{modelPromise=null;throw error});
 return modelPromise;
}
async function detect(data,rate,options={},progress=()=>{},cancel=()=>false){
 if(rate!==22050)throw new Error('Chord detection needs 22050 Hz audio.');
 if(!data.length||data.every(x=>Math.abs(x)<.0002))return [];
 const model=await loadModel(),tf=root.tf,windowSize=43844,hop=36164,overlap=3840,totalFrames=Math.floor(data.length*86/rate),frames=[],onsets=[];
 const windows=Math.ceil((data.length+overlap)/hop);
 for(let w=0;w<windows&&frames.length<totalFrames;w++){
  if(cancel())throw new Error('Cancelled');const samples=new Float32Array(windowSize),offset=w*hop-overlap;
  for(let i=Math.max(0,-offset);i<windowSize&&offset+i<data.length;i++)samples[i]=data[offset+i];
  let results;
  try{
   results=tf.tidy(()=>{const input=tf.tensor(samples,[1,windowSize,1]);const raw=model.execute(input,['Identity_1','Identity_2']);return raw.map(t=>t.slice([0,15,0],[1,t.shape[1]-30,t.shape[2]]).squeeze([0]))});
   const f=await results[0].array(),o=await results[1].array(),remaining=totalFrames-frames.length;frames.push(...f.slice(0,remaining));onsets.push(...o.slice(0,remaining));
  }finally{if(results)tf.dispose(results)}
  progress(Math.min(.94,(w+1)/windows*.94));await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(cancel())throw new Error('Cancelled');if(frames.length<5)return [];
 const threshold=options.sensitivity==='sensitive'?.23:options.sensitivity==='strict'?.48:.34;
 const result=root.BasicPitchNotes.noteFramesToTime(root.BasicPitchNotes.outputToNotesPoly(frames,onsets,threshold,.25,6,true,null,null,true,7));
 const proposals=result.filter(n=>n.durationSeconds>=.075&&n.amplitude>=(options.sensitivity==='strict'?.45:options.sensitivity==='sensitive'?.17:.35)).map(n=>({midi:n.pitchMidi,start:Math.max(0,n.startTimeSeconds),end:Math.min(data.length/rate,n.startTimeSeconds+n.durationSeconds),confidence:n.amplitude})).filter(n=>n.end>n.start),accepted=[];
 for(let i=0;i<proposals.length;i++){if(cancel())throw new Error('Cancelled');if(hasTonalSupport(data,rate,proposals[i],options.sensitivity))accepted.push(proposals[i]);if(i%40===0){progress(.94+i/Math.max(1,proposals.length)*.06);await new Promise(resolve=>setTimeout(resolve,0))}}
 progress(1);return accepted.sort((a,b)=>a.start-b.start||a.midi-b.midi);
}
root.NoteflowPoly={detect,loadModel};
})(globalThis);

