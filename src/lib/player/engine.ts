export type TransportStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type TransportSnap = {
  status: TransportStatus;
  currentId: string | null;
  currentTime: number;
  duration: number;
  error: string | null;
  recording: boolean;
  recordSeconds: number;
  canRecord: boolean;
};

export type Playable = { id: string; videoUrl: string; duration: number };

const IDLE: TransportSnap = {
  status: "idle",
  currentId: null,
  currentTime: 0,
  duration: 0,
  error: null,
  recording: false,
  recordSeconds: 0,
  canRecord: false,
};

const LEVELS = () => Array.from({ length: 12 }, () => 0);

function mimeChoice(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

class PlayerEngine {
  audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private tap: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private listeners = new Set<() => void>();
  private levelListeners = new Set<() => void>();
  private snap: TransportSnap = IDLE;
  private levels = LEVELS();
  private volume = 0.9;
  private muted = false;
  private pendingRecord = false;
  private maxHeard = 0;
  private reported = false;
  private natural = false;
  private spinId: string | null = null;
  private recordStarted = 0;
  private lastRecordEmit = 0;
  private raf = 0;
  private recordMime = "audio/webm";

  onEnded: ((id: string) => void) | null = null;
  onSpin: ((id: string) => void) | null = null;
  onHeard: ((id: string, seconds: number, natural: boolean) => void) | null = null;
  onRecording: ((blob: Blob, mime: string) => void) | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  subscribeLevels = (fn: () => void) => {
    this.levelListeners.add(fn);
    return () => this.levelListeners.delete(fn);
  };

  getSnapshot = () => this.snap;
  getLevels = () => this.levels;

  private emit() {
    const audio = this.audio;
    this.snap = {
      status: this.snap.status,
      currentId: this.snap.currentId,
      currentTime: audio?.currentTime || 0,
      duration:
        audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : this.snap.duration,
      error: this.snap.error,
      recording: this.recorder?.state === "recording",
      recordSeconds:
        this.recorder?.state === "recording"
          ? (performance.now() - this.recordStarted) / 1000
          : 0,
      canRecord: typeof MediaRecorder !== "undefined",
    };
    for (const fn of this.listeners) fn();
  }

  private setStatus(status: TransportStatus, error: string | null = null) {
    this.snap = { ...this.snap, status, error };
    this.emit();
  }

  private reportHeard() {
    const id = this.snap.currentId;
    if (this.reported || !id) return;
    this.reported = true;
    this.onHeard?.(id, this.maxHeard, this.natural);
  }

  private ensureAudio() {
    if (this.audio) return this.audio;
    if (typeof window === "undefined") throw new Error("Player is browser-only.");
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.addEventListener("timeupdate", () => {
      this.maxHeard = Math.max(this.maxHeard, audio.currentTime || 0);
      this.emit();
    });
    audio.addEventListener("durationchange", () => this.emit());
    audio.addEventListener("playing", () => {
      this.snap = { ...this.snap, status: "playing", error: null };
      const id = this.snap.currentId;
      if (id && this.spinId !== id) {
        this.spinId = id;
        this.onSpin?.(id);
      }
      this.emit();
      if (this.pendingRecord) {
        this.pendingRecord = false;
        this.beginRecorder();
      }
    });
    audio.addEventListener("pause", () => {
      if (!audio.ended && this.snap.status !== "idle" && this.snap.status !== "error") {
        this.snap = { ...this.snap, status: "paused" };
        this.emit();
      }
    });
    audio.addEventListener("waiting", () => {
      if (this.snap.status === "playing") {
        this.snap = { ...this.snap, status: "loading" };
        this.emit();
      }
    });
    audio.addEventListener("error", () => {
      this.pendingRecord = false;
      this.finishRecorder();
      this.setStatus(
        "error",
        "This track didn't load. The video file may be missing or blocked.",
      );
    });
    audio.addEventListener("ended", () => {
      const id = this.snap.currentId;
      this.natural = true;
      if (this.recorder?.state === "recording") this.finishRecorder();
      this.reportHeard();
      this.snap = { ...this.snap, status: "paused", currentTime: audio.duration || this.snap.currentTime };
      this.emit();
      if (id) this.onEnded?.(id);
    });
    this.audio = audio;
    this.snap = { ...this.snap, canRecord: typeof MediaRecorder !== "undefined" };
    return audio;
  }

  private ensureGraph() {
    const audio = this.ensureAudio();
    if (this.ctx) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : this.volume;
    const tap = ctx.createMediaStreamDestination();
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    gain.connect(tap);
    this.ctx = ctx;
    this.gain = gain;
    this.analyser = analyser;
    this.tap = tap;
    const tick = () => {
      this.raf = window.requestAnimationFrame(tick);
      if (!this.analyser) return;
      const playing = this.snap.status === "playing";
      const bins = new Uint8Array(this.analyser.frequencyBinCount);
      if (playing) this.analyser.getByteFrequencyData(bins);
      const next: number[] = [];
      const step = Math.max(1, Math.floor(bins.length / 12));
      for (let index = 0; index < 12; index += 1) {
        let sum = 0;
        for (let offset = 0; offset < step; offset += 1) {
          sum += bins[index * step + offset] ?? 0;
        }
        const value = playing ? sum / step / 255 : 0;
        const prev = this.levels[index] ?? 0;
        next.push(playing ? prev * 0.35 + value * 0.65 : prev * 0.72);
      }
      this.levels = next;
      for (const fn of this.levelListeners) fn();
      if (this.recorder?.state === "recording" && performance.now() - this.lastRecordEmit > 400) {
        this.lastRecordEmit = performance.now();
        this.emit();
      }
    };
    this.raf = window.requestAnimationFrame(tick);
  }

  async resume() {
    this.ensureGraph();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.gain && !this.muted) this.gain.gain.value = this.volume;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : this.volume;
  }

  async playTrack(track: Playable, opts?: { record?: boolean }) {
    this.ensureGraph();
    await this.resume();
    const audio = this.ensureAudio();
    this.natural = false;
    this.reportHeard();
    this.finishRecorder();
    this.pendingRecord = Boolean(opts?.record);
    this.reported = false;
    this.maxHeard = 0;
    this.natural = false;
    this.spinId = null;
    this.snap = {
      ...this.snap,
      status: "loading",
      error: null,
      currentId: track.id,
      currentTime: 0,
      duration: track.duration || 0,
      recording: false,
      recordSeconds: 0,
    };
    this.emit();
    audio.src = track.videoUrl;
    try {
      audio.currentTime = 0;
    } catch {
      /* metadata not in yet */
    }
    try {
      await audio.play();
    } catch {
      this.pendingRecord = false;
      this.setStatus("paused", "Playback was blocked. Hit play once more.");
    }
  }

  async replay() {
    const audio = this.ensureAudio();
    await this.resume();
    this.natural = false;
    this.reported = false;
    this.maxHeard = 0;
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch {
      this.setStatus("paused", "Playback was blocked. Hit play once more.");
    }
  }

  async toggle() {
    this.ensureGraph();
    await this.resume();
    const audio = this.ensureAudio();
    if (!audio.src) return false;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        this.setStatus("paused", "Playback was blocked. Hit play once more.");
      }
    } else {
      audio.pause();
    }
    return true;
  }

  pause() {
    this.audio?.pause();
  }

  seek(seconds: number) {
    if (!this.audio) return;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : this.snap.duration;
    const next = Math.min(Math.max(0, seconds), duration || seconds);
    this.audio.currentTime = next;
    this.maxHeard = Math.max(this.maxHeard, next);
    this.emit();
  }

  async startRecording() {
    if (!this.snap.currentId || !this.audio?.src) return;
    this.ensureGraph();
    await this.resume();
    this.finishRecorder();
    this.pendingRecord = true;
    this.audio.currentTime = 0;
    try {
      await this.audio.play();
    } catch {
      this.pendingRecord = false;
      this.setStatus("paused", "Playback was blocked. Hit play once more.");
    }
  }

  stopRecording() {
    this.pendingRecord = false;
    this.finishRecorder();
    this.emit();
  }

  private beginRecorder() {
    if (!this.tap || typeof MediaRecorder === "undefined") {
      this.pendingRecord = false;
      this.snap = {
        ...this.snap,
        error: "This browser can't record audio. You can still save the video file.",
      };
      this.emit();
      return;
    }
    const mime = mimeChoice();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(this.tap.stream, mime ? { mimeType: mime } : undefined);
    const type = recorder.mimeType || mime || "audio/webm";
    this.recordMime = type;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type });
      if (this.recorder === recorder) {
        this.recorder = null;
        this.snap = { ...this.snap, recording: false, recordSeconds: 0 };
        this.emit();
      }
      if (blob.size > 800) this.onRecording?.(blob, type);
    };
    recorder.start();
    this.recorder = recorder;
    this.recordStarted = performance.now();
    this.lastRecordEmit = this.recordStarted;
    this.emit();
  }

  private finishRecorder() {
    const recorder = this.recorder;
    this.pendingRecord = false;
    if (!recorder || recorder.state === "inactive") {
      this.recorder = null;
      return;
    }
    try {
      recorder.requestData();
    } catch {
      /* already flushing */
    }
    recorder.stop();
  }
}

export const engine = new PlayerEngine();
