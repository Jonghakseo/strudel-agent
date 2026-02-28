// ── Song Storage Types ──

export interface SongVersion {
  code: string;
  createdAt: string;
}

export interface Song {
  versions: SongVersion[];
}

export interface SongsData {
  songs: Record<string, Song>;
}

// ── Daemon State Types ──

export type PlaybackState = 'playing' | 'paused' | 'stopped';

export interface DaemonState {
  name?: string;
  version?: number;
  state: PlaybackState;
  code?: string;
}

// ── Daemon PID File ──

export interface DaemonPidInfo {
  port: number;
  pid: number;
}

// ── HTTP API Types ──

export interface HealthResponse {
  ok: true;
  pid: number;
}

export interface CurrentResponse {
  name?: string;
  version?: number;
  state: PlaybackState;
  code?: string;
}

export interface PlayRequest {
  code: string;
  name: string;
  version: number;
}

export interface PlayResponse {
  ok: boolean;
  name: string;
  version: number;
  state: PlaybackState;
}

export interface StopResponse {
  ok: boolean;
  state: 'stopped';
}

export interface PauseResponse {
  ok: boolean;
  state: 'paused';
}

export interface EvaluateRequest {
  code: string;
  name?: string;
  version?: number;
}

export interface EvaluateResponse {
  ok: boolean;
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

// ── Engine Interface ──

export interface StrudelEngine {
  evaluate: (code: string) => Promise<void>;
  stop: () => void;
  pause: () => void;
  start: () => void;
}
