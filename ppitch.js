
/* Adapted from the user's PPitch HTML. No network requests or microphone capture. */
(function () {
  'use strict';
  const C=window.PPitchCore, $=id=>document.getElementById('pp-'+id);
  const game=new C.Game(), take=new C.Take(), keys=new Map(), held=new Map(), physical=new Map();
  const voices=new Set(), highlights=new Map();
  let active=false, mode='challenge', audio=null, output=null, generation=0, replay=null;
  let timer=0, initialScroll=false, focusedNote='C4';
  let keyboardLayout='original', shiftHeld=false;
  try{if(window.localStorage.getItem('ppitch-keyboard-layout')==='piano')keyboardLayout='piano'}catch{}
  const now=()=>performance.now();
  const format=ms=>{const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
  const feedback=text=>{$('feedback').textContent=text};
  function stats(){
    $('correct').textContent=String(game.score); $('total').textContent=String(game.total);
    $('accuracy').textContent=game.total?Math.round(game.score/game.total*100)+'%':'—';
  }
  function showHeld(){
    const noteNames=[...new Set(held.values())].sort((a,b)=>C.midi(a)-C.midi(b));
    const chord=C.detectChord(noteNames);
    $('chord-name').textContent=chord.label; $('chord-detail').textContent=chord.detail;
    $('held-notes').textContent=noteNames.join(' · ')||'No keys held';
    for(const [note,key] of keys)key.classList.toggle('pp-down',noteNames.includes(note));
  }
  function stopVoices(){
    for(const voice of voices){try{voice.osc.stop()}catch{}try{voice.osc.disconnect();voice.gain.disconnect()}catch{}}
    voices.clear();
  }
  async function context(){
    if(!audio){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw new Error('Audio playback is unavailable in this browser.');
      audio=new Audio(); output=audio.createGain(); output.gain.value=Number($('volume').value);
      const compressor=audio.createDynamicsCompressor(); compressor.threshold.value=-12;
      compressor.knee.value=12; compressor.ratio.value=8; compressor.attack.value=.003; compressor.release.value=.15;
      output.connect(compressor); compressor.connect(audio.destination);
    }
    if(audio.state==='suspended')await audio.resume();
    if(audio.state!=='running')throw new Error('Sound is paused. Click Listen or a piano key to enable it.');
    return audio;
  }
  function tone(note,time=audio.currentTime){
    const octave=Math.floor(C.midi(note)/12)-1;
    const osc=audio.createOscillator(),gain=audio.createGain(), voice={osc,gain};
    // Preserve PPitch's triangle bass, sine treble, and 1.2-second piano-like decay.
    osc.type=octave<=3?'triangle':'sine'; osc.frequency.setValueAtTime(C.frequency(note),time);
    const boost=octave<=2?1.8:octave===3?1.4:1;
    gain.gain.setValueAtTime(.0001,time); gain.gain.linearRampToValueAtTime(boost*.15,time+.008);
    gain.gain.exponentialRampToValueAtTime(.001,time+1.18); gain.gain.linearRampToValueAtTime(0,time+1.2);
    osc.connect(gain); gain.connect(output); voices.add(voice);
    osc.onended=()=>{voices.delete(voice);osc.disconnect();gain.disconnect()};
    osc.start(time);osc.stop(time+1.2);
    if(voices.size>64){const oldest=voices.values().next().value;try{oldest.osc.stop()}catch{}voices.delete(oldest)}
  }
  function audioAction(action){
    const ticket=generation;
    return context().then(()=>{if(active&&ticket===generation)action()}).catch(error=>{if(active&&ticket===generation)feedback(error.message)});
  }
  function clearAnswer(){
    for(const key of keys.values())key.classList.remove('pp-answer','pp-wrong');
    document.querySelector('.pp-challenge').removeAttribute('data-result');
  }
  function centerOn(note){
    const key=keys.get(note),scroller=$('keyboard-scroll'); if(!key)return;
    scroller.scrollLeft=Math.max(0,key.offsetLeft-scroller.clientWidth/2+key.offsetWidth/2+16);
  }
  function refreshKeyboardHints(){
    const shortcuts=new Map();
    if(keyboardLayout==='piano'){
      for(const [code,base]of Object.entries(C.pianoKeyMap)){
        const note=C.name(C.midi(base)+(shiftHeld?24:0)),label=code.replace(/^(Key|Digit)/,'');
        shortcuts.set(note,{label,description:(shiftHeld?'Shift + ':'')+label});
      }
    }else{
      for(const [label,note]of Object.entries(C.keyMap))shortcuts.set(note,{label,description:label});
    }
    for(const [note,key]of keys){
      const hint=shortcuts.get(note);
      key.children[1].textContent=hint?.label||'';
      key.setAttribute('aria-label',note+(hint?', shortcut '+hint.description:''));
      key.classList.toggle('pp-mapped',keyboardLayout==='piano'&&!!hint);
    }
    $('keyboard-layout').value=keyboardLayout;
    $('keyboard-register').textContent=keyboardLayout==='piano'?(shiftHeld?'Shift held · C5–B6':'C3–B4 · Shift +2 octaves'):'Original · C2–B6';
    $('keyboard-register').classList.toggle('pp-shift-active',keyboardLayout==='piano'&&shiftHeld);
    $('layout-description').textContent=keyboardLayout==='piano'
      ?(shiftHeld?'Q–U: C5–B5. Z–M: C6–B6.':'Q–U: C3–B3. Z–M: C4–B4.')+' Sharps: 2, 3, 5, 6, 7 / S, D, G, H, J. Hold Shift to go up two octaves.'
      :'Original C2–B6 shortcuts. Shift plays sharps on their mapped keys.';
  }
  function updateShift(value,scroll=true){
    const next=keyboardLayout==='piano'&&!!value;
    if(shiftHeld===next)return;
    shiftHeld=next;refreshKeyboardHints();
    if(scroll&&active)centerOn(shiftHeld?'C6':'C4');
  }
  function setKeyboardLayout(){
    const value=$('keyboard-layout').value;
    if(take.recording||replay||!['original','piano'].includes(value)){$('keyboard-layout').value=keyboardLayout;return}
    stopAll();keyboardLayout=value;shiftHeld=false;refreshKeyboardHints();centerOn('C4');
    try{window.localStorage.setItem('ppitch-keyboard-layout',keyboardLayout)}catch{}
  }
  function revealResult(result){
    if(!result)return;
    keys.get(result.answer)?.classList.add('pp-answer');
    if(result.guess&&!result.correct)keys.get(result.guess)?.classList.add('pp-wrong');
    $('target-symbol').textContent=result.answer;
    $('prompt').textContent=result.revealed?'Answer revealed':result.correct?'You found it.':'Keep listening.';
    $('round-state').textContent=result.revealed?'Unscored':result.correct?'Correct':'Try the next note';
    feedback(result.revealed?'The target is '+result.answer+'. This round is unscored.':result.correct?'Exactly right: '+result.answer+'. Ready for another?':'You chose '+result.guess+'. The target was '+result.answer+'. Replay it to hear the difference.');
    document.querySelector('.pp-challenge').dataset.result=result.revealed?'revealed':result.correct?'correct':'wrong';
    $('reveal').disabled=true; stats();centerOn(result.answer);
  }
  function showRound(){
    clearAnswer();$('target-symbol').textContent=mode==='free'?'♪':'?';
    $('prompt').textContent=mode==='free'?'Make room to explore.':'Can you find this note?';
    $('round-label').textContent=mode==='free'?'FREE PLAY':'PITCH CHALLENGE';
    $('round-state').textContent=mode==='free'?'No scoring':'Ready to listen';
    feedback(mode==='free'?'Play notes and hold chords on the piano. Your session score stays as it is.':'Play the target, then choose its exact note and octave on the piano.');
    $('listen-label').textContent='Listen to target';$('reveal').disabled=mode==='free';
    for(const id of ['listen','next'])$(id).disabled=mode==='free'||take.recording||!!replay;
    $('challenge-foot').textContent=mode==='free'?'Explore Major, Minor, seventh, suspended, diminished, and augmented chords.':'Your first guess counts. Revealing an answer is unscored.';
  }
  function release(token){if(held.delete(token))showHeld()}
  function releaseAll(){held.clear();physical.clear();showHeld()}
  function press(note,token){
    if(!active||held.has(token))return;
    if(replay)stopAll(false);
    held.set(token,note);showHeld();
    const wasRecording=take.recording;
    if(wasRecording){
      if(!take.add(note,now())){stopRecording('Recording limit reached. Your take is ready.');}
      else updateTake();
    }
    audioAction(()=>{
      tone(note);
      if(mode==='challenge'&&!wasRecording)revealResult(game.guess(note));
    });
  }
  function listen(){
    if(mode!=='challenge'||take.recording||replay)return;
    generation++;stopVoices();releaseAll();
    audioAction(()=>{
      tone(game.listen());$('listen-label').textContent='Repeat target';
      if(!game.resolved){$('round-state').textContent='Your turn';feedback('Find the matching note and octave on the piano. Listen again whenever you need.');}
    });
  }
  function next(){if(take.recording||replay)return;stopAll(false);game.next($('range').value);showRound();listen()}
  function updateTake(){
    const running=take.recording||!!replay;
    $('recording-badge').hidden=!take.recording;
    $('record').disabled=take.recording||!!replay;
    $('stop').disabled=!running&&voices.size===0;
    $('play-take').disabled=take.recording||!!replay||!take.events.length;
    $('range').disabled=running||mode==='free';
    $('keyboard-layout').disabled=running;
    for(const id of ['listen','next'])$(id).disabled=running||mode==='free';
    $('reveal').disabled=running||mode==='free'||game.resolved;
    $('take-time').textContent=format(take.recording?now()-take.started:replay?(audio.currentTime-replay.start)*1000:take.duration);
  }
  function stopRecording(message){
    take.stop(now());clearInterval(timer);timer=0;
    $('take-status').textContent=message|| (take.events.length?take.events.length+' notes captured · '+format(take.duration)+' · ready to play':'No notes recorded. Start a take and play the piano.');
    updateTake();
  }
  function clearReplay(){
    if(replay)cancelAnimationFrame(replay.raf);replay=null;
    for(const key of keys.values())key.classList.remove('pp-replaying');highlights.clear();
  }
  function stopAll(endRecording=true){
    generation++;stopVoices();releaseAll();const wasReplaying=!!replay;clearReplay();
    if(endRecording&&take.recording)stopRecording();
    if(wasReplaying)$('take-status').textContent='Playback stopped · '+take.events.length+' notes in your take';
    updateTake();
  }
  function recordTake(){
    if(take.recording||replay)return;
    stopAll(false);
    audioAction(()=>{
      take.start(now());$('take-status').textContent='Recording piano keys · challenge scoring is paused';
      updateTake();timer=setInterval(()=>{if(now()-take.started>=120000)stopRecording('Two-minute limit reached. Your take is ready.');else updateTake()},100);
    });
  }
  function replayFrame(){
    if(!replay||!active)return;
    const r=replay,t=audio.currentTime-r.start;
    while(r.index<take.events.length&&take.events[r.index].time/1000<t+.12){
      const e=take.events[r.index++];tone(e.note,Math.max(audio.currentTime,r.start+e.time/1000));
    }
    while(r.visual<take.events.length&&take.events[r.visual].time/1000<=t){
      const e=take.events[r.visual++];keys.get(e.note).classList.add('pp-replaying');highlights.set(e.note,e.time/1000+.5);
    }
    for(const [note,end]of highlights)if(t>end){keys.get(note).classList.remove('pp-replaying');highlights.delete(note)}
    if(t>=r.duration){clearReplay();$('take-status').textContent='Playback complete · '+take.events.length+' notes';updateTake();return;}
    updateTake();r.raf=requestAnimationFrame(replayFrame);
  }
  function playTake(){
    if(!take.events.length||take.recording||replay)return;
    stopAll(false);
    audioAction(()=>{
      replay={start:audio.currentTime+.05,index:0,visual:0,raf:0,duration:Math.max(take.duration/1000,take.events.at(-1).time/1000+1.2)};
      $('take-status').textContent='Playing your take · '+take.events.length+' notes';updateTake();replayFrame();
    });
  }
  function setMode(value){
    if(mode===value)return;stopAll();mode=value;game.next($('range').value);
    $('challenge-mode').setAttribute('aria-pressed',String(mode==='challenge'));$('free-mode').setAttribute('aria-pressed',String(mode==='free'));
    showRound();updateTake();
  }
  function createKeyboard(){
    const shortcuts=Object.fromEntries(Object.entries(C.keyMap).map(([key,note])=>[note,key]));
    for(let m=24;m<=108;m++){
      const note=C.name(m),key=document.createElement('button');
      key.type='button';key.className='pp-key '+(note.includes('#')?'pp-black':'pp-white')+(m%12===0?' pp-octave':'');
      key.dataset.note=note;key.tabIndex=note==='C4'?0:-1;
      const label=document.createElement('span');label.className='pp-note-label';label.textContent=note;
      const shortcut=document.createElement('span');shortcut.className='pp-key-hint';shortcut.textContent=shortcuts[note]||'';
      label.setAttribute('aria-hidden','true');shortcut.setAttribute('aria-hidden','true');
      key.setAttribute('aria-label',note+(shortcuts[note]?', shortcut '+shortcuts[note]:''));key.append(label,shortcut);
      key.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;event.preventDefault();
        try{key.setPointerCapture(event.pointerId)}catch{}press(note,'pointer:'+event.pointerId);
      });
      for(const type of ['pointerup','pointercancel','lostpointercapture'])key.addEventListener(type,event=>release('pointer:'+event.pointerId));
      key.addEventListener('click',event=>{if(event.detail===0&&!held.has('accessible:'+note)){press(note,'accessible:'+note);setTimeout(()=>release('accessible:'+note),250)}});
      key.addEventListener('focus',()=>{keys.get(focusedNote)?.setAttribute('tabindex','-1');focusedNote=note;key.tabIndex=0});
      key.addEventListener('keydown',event=>{
        if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
          event.preventDefault();const to=event.key==='Home'?24:event.key==='End'?108:Math.max(24,Math.min(108,m+(event.key==='ArrowLeft'?-1:1)));
          keys.get(C.name(to)).focus();return;
        }
        if(event.code==='Space'||event.key==='Enter'){event.preventDefault();if(!event.repeat)press(note,'accessible:'+note)}
      });
      key.addEventListener('keyup',event=>{if(event.code==='Space'||event.key==='Enter'){event.preventDefault();release('accessible:'+note)}});
      key.addEventListener('blur',()=>release('accessible:'+note));
      keys.set(note,key);$('keyboard').append(key);
    }
  }
  document.addEventListener('keydown',event=>{
    if(!active||document.querySelector('dialog[open]')||event.ctrlKey||event.altKey||event.metaKey||event.isComposing)return;
    if(event.target.closest('input,select,textarea,[contenteditable="true"]'))return;
    updateShift(event.shiftKey);
    const note=C.keyboardNote(keyboardLayout,event);
    if(note){
      event.preventDefault();if(event.repeat||physical.has(event.code))return;
      const token='key:'+event.code;physical.set(event.code,token);press(note,token);
    }else if(event.code==='Space'&&!event.target.closest('button,summary,a')){event.preventDefault();if(!event.repeat)listen();}
  });
  document.addEventListener('keyup',event=>{const token=physical.get(event.code);if(token){physical.delete(event.code);release(token)}if(active)updateShift(event.shiftKey)});
  window.addEventListener('blur',()=>{if(active){stopAll();updateShift(false)}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){stopAll();updateShift(false,false)}});
  window.addEventListener('beforeunload',()=>{stopAll();audio?.close()});
  $('listen').onclick=listen;$('next').onclick=next;$('reveal').onclick=()=>{if(!take.recording&&!replay&&mode==='challenge')revealResult(game.reveal())};
  $('challenge-mode').onclick=()=>setMode('challenge');$('free-mode').onclick=()=>setMode('free');
  $('reset').onclick=()=>{stopAll();game.reset();stats();showRound();updateTake()};
  $('range').onchange=()=>{stopAll();game.next($('range').value);showRound();updateTake()};
  $('keyboard-layout').onchange=setKeyboardLayout;
  $('volume').oninput=()=>{$('volume-label').textContent=Math.round(Number($('volume').value)*100)+'%';if(output)output.gain.setTargetAtTime(Number($('volume').value),audio.currentTime,.02)};
  $('record').onclick=recordTake;$('stop').onclick=()=>stopAll();$('play-take').onclick=playTake;
  $('lower').onclick=()=>$('keyboard-scroll').scrollBy({left:-336,behavior:'auto'});
  $('higher').onclick=()=>$('keyboard-scroll').scrollBy({left:336,behavior:'auto'});
  $('middle').onclick=()=>centerOn('C4');
  createKeyboard();refreshKeyboardHints();showRound();stats();updateTake();
  window.PPitch={
    activate(){active=true;if(!initialScroll){centerOn('C4');initialScroll=true;}updateTake()},
    deactivate(){active=false;stopAll();updateShift(false,false);if(keyboardLayout==='piano')initialScroll=false},
    pause(){stopAll();updateShift(false)}
  };
})();

