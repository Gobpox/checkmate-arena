// CHECKMATE ARENA — all sound is synthesized with WebAudio: no audio files, so
// the game stays fully offline and every sound is original. A small step
// sequencer plays a dark synthwave loop (bass pulse + minor arpeggio + hats);
// one-shot voices play the effects. Volumes come from the settings screen.
export function createAudio() {
  let ctx = null, musicGain = null, sfxGain = null, musicTimer = null, step = 0;
  const vol = { music: 0.45, sfx: 0.7 };

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      musicGain = ctx.createGain(); musicGain.gain.value = vol.music * 0.5; musicGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = vol.sfx; sfxGain.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function tone({ freq = 440, freq2 = null, type = 'square', dur = 0.12, gain = 0.2, dest = null, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.2, gain = 0.25, freq = 1200, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t);
  }

  // The loop: A minor, 8 steps a bar at 112 BPM — bass on the beat, a sparse
  // arpeggio above it, a noise hat on the off steps.
  const BASS = [55, 0, 55, 55, 0, 55, 0, 65.4];
  const ARP = [220, 261.6, 329.6, 440, 329.6, 261.6, 220, 164.8];
  function scheduleStep() {
    if (!ctx) return;
    const s = step % 8;
    if (BASS[s]) tone({ freq: BASS[s], type: 'sawtooth', dur: 0.22, gain: 0.5, dest: musicGain });
    if (step % 2 === 0) tone({ freq: ARP[s], type: 'triangle', dur: 0.16, gain: 0.16, dest: musicGain });
    if (step % 2 === 1) noiseHat();
    step++;
  }
  function noiseHat() {
    const t = ctx.currentTime, len = (0.03 * ctx.sampleRate) | 0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(musicGain); src.start(t);
  }

  return {
    unlock() { if (ensure() && !musicTimer) { scheduleStep(); musicTimer = setInterval(scheduleStep, 268); } },
    setMusic(v) { vol.music = v; if (musicGain) musicGain.gain.value = v * 0.5; },
    setSfx(v) { vol.sfx = v; if (sfxGain) sfxGain.gain.value = v; },
    shoot(kind) {
      if (!ctx) return;
      if (kind === 'laser') tone({ freq: 1180, freq2: 620, type: 'square', dur: 0.06, gain: 0.10 });
      else if (kind === 'shotgun') { noise({ dur: 0.14, gain: 0.22, freq: 900 }); tone({ freq: 160, freq2: 60, dur: 0.12, gain: 0.2 }); }
      else if (kind === 'railgun') tone({ freq: 240, freq2: 1900, type: 'sawtooth', dur: 0.16, gain: 0.2 });
      else if (kind === 'launcher') tone({ freq: 300, freq2: 90, type: 'square', dur: 0.18, gain: 0.2 });
      else tone({ freq: 840, freq2: 340, type: 'square', dur: 0.07, gain: 0.13 });
    },
    hit() { if (ctx) tone({ freq: 200, freq2: 140, type: 'triangle', dur: 0.05, gain: 0.12 }); },
    explode(big = false) { if (ctx) { noise({ dur: big ? 0.5 : 0.25, gain: big ? 0.5 : 0.28, freq: big ? 700 : 1100 }); tone({ freq: big ? 120 : 160, freq2: 40, dur: big ? 0.4 : 0.2, gain: 0.3 }); } },
    step() { if (ctx) tone({ freq: 90, type: 'sine', dur: 0.07, gain: 0.10 }); },
    hurt() { if (ctx) { tone({ freq: 300, freq2: 70, type: 'sawtooth', dur: 0.22, gain: 0.3 }); noise({ dur: 0.15, gain: 0.2, freq: 800 }); } },
    dash() { if (ctx) noise({ dur: 0.12, gain: 0.12, freq: 2400 }); },
    gem() { if (ctx) tone({ freq: 1320, freq2: 1760, type: 'sine', dur: 0.07, gain: 0.08 }); },
    levelup() { if (!ctx) return; [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.2, when: i * 0.07 })); },
    boss() { if (!ctx) return; [98, 98, 147, 98, 196].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.3, gain: 0.3, when: i * 0.17 })); noise({ dur: 0.8, gain: 0.15, freq: 400 }); },
    gameover() { if (!ctx) return; [392, 370, 349, 311].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.34, gain: 0.24, when: i * 0.22 })); },
    waveclear() { if (!ctx) return; [659, 784, 988].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.14, gain: 0.16, when: i * 0.06 })); },
  };
}
