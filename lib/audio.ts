/**
 * [INPUT]: 本地静态音频资源路径约定与 Focus 页客户端交互
 * [OUTPUT]: AudioPlaylist / PLAYLISTS / AudioManager（含 setPlaylist）/ 可订阅快照
 * [POS]: 位于 `lib/audio.ts`，被 `components/focus/MusicPlayer.tsx` 与 Focus 模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
 */

export type AmbientSoundId = "focus" | "chill" | "rest";

export type AudioTrack = {
  id: string;
  title: string;
  fileLabel: string;
  src: string;
};

export type PlaylistIcon = "flame" | "snowflake" | "globe";

export type AudioPlaylist = {
  id: string;
  name: string;
  description: string;
  icon: PlaylistIcon;
  tracks: AudioTrack[];
};

export type AudioSnapshot = {
  ambientSoundId: AmbientSoundId;
  activePlaylistId: string;
  isAmbientPlaying: boolean;
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
  focus: "/audio/ambient/focus.wav",
  chill: "/audio/ambient/chill.wav",
  rest: "/audio/ambient/rest.wav",
};

/* ─── 播放列表：单一真相源 ─── */

export const PLAYLISTS: AudioPlaylist[] = [
  {
    id: "furnace-works",
    name: "Furnace Works",
    description: "工业炉火",
    icon: "flame",
    tracks: [
      {
        id: "white-furnace",
        title: "White Furnace Echo",
        fileLabel: "white_furnace_echo.wav",
        src: "/audio/music/white-furnace-echo.mp3",
      },
    ],
  },
  {
    id: "frostpunk-ost",
    name: "Frostpunk OST",
    description: "冰汽时代原声",
    icon: "snowflake",
    tracks: [
      {
        id: "signal-lantern",
        title: "Signal Lantern Drift",
        fileLabel: "signal_lantern_drift.wav",
        src: "/audio/music/Piotr Musiał - Frostpunk Expansions (Original Soundtrack) - 01 - The Last Autumn Theme.mp3",
      },
    ],
  },
  {
    id: "expedition-night",
    name: "Expedition Night",
    description: "远征夜曲",
    icon: "globe",
    tracks: [
      {
        id: "ashen-watch",
        title: "Ashen Watch Lullaby",
        fileLabel: "ashen_watch_lullaby.wav",
        src: "/audio/music/ashen-watch-lullaby.mp3",
      },
    ],
  },
];

/* 派生：全量曲目列表（向后兼容） */
const MUSIC_TRACKS: AudioTrack[] = PLAYLISTS.flatMap((p) => p.tracks);

const DEFAULT_MUSIC_VOLUME = 0.65;
const DEFAULT_AMBIENT_VOLUME = 0.42;
const AMBIENT_FADE_DURATION_MS = 300;

function isBrowser() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
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
    activePlaylistId: PLAYLISTS[0]?.id ?? "",
    isAmbientPlaying: false,
    isMusicPlaying: false,
    musicVolume: DEFAULT_MUSIC_VOLUME,
    activeTrackIndex: 0,
    activeTrack: PLAYLISTS[0]?.tracks[0] ?? null,
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
    const previousId = this.activeAmbientPlaybackId;
    const previousElement = previousId ? this.ambientElements[previousId] ?? null : null;

    if (this.snapshot.ambientSoundId === id && this.snapshot.isAmbientPlaying && previousElement && !previousElement.paused) {
      this.pauseAmbient(previousElement);
      this.updateSnapshot({ lastError: null });
      return;
    }

    this.updateSnapshot({ ambientSoundId: id, lastError: null });

    if (!isBrowser()) {
      return;
    }

    const requestToken = ++this.ambientRequestToken;
    const nextElement = this.ensureAmbientElement(id);

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
    this.updateSnapshot({ isAmbientReady: true, isAmbientPlaying: true, lastError: null });
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

  async setPlaylist(playlistId: string) {
    const playlist = PLAYLISTS.find((p) => p.id === playlistId);

    if (!playlist || playlist.id === this.snapshot.activePlaylistId) {
      return;
    }

    this.updateSnapshot({ activePlaylistId: playlist.id });
    await this.applyTrack(0, { autoplay: true });
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

  pauseAmbient(element?: HTMLAudioElement | null) {
    this.cancelAmbientFade();
    this.ambientRequestToken += 1;

    const activeElement = element ?? (this.activeAmbientPlaybackId ? this.ambientElements[this.activeAmbientPlaybackId] ?? null : null);

    if (activeElement) {
      activeElement.pause();
      activeElement.currentTime = 0;
      activeElement.volume = DEFAULT_AMBIENT_VOLUME;
    }

    this.activeAmbientPlaybackId = null;
    this.updateSnapshot({ isAmbientPlaying: false });
  }

  private getActivePlaylistTracks(): AudioTrack[] {
    const playlist = PLAYLISTS.find((p) => p.id === this.snapshot.activePlaylistId);
    return playlist?.tracks ?? MUSIC_TRACKS;
  }

  private async changeTrackBy(direction: 1 | -1) {
    const tracks = this.getActivePlaylistTracks();

    if (tracks.length === 0) {
      return;
    }

    const nextIndex = (this.snapshot.activeTrackIndex + direction + tracks.length) % tracks.length;
    await this.applyTrack(nextIndex, { autoplay: this.snapshot.isMusicPlaying });
  }

  private async applyTrack(index: number, options: TrackChangeOptions) {
    const tracks = this.getActivePlaylistTracks();
    const nextTrack = tracks[index] ?? null;

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
      this.pauseAmbient(previousElement);
    }

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
      this.activeAmbientPlaybackId = null;
      this.updateSnapshot({ isAmbientReady: true, isAmbientPlaying: false, lastError: playResult.message });
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
    this.updateSnapshot({ isAmbientReady: false, isAmbientPlaying: false, lastError: formatUnavailableMessage("ambient") });
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
