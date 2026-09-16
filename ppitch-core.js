
/* PPitch's original note game, shortcut map and chord vocabulary, with pure helpers. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PPitchCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const keyMap = {
    '1':'C2','!':'C#2','2':'D2','@':'D#2','3':'E2','4':'F2','$':'F#2','5':'G2','%':'G#2','6':'A2','^':'A#2','7':'B2',
    '8':'C3','*':'C#3','9':'D3','(':'D#3','0':'E3','q':'F3','Q':'F#3','w':'G3','W':'G#3','e':'A3','E':'A#3','r':'B3',
    't':'C4','T':'C#4','y':'D4','Y':'D#4','u':'E4','i':'F4','I':'F#4','o':'G4','O':'G#4','p':'A4','P':'A#4','a':'B4',
    's':'C5','S':'C#5','d':'D5','D':'D#5','f':'E5','g':'F5','G':'F#5','h':'G5','H':'G#5','j':'A5','J':'A#5','k':'B5',
    'z':'C6','Z':'C#6','x':'D6','X':'D#6','c':'E6','v':'F6','V':'F#6','b':'G6','B':'G#6','n':'A6','N':'A#6','m':'B6'
  };
  // Two QWERTY piano rows. Physical codes keep Shift and Caps Lock predictable.
  const pianoKeyMap = {
    KeyQ:'C3',Digit2:'C#3',KeyW:'D3',Digit3:'D#3',KeyE:'E3',KeyR:'F3',Digit5:'F#3',KeyT:'G3',Digit6:'G#3',KeyY:'A3',Digit7:'A#3',KeyU:'B3',
    KeyZ:'C4',KeyS:'C#4',KeyX:'D4',KeyD:'D#4',KeyC:'E4',KeyV:'F4',KeyG:'F#4',KeyB:'G4',KeyH:'G#4',KeyN:'A4',KeyJ:'A#4',KeyM:'B4'
  };
  function keyboardNote(layout, event) {
    const map=layout==='piano'?pianoKeyMap:keyMap, key=layout==='piano'?event.code:event.key;
    if(!Object.prototype.hasOwnProperty.call(map,key))return null;
    const note=map[key];
    return layout==='piano'&&event.shiftKey?name(midi(note)+24):note;
  }
  const chords = {
    '0,4,7':'Major', '0,3,7':'Minor', '0,4,7,10':'7th', '0,3,7,10':'m7',
    '0,4,7,11':'Maj7', '0,2,7':'sus2', '0,5,7':'sus4', '0,3,6':'dim', '0,4,8':'aug'
  };
  const ranges = { full:[24,108], middle:[60,71], central:[48,83], low:[24,47], high:[84,108] };
  function midi(note) {
    const match = /^([A-G]#?)([1-8])$/.exec(String(note));
    if (!match || !notes.includes(match[1])) throw new Error('Invalid PPitch note');
    const value = (Number(match[2]) + 1) * 12 + notes.indexOf(match[1]);
    if (value < 24 || value > 108) throw new Error('Note outside C1–C8');
    return value;
  }
  function name(value) {
    if (!Number.isInteger(value) || value < 24 || value > 108) throw new Error('Note outside C1–C8');
    return notes[value % 12] + (Math.floor(value / 12) - 1);
  }
  const frequency = note => 440 * 2 ** ((midi(note) - 69) / 12);
  function target(range = 'full', random = Math.random) {
    const [low, high] = ranges[range] || ranges.full;
    const n = Math.max(0, Math.min(.9999999999, random()));
    return name(low + Math.floor(n * (high - low + 1)));
  }
  function detectChord(held) {
    const values = [...new Set([...held].map(midi))].sort((a,b) => a-b);
    if (!values.length) return { label:'Play a chord', detail:'Hold two or more keys to explore.' };
    if (values.length === 1) return { label:name(values[0]), detail:'One note · add more keys for a chord.' };
    const classes = [...new Set(values.map(v => v % 12))];
    const bass = values[0] % 12;
    for (const root of classes) {
      const signature = classes.map(v => (v-root+12)%12).sort((a,b)=>a-b).join(',');
      if (chords[signature]) return {
        label: notes[root] + ' ' + chords[signature] + (root === bass ? '' : ' / ' + notes[bass]),
        detail: root === bass ? 'Root position' : notes[bass] + ' in the bass'
      };
    }
    return { label:classes.map(v=>notes[v]).join(' · '), detail:'Notes held · no matching chord name' };
  }
  class Game {
    constructor(random = Math.random) { this.random=random; this.score=0; this.total=0; this.range='full'; this.next(); }
    next(range = this.range) { this.range=range; this.note=target(range,this.random); this.resolved=false; this.heard=false; this.result=null; return this.note; }
    listen() { this.heard=true; return this.note; }
    guess(note) {
      midi(note);
      if (!this.heard || this.resolved) return null;
      this.total++; const correct=note===this.note; if(correct)this.score++;
      this.resolved=true; return this.result={correct,answer:this.note,guess:note,revealed:false};
    }
    reveal() { if(this.resolved)return this.result; this.resolved=true; return this.result={answer:this.note,revealed:true}; }
    reset() { this.score=0; this.total=0; this.next(); }
  }
  class Take {
    constructor() { this.events=[]; this.recording=false; this.duration=0; this.started=0; }
    start(now) { this.events=[]; this.duration=0; this.started=now; this.recording=true; }
    add(note,now) {
      if(!this.recording)return false;
      midi(note); const time=Math.max(0,now-this.started);
      if(time>=120000 || this.events.length>=2000){this.stop(now);return false;}
      this.events.push({note,time}); return true;
    }
    stop(now) { if(this.recording)this.duration=Math.min(120000,Math.max(0,now-this.started)); this.recording=false; }
  }
  return {notes,keyMap,pianoKeyMap,keyboardNote,chords,ranges,midi,name,frequency,target,detectChord,Game,Take};
});

