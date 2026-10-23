import { clamp } from "./math";
import type { Settings } from "./save";
/** 全部声音为原创 Web Audio 合成。单次声部有上限，每个节点都在尾音后断开。 */
export class AudioSystem {
  context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private voices = 0;
  private musicTimer = 0;
  private chord = 0;
  private lastAlarm = -10;
  constructor(public settings: Settings) {}
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.settings.effects * 0.22;
      this.master.connect(this.context.destination);
      this.music = this.context.createGain();
      this.music.gain.value = this.settings.music * 0.11;
      this.music.connect(this.context.destination);
      this.engine = this.context.createOscillator();
      this.engine.type = "sawtooth";
      this.engine.frequency.value = 40;
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 150;
      this.engine.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engine.start();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }
  volumes() {
    if (this.master && this.music) {
      this.master.gain.value = this.settings.effects * 0.22;
      this.music.gain.value = this.settings.music * 0.11;
    }
  }
  private tone(
    freq: number,
    end: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.5,
    destination = this.master,
  ) {
    const c = this.context;
    if (!c || !destination || c.state !== "running" || this.voices > 30) return;
    this.voices++;
    const o = c.createOscillator(),
      gain = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(15, end),
      c.currentTime + duration,
    );
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(volume, c.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(gain);
    gain.connect(destination);
    o.start();
    o.stop(c.currentTime + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      gain.disconnect();
      this.voices--;
    };
  }
  private noise(duration: number, volume: number, cutoff: number) {
    const c = this.context;
    if (!c || !this.master || this.voices > 30 || c.state !== "running") return;
    this.voices++;
    const buffer = c.createBuffer(
        1,
        Math.ceil(c.sampleRate * duration),
        c.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    src.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.voices--;
    };
  }
  play(name: string, volume = 1) {
    switch (name) {
      case "shell":
        this.tone(100, 30, 0.25, "triangle", volume);
        this.noise(0.18, volume * 0.6, 1200);
        break;
      case "twin":
        this.tone(180, 60, 0.07, "square", volume * 0.4);
        this.noise(0.06, volume * 0.3, 1900);
        break;
      case "rail":
        this.tone(1100, 90, 0.3, "sawtooth", volume * 0.6);
        this.noise(0.16, volume * 0.3, 2500);
        break;
      case "scatter":
        this.noise(0.27, volume, 1800);
        this.tone(110, 30, 0.2, "triangle", volume);
        break;
      case "missile":
        this.noise(0.4, volume * 0.5, 850);
        this.tone(160, 310, 0.25, "sawtooth", volume * 0.3);
        break;
      case "arc":
      case "emp":
        this.tone(900, 110, 0.28, "sawtooth", volume * 0.45);
        this.tone(1330, 230, 0.24, "sine", volume * 0.3);
        break;
      case "explosion":
        this.noise(0.6, volume * 0.9, 600);
        this.tone(85, 22, 0.5, "triangle", volume);
        break;
      case "wall":
      case "impact":
        this.noise(0.12, volume * 0.65, 1800);
        this.tone(290, 80, 0.1, "triangle", volume * 0.25);
        break;
      case "shield":
        this.tone(560, 260, 0.18, "sine", volume * 0.4);
        break;
      case "break":
        this.noise(0.3, 0.6, 2800);
        this.tone(870, 90, 0.4, "sawtooth", 0.3);
        break;
      case "hurt":
        this.tone(110, 60, 0.18, "square", volume * 0.4);
        break;
      case "wave":
      case "boss":
      case "phase":
        this.tone(130, 130, 0.8, "sawtooth", 0.4);
        this.tone(195, 260, 0.9, "triangle", 0.4);
        break;
      case "charge":
        this.tone(80, 1200, 1.8, "sawtooth", volume * 0.35);
        break;
      case "alarm":
        if (this.context && this.context.currentTime - this.lastAlarm > 2) {
          this.lastAlarm = this.context.currentTime;
          this.tone(440, 330, 0.45, "square", volume * 0.4);
        }
        break;
      case "victory":
        [220, 277, 330, 440].forEach((f, i) =>
          this.tone(f, f, 0.9 + i * 0.3, "triangle", 0.35),
        );
        break;
      case "repair":
      case "drone":
        this.tone(330, 660, 0.45, "sine", 0.45);
        break;
      case "dash":
      case "smoke":
        this.noise(0.3, 0.4, 1300);
        break;
      case "strike":
      case "artillery":
        this.tone(660, 330, 0.22, "triangle", volume * 0.4);
        break;
      default:
        this.tone(name === "purchase" ? 660 : 440, 880, 0.12, "sine", 0.35);
    }
  }
  update(dt: number, speed: number, active: boolean, biome = 0) {
    if (!this.context || this.context.state !== "running") return;
    if (this.engine && this.engineGain) {
      this.engine.frequency.setTargetAtTime(
        36 + clamp(speed, 0, 23) * 4,
        this.context.currentTime,
        0.1,
      );
      this.engineGain.gain.setTargetAtTime(
        active ? 0.04 + speed * 0.012 : 0,
        this.context.currentTime,
        0.1,
      );
    }
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && this.settings.music > 0) {
      this.musicTimer = 2.4;
      const root = [73.42, 65.41, 82.41, 55][Math.floor(this.chord++ / 4) % 4];
      this.tone(root, root, 3, "sine", 0.3, this.music);
      this.tone(root * 1.5, root * 1.5, 2.7, "triangle", 0.08, this.music);
      if (biome === 2)
        this.tone(root * 8, root * 8, 2, "sine", 0.04, this.music);
      if (active && biome === 1) this.noise(0.7, 0.015, 450);
    }
  }
  async pause() {
    if (this.context?.state === "running") await this.context.suspend();
  }
  async resume() {
    if (this.context?.state === "suspended") await this.context.resume();
  }
}
