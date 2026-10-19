export interface ClipInfo { index: number; nodeId: string; name: string; startSec: number; endSec: number; enabled: boolean; }
export interface TrackInfo { index: number; name: string; clips: ClipInfo[]; muted?: boolean; }
export interface SequenceInfo { name: string; endSec: number; fps: number; videoTracks: TrackInfo[]; audioTracks: TrackInfo[]; }
