// The Gilded Hour — sound, synthesized, no audio files. A tiny Web Audio
// helper: one oscillator per blip, a short envelope, nothing else. The context
// is created on the first user gesture (browsers forbid it before that), and
// every call is a no-op until then, so headless screenshot runs stay silent.
let ctx = null;
let muted = false;

export function ensureAudio() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(value) {
  muted = value;
}

function tone(freq, dur, type = 'sine', gain = 0.08, slideTo = null) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export const sfx = {
  pickup() { tone(880, 0.09, 'sine', 0.09); tone(1320, 0.12, 'sine', 0.06); },
  mainLoot() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.09), i * 70)); },
  marble() { tone(1900, 0.05, 'square', 0.04); setTimeout(() => tone(1500, 0.05, 'square', 0.03), 90); },
  clink() { tone(2400, 0.07, 'square', 0.05); tone(1800, 0.09, 'square', 0.04); },
  emp() { tone(320, 0.35, 'sawtooth', 0.07, 60); },
  vent() { tone(220, 0.18, 'sine', 0.06, 440); },
  spotted() { tone(220, 0.14, 'square', 0.06); tone(233, 0.14, 'square', 0.06); },
  caught() { tone(160, 0.5, 'sawtooth', 0.1, 55); },
  unlock() { tone(660, 0.1, 'triangle', 0.08); tone(990, 0.14, 'triangle', 0.08); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.09), i * 90)); },
};
