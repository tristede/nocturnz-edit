export interface Utterance { startSec: number; endSec: number; speakerId: string; text: string; }
export interface CameraMap { speakerToTrack: Record<string, number | null>; wideTrackIndex: number | null; }
export interface DirectorConfig { speakThresholdSec: number; minShotSec: number; gapBridgeSec: number; crosstalkMinSec: number; }
export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  speakThresholdSec: 1.0, minShotSec: 1.0, gapBridgeSec: 0.3, crosstalkMinSec: 1.5,
};
export interface SwitchPoint { timeSec: number; toTrackIndex: number; reason: string; }
