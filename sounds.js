// Quiet wooden taps and soft confirmation tones, created only after an interaction.
export class Sounds {
  constructor(storage) {
    this.storage = storage;
    this.enabled = true;
    try { this.enabled = storage.getItem('vocoby-sound') !== 'off'; } catch {}
  }
  toggle() {
    this.enabled = !this.enabled;
    try { this.storage.setItem('vocoby-sound', this.enabled ? 'on' : 'off'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, this.context.currentTime, 0.01);
  }
  play(kind) {
    if (!this.enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      // A fast-decaying body and a faint inharmonic overtone make a wooden tap.
      // A brief, low consonant tone confirms matches without a repeating melody.
      const notes = kind === 'select' ? [
        { frequency: 310, end: 220, volume: 0.065, attack: 0.003, duration: 0.075 },
        { frequency: 790, end: 640, volume: 0.012, attack: 0.002, duration: 0.028 },
      ] : kind === 'match' ? [
        { frequency: 330, volume: 0.022, attack: 0.018, duration: 0.16 },
        { frequency: 495, volume: 0.007, attack: 0.02, duration: 0.12 },
      ] : [
        { frequency: 196, volume: 0.025, duration: 0.18 },
        { frequency: 174.61, volume: 0.025, delay: 0.09, duration: 0.18 },
      ];
      notes.forEach(({ frequency, end, volume, attack = 0.012, delay = 0, duration }) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const start = this.context.currentTime + delay;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        if (end) oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      });
    } catch { /* Audio availability must never interrupt practice. */ }
  }
}
