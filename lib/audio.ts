/**
 * [INPUT]: 本地静态音频资源路径约定与 Focus 页客户端交互
 * [OUTPUT]: 可订阅的客户端音频管理器，提供环境音与 lo-fi 播放控制
 * [POS]: 位于 `lib/audio.ts`，被 `components/focus/MusicPlayer.tsx` 与后续 Focus 模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
 */

export type AmbientSoundId = "focus" | "chill" | "rest";

export type AudioTrack = {
  id: string;
  title: string;
  fileLabel: string;
  src: string;
};

export type AudioSnapshot = {
  ambientSoundId: AmbientSoundId;
  isMusicPlaying: boolean;
  musicVolume: number;
  activeTrackIndex: number;
  activeTrack: AudioTrack | null;
  isAmbientReady: boolean;
  isMusicReady: boolean;
  lastError: string | null;
};

type AudioListener = () => void;
type TrackChangeOptions = {
  autoplay: boolean;
};
type AudioContext = "ambient" | "music";
type PlayFailureKind = "aborted" | "interaction_required" | "unavailable";
type PlayResult =
  | { ok: true }
  | { ok: false; kind: PlayFailureKind; message: string };

const AMBIENT_SOURCE_MAP: Record<AmbientSoundId, string> = {
  focus: "/audio/ambient/focus.mp3",
  chill: "/audio/ambient/chill.mp3",
  rest: "/audio/ambient/rest.mp3",
};

const MUSIC_TRACKS: AudioTrack[] = [
  {
    id: "white-furnace",
    title: "White Furnace Echo",
    fileLabel: "white_furnace_echo.mp3",
    src: "/audio/music/white-furnace-echo.mp3",
  },
  {
    id: "signal-lantern",
    title: "Signal Lantern Drift",
    fileLabel: "signal_lantern_drift.mp3",
    src: "/audio/music/signal-lantern-drift.mp3",
  },
  {
    id: "ashen-watch",
    title: "Ashen Watch Lullaby",
    fileLabel: "ashen_watch_lullaby.mp3",
    src: "/audio/music/ashen-watch-lullaby.mp3",
  },
];

const DEFAULT_MUSIC_VOLUME = 0.65;
const DEFAULT_AMBIENT_VOLUME = 0.42;
const AMBIENT_FADE_DURATION_MS = 300;

function isBrowser() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getTrack(index: number) {
  return MUSIC_TRACKS[index] ?? null;
}

function formatUnavailableMessage(context: AudioContext) {
  return context === "ambient"
    ? "环境音资源未就绪，稍后补充 /public/audio 后即可恢复。"
    : "播放器资源未就绪，稍后补充 /public/audio 后即可恢复。";
}

function formatInteractionMessage(context: AudioContext) {
  return context === "ambient"
    ? "环境音播放需要一次用户交互后才能启动。"
    : "播放器需要一次用户交互后才能启动。";
}

function createInitialSnapshot(): AudioSnapshot {
  return {
    ambientSoundId: "focus",
    isMusicPlaying: false,
    musicVolume: DEFAULT_MUSIC_VOLUME,
    activeTrackIndex: 0,
    activeTrack: getTrack(0),
    isAmbientReady: true,
    isMusicReady: true,
    lastError: null,
  };
}

function classifyPlayFailure(error: unknown, context: AudioContext): { kind: PlayFailureKind; message: string } {
  if (error instanceof DOMException) {
    if (error.name === "AbortError") {
      return {
        kind: "aborted",
        message: "",
      };
    }

    if (error.name === "NotAllowedError") {
      return {
        kind: "interaction_required",
        message: formatInteractionMessage(context),
      };
    }
  }

  return {
    kind: "unavailable",
    message: formatUnavailableMessage(context),
  };
}

export class AudioManager {
  private readonly listeners = new Set<AudioListener>();

  private snapshot: AudioSnapshot = createInitialSnapshot();

  private ambientElements: Partial<Record<AmbientSoundId, HTMLAudioElement>> = {};

  private musicElement: HTMLAudioElement | null = null;

  private activeAmbientPlaybackId: AmbientSoundId | null = null;

  private ambientFadeFrame: number | null = null;

  private ambientRequestToken = 0;

  private musicRequestToken = 0;

  subscribe = (listener: AudioListener) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  async setAmbientSound(id: AmbientSoundId) {
    this.updateSnapshot({ ambientSoundId: id, lastError: null });

    if (!isBrowser()) {
      return;
    }

    const requestToken = ++this.ambientRequestToken;
    const nextElement = this.ensureAmbientElement(id);
    const previousId = this.activeAmbientPlaybackId;
    const previousElement = previousId ? this.ambientElements[previousId] ?? null : null;

    if (!nextElement) {
      this.handleAmbientFailure(previousElement, requestToken);
      return;
    }

    this.cancelAmbientFade();

    if (previousElement === nextElement && !nextElement.paused) {
      if (!this.isCurrentAmbientRequest(requestToken)) {
        return;
      }

      this.animateAmbientFade(nextElement, null);
      this.updateSnapshot({ isAmbientReady: true, lastError: null });
      return;
    }

    nextElement.volume = previousElement === nextElement ? nextElement.volume : 0;

    const playResult = await this.safePlay(nextElement, "ambient");

    if (!this.isCurrentAmbientRequest(requestToken)) {
      nextElement.pause();
      nextElement.currentTime = 0;
      nextElement.volume = DEFAULT_AMBIENT_VOLUME;
      return;
    }

    if (!playResult.ok) {
      this.handleAmbientPlayFailure(playResult, previousElement, requestToken);
      return;
    }

    this.activeAmbientPlaybackId = id;
    this.updateSnapshot({ isAmbientReady: true, lastError: null });
    this.animateAmbientFade(nextElement, previousElement === nextElement ? null : previousElement);
  }

  async playMusic() {
    if (!isBrowser()) {
      return;
    }

    const requestToken = ++this.musicRequestToken;
    const musicElement = this.ensureMusicElement();

    if (!musicElement) {
      this.updateSnapshot({ isMusicReady: false, isMusicPlaying: false, lastError: formatUnavailableMessage("music") });
      return;
    }

    const playResult = await this.safePlay(musicElement, "music");

    if (!this.isCurrentMusicRequest(requestToken)) {
      return;
    }

    if (!playResult.ok) {
      this.handleMusicPlayFailure(playResult);
      return;
    }

    this.updateSnapshot({ isMusicReady: true, isMusicPlaying: true, lastError: null });
  }

  pauseMusic() {
    this.musicRequestToken += 1;

    if (!this.musicElement) {
      this.updateSnapshot({ isMusicPlaying: false });
      return;
    }

    this.musicElement.pause();
    this.updateSnapshot({ isMusicPlaying: false });
  }

  async toggleMusic() {
    if (this.snapshot.isMusicPlaying) {
      this.pauseMusic();
      return;
    }

    await this.playMusic();
  }

  async nextTrack() {
    await this.changeTrackBy(1);
  }

  async previousTrack() {
    await this.changeTrackBy(-1);
  }

  setMusicVolume(value: number) {
    const musicVolume = clamp(value, 0, 1);

    if (this.musicElement) {
      this.musicElement.volume = musicVolume;
    }

    this.updateSnapshot({ musicVolume });
  }

  dispose() {
    this.cancelAmbientFade();
    this.ambientRequestToken += 1;
    this.musicRequestToken += 1;

    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.src = "";
      this.musicElement.load();
      this.musicElement = null;
    }

    for (const ambientId of Object.keys(this.ambientElements) as AmbientSoundId[]) {
      const ambientElement = this.ambientElements[ambientId];

      if (!ambientElement) {
        continue;
      }

      ambientElement.pause();
      ambientElement.src = "";
      ambientElement.load();
      delete this.ambientElements[ambientId];
    }

    this.activeAmbientPlaybackId = null;
    this.listeners.clear();
    this.snapshot = createInitialSnapshot();
  }

  private async changeTrackBy(direction: 1 | -1) {
    if (MUSIC_TRACKS.length === 0) {
      return;
    }

    const nextIndex = (this.snapshot.activeTrackIndex + direction + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
    await this.applyTrack(nextIndex, { autoplay: this.snapshot.isMusicPlaying });
  }

  private async applyTrack(index: number, options: TrackChangeOptions) {
    const nextTrack = getTrack(index);

    if (!nextTrack) {
      this.updateSnapshot({ activeTrack: null, activeTrackIndex: 0, isMusicPlaying: false, isMusicReady: false });
      return;
    }

    this.musicRequestToken += 1;
    this.updateSnapshot({
      activeTrack: nextTrack,
      activeTrackIndex: index,
      isMusicPlaying: false,
      isMusicReady: true,
      lastError: null,
    });

    if (!isBrowser()) {
      return;
    }

    const musicElement = this.ensureMusicElement();

    if (!musicElement) {
      this.updateSnapshot({ isMusicReady: false, lastError: formatUnavailableMessage("music") });
      return;
    }

    musicElement.pause();
    musicElement.src = nextTrack.src;
    musicElement.load();
    musicElement.volume = this.snapshot.musicVolume;

    if (options.autoplay) {
      await this.playMusic();
    }
  }

  private ensureAmbientElement(id: AmbientSoundId) {
    if (!isBrowser()) {
      return null;
    }

    const existingElement = this.ambientElements[id];

    if (existingElement) {
      return existingElement;
    }

    const audio = new Audio(AMBIENT_SOURCE_MAP[id]);

    audio.loop = true;
    audio.preload = "none";
    audio.volume = DEFAULT_AMBIENT_VOLUME;
    audio.addEventListener("error", this.onAmbientError);

    this.ambientElements[id] = audio;

    return audio;
  }

  private ensureMusicElement() {
    if (!isBrowser()) {
      return null;
    }

    if (this.musicElement) {
      return this.musicElement;
    }

    const activeTrack = this.snapshot.activeTrack;

    if (!activeTrack) {
      return null;
    }

    const audio = new Audio(activeTrack.src);

    audio.loop = false;
    audio.preload = "none";
    audio.volume = this.snapshot.musicVolume;
    audio.addEventListener("ended", this.onMusicEnded);
    audio.addEventListener("error", this.onMusicError);

    this.musicElement = audio;

    return audio;
  }

  private animateAmbientFade(nextElement: HTMLAudioElement, previousElement: HTMLAudioElement | null) {
    if (!isBrowser()) {
      return;
    }

    this.cancelAmbientFade();

    const startedAt = window.performance.now();
    const nextStartVolume = nextElement.volume;
    const previousStartVolume = previousElement?.volume ?? 0;

    const step = () => {
      const elapsed = window.performance.now() - startedAt;
      const progress = clamp(elapsed / AMBIENT_FADE_DURATION_MS, 0, 1);

      nextElement.volume = nextStartVolume + (DEFAULT_AMBIENT_VOLUME - nextStartVolume) * progress;

      if (previousElement) {
        previousElement.volume = previousStartVolume * (1 - progress);
      }

      if (progress < 1) {
        this.ambientFadeFrame = window.requestAnimationFrame(step);
        return;
      }

      nextElement.volume = DEFAULT_AMBIENT_VOLUME;

      if (previousElement) {
        previousElement.pause();
        previousElement.currentTime = 0;
        previousElement.volume = DEFAULT_AMBIENT_VOLUME;
      }

      this.ambientFadeFrame = null;
    };

    this.ambientFadeFrame = window.requestAnimationFrame(step);
  }

  private cancelAmbientFade() {
    if (!isBrowser() || this.ambientFadeFrame === null) {
      return;
    }

    window.cancelAnimationFrame(this.ambientFadeFrame);
    this.ambientFadeFrame = null;
  }

  private handleAmbientFailure(previousElement: HTMLAudioElement | null, requestToken: number) {
    if (!this.isCurrentAmbientRequest(requestToken)) {
      return;
    }

    if (previousElement) {
      previousElement.pause();
      previousElement.currentTime = 0;
      previousElement.volume = DEFAULT_AMBIENT_VOLUME;
    }

    this.activeAmbientPlaybackId = null;
    this.updateSnapshot({ isAmbientReady: false, lastError: formatUnavailableMessage("ambient") });
  }

  private handleAmbientPlayFailure(
    playResult: Extract<PlayResult, { ok: false }>,
    previousElement: HTMLAudioElement | null,
    requestToken: number,
  ) {
    if (!this.isCurrentAmbientRequest(requestToken)) {
      return;
    }

    if (playResult.kind === "aborted") {
      return;
    }

    if (playResult.kind === "interaction_required") {
      this.updateSnapshot({ isAmbientReady: true, lastError: playResult.message });
      return;
    }

    this.handleAmbientFailure(previousElement, requestToken);
  }

  private handleMusicPlayFailure(playResult: Extract<PlayResult, { ok: false }>) {
    if (playResult.kind === "aborted") {
      return;
    }

    if (playResult.kind === "interaction_required") {
      this.updateSnapshot({ isMusicReady: true, isMusicPlaying: false, lastError: playResult.message });
      return;
    }

    this.updateSnapshot({
      isMusicReady: false,
      isMusicPlaying: false,
      lastError: playResult.message,
    });
  }

  private async safePlay(element: HTMLAudioElement, context: AudioContext): Promise<PlayResult> {
    try {
      await element.play();

      return { ok: true };
    } catch (error) {
      const failure = classifyPlayFailure(error, context);

      return {
        ok: false,
        kind: failure.kind,
        message: failure.message,
      };
    }
  }

  private isCurrentAmbientRequest(requestToken: number) {
    return requestToken === this.ambientRequestToken;
  }

  private isCurrentMusicRequest(requestToken: number) {
    return requestToken === this.musicRequestToken;
  }

  private updateSnapshot(patch: Partial<AudioSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };

    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private onAmbientError = (event: Event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLAudioElement)) {
      return;
    }

    const activeAmbientId = this.activeAmbientPlaybackId;

    if (!activeAmbientId || this.ambientElements[activeAmbientId] !== target) {
      return;
    }

    this.activeAmbientPlaybackId = null;
    this.updateSnapshot({ isAmbientReady: false, lastError: formatUnavailableMessage("ambient") });
  };

  private onMusicError = () => {
    this.updateSnapshot({ isMusicReady: false, isMusicPlaying: false, lastError: formatUnavailableMessage("music") });
  };

  private onMusicEnded = () => {
    void this.nextTrack();
  };
}

let audioManagerSingleton: AudioManager | null = null;

export function getAudioManager() {
  if (!audioManagerSingleton) {
    audioManagerSingleton = new AudioManager();
  }

  return audioManagerSingleton;
}
