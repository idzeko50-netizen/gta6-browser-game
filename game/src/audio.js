// Procedural WebAudio sound: every effect is synthesised, no audio files.
// The engine hum, the police siren and the bassline run as live oscillators;
// one-shots (gunshot, punch, pickup, cash, crash) are short envelopes.
// Nothing is created until the first user gesture calls unlock().

const BASSLINE = [55, 0, 55, 65.41, 55, 0, 49, 58.27]; // A1 C2 E2 G1 pattern, 0 = rest
const BASS_STEP = 0.24; // seconds per step

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let bassTimer = 0;
  let bassStep = 0;
  let bassOsc = null;
  let bassGain = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine hum: a sawtooth whose pitch follows speed, kept very quiet.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Police siren: a sine that wobbles between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      // Bassline voice: a triangle through a lowpass, one note per step.
      bassOsc = ctx.createOscillator();
      bassOsc.type = 'triangle';
      bassGain = ctx.createGain();
      bassGain.gain.value = 0;
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.value = 500;
      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(master);
      bassOsc.start();
    } catch {
      ctx = null; // Audio unavailable: the game stays silent, never crashes.
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      noise(0.12, 0.5, 2600);
      blip(190, 0.08, 'square', 0.22, 70);
    },
    punch() {
      noise(0.09, 0.35, 500);
      blip(90, 0.1, 'sine', 0.4, 45);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.3);
      setTimeout(() => blip(990, 0.12, 'sine', 0.3), 70);
    },
    cash() {
      blip(880, 0.1, 'triangle', 0.3);
      setTimeout(() => blip(1174, 0.14, 'triangle', 0.3), 90);
    },
    crash() {
      noise(0.25, 0.5, 900);
    },
    busted() {
      blip(392, 0.3, 'sawtooth', 0.25, 311);
      setTimeout(() => blip(311, 0.5, 'sawtooth', 0.25, 233), 300);
    },
    wasted() {
      blip(220, 0.4, 'sawtooth', 0.3, 110);
      setTimeout(() => blip(165, 0.8, 'sawtooth', 0.3, 82), 400);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.3), i * 110));
    },
    // Called every frame with the live state: engine pitch, siren presence, bassline.
    update(dt, speedRatio, wanted) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (engineGain) {
        engineGain.gain.setTargetAtTime(speedRatio > 0.03 ? 0.05 + speedRatio * 0.05 : 0, t, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + speedRatio * 130, t, 0.1);
      }
      if (sirenGain) sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.045 : 0, t, 0.3);
      bassTimer += dt;
      while (bassTimer >= BASS_STEP) {
        bassTimer -= BASS_STEP;
        const note = BASSLINE[bassStep % BASSLINE.length];
        bassStep += 1;
        if (note > 0 && bassOsc) {
          bassOsc.frequency.setValueAtTime(note, ctx.currentTime);
          bassGain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.01);
          bassGain.gain.setTargetAtTime(0.0, ctx.currentTime + BASS_STEP * 0.9, 0.05);
        }
      }
    },
  };
}
