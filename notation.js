
(function(root){
'use strict';
function draw(container,state,options={}){
 const N=root.NF,V=root.Vex.Flow,bars=N.measures(state.notes,state.meter),spec=N.instruments[state.instrument],grand=spec.clefs.length===2,width=Math.max(380,options.width||container.clientWidth||760),perRow=width<520?1:width<790?2:3;
 container.replaceChildren();
 for(let first=0;first<bars.length;first+=perRow){
  const row=bars.slice(first,first+perRow),yPositions=[];let y=18;
  spec.clefs.forEach((clef,staff)=>{const pitches=row.flatMap(bar=>bar.flatMap(n=>N.staffPitches(n,state.instrument,staff))),baseline=clef==='bass'?18:clef==='alto'?24:30;const steps=pitches.map(m=>{const p=N.pitch(m);return p.octave*7+'CDEFGAB'.indexOf(p.step)-baseline});const high=Math.max(0,...steps),low=Math.min(0,...steps);y+=Math.max(0,high*5-48);yPositions.push(y);y+=Math.max(126,110-low*5)});
  const height=y+12,wrap=document.createElement('div');container.append(wrap);const renderer=new V.Renderer(wrap,V.Renderer.Backends.SVG);renderer.resize(width,height);const ctx=renderer.getContext();ctx.setFillStyle('#273b34');ctx.setStrokeStyle('#273b34');ctx.setFont('Arial',12);
  const weight=row.map((bar,i)=>Math.max(4,bar.length)+(i===0?2.7:0)),sum=weight.reduce((a,b)=>a+b,0);let x=grand?16:2;const previous=spec.clefs.map(()=>null);
  row.forEach((bar,j)=>{
   const w=(width-(grand?19:5))*weight[j]/sum,staves=[],allTicks=[],voices=[];
   spec.clefs.forEach((clef,staff)=>{
    const stave=new V.Stave(x,yPositions[staff],w);if(j===0){stave.addClef(clef);if(first===0)stave.addTimeSignature(state.meter)}if(first+j===bars.length-1)stave.setEndBarType(V.Barline.type.END);stave.setContext(ctx).draw();staves.push(stave);
    const accidentals={},ticks=bar.map(n=>{const ps=N.staffPitches(n,state.instrument,staff),d=N.duration(n.beats),keys=ps.map(m=>{const p=N.pitch(m);return `${p.step.toLowerCase()}${p.alter?'#':''}/${p.octave}`});const note=new V.StaveNote({clef,keys:keys.length?keys:[clef==='bass'?'d/3':clef==='alto'?'c/4':'b/4'],duration:d[0]+(keys.length?'':'r'),auto_stem:true});if(d[2])V.Dot.buildAndAttach([note]);ps.forEach((m,k)=>{const p=N.pitch(m),id=p.step+p.octave;if(p.alter)note.addModifier(new V.Accidental('#'),k);else if(accidentals[id])note.addModifier(new V.Accidental('n'),k);accidentals[id]=p.alter});return {note,pitches:ps,segment:n}});
    allTicks.push(ticks);voices.push(new V.Voice({num_beats:N.barLength(state.meter),beat_value:4}).setMode(V.Voice.Mode.SOFT).addTickables(ticks.map(t=>t.note)));
   });
   if(grand){if(j===0)new V.StaveConnector(staves[0],staves[1]).setType(V.StaveConnector.type.BRACE).setContext(ctx).draw();new V.StaveConnector(staves[0],staves[1]).setType(V.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();new V.StaveConnector(staves[0],staves[1]).setType(V.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw()}
   ctx.setFillStyle('#748570');ctx.fillText(String(first+j+1),x+4,yPositions[0]+8);ctx.setFillStyle('#273b34');
   const formatter=new V.Formatter();voices.forEach(v=>formatter.joinVoices([v]));formatter.format(voices,Math.max(45,w-(j===0?(first===0?105:78):30)));
   voices.forEach((voice,staff)=>{
    const ticks=allTicks[staff],beams=V.Beam.generateBeams(ticks.map(t=>t.note),{groups:state.meter==='6/8'?[new V.Fraction(3,8)]:[new V.Fraction(1,4)],beam_rests:false});voice.draw(ctx,staves[staff]);beams.forEach(b=>b.setContext(ctx).draw());
    ticks.forEach((item,k)=>{
     const n=item.segment,ps=item.pitches,el=item.note.getSVGElement();if(el&&n.index>=0){el.classList.add('note-hit');el.dataset.noteIndex=n.index;el.setAttribute('aria-label',`${ps.map(N.noteName).join(', ')||'Rest'}, ${n.beats} beats`);el.addEventListener('click',()=>options.onSelect?.(n.index))}
     const tied=ps.filter(p=>n.tieFrom.includes(p)),prev=previous[staff];
     if(tied.length){const valid=tied.filter(p=>!prev||prev.pitches.includes(p));if(valid.length)new V.StaveTie({first_note:prev?.note,last_note:item.note,first_indices:valid.map(p=>prev?prev.pitches.indexOf(p):0),last_indices:valid.map(p=>ps.indexOf(p))}).setContext(ctx).draw()}
     if(k===ticks.length-1&&j===row.length-1){const to=ps.filter(p=>n.tieTo.includes(p));if(to.length)new V.StaveTie({first_note:item.note,first_indices:to.map(p=>ps.indexOf(p)),last_indices:to.map(()=>0)}).setContext(ctx).draw()}
     previous[staff]=item;
    });
   });x+=w;
  });
  const svg=wrap.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.removeAttribute('width');svg.removeAttribute('height');svg.classList.add('score-system');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${spec.name}: measures ${first+1}–${Math.min(first+perRow,bars.length)}, ${spec.description}`);
 }
 return bars.length;
}
root.NoteflowNotation={draw};
})(globalThis);

