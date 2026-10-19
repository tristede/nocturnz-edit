import { describe, expect, it } from 'vitest';
import type { SequenceInfo } from '../operations/model';
import { assignByEnergy, longestUtterance, matchAudioToVideoTracks, speakerEnergy, speakerSummaries } from './speakers';

const u = (startSec: number, endSec: number, speakerId: string, text = 'x') => ({ startSec, endSec, speakerId, text });

describe('speakerSummaries', () => {
  it('totals talk time and picks the longest utterances as quotes, sorted by talk time', () => {
    const s = speakerSummaries([
      u(0, 10, 'A', 'the big opening monologue'),
      u(10, 11, 'B', 'short remark'),
      u(11, 13, 'A', 'a follow-up'),
      u(13, 20, 'B', 'the long rebuttal everyone remembers'),
    ]);
    expect(s[0]).toMatchObject({ speakerId: 'A', totalSec: 12 });
    expect(s[0]!.quotes[0]).toBe('the big opening monologue');
    expect(s[1]).toMatchObject({ speakerId: 'B', totalSec: 8 });
    expect(s[1]!.quotes[0]).toBe('the long rebuttal everyone remembers');
  });
});

describe('longestUtterance', () => {
  it('returns the longest utterance for a speaker, null when absent', () => {
    const utts = [u(0, 2, 'A'), u(5, 12, 'A'), u(2, 5, 'B')];
    expect(longestUtterance(utts, 'A')).toMatchObject({ startSec: 5, endSec: 12 });
    expect(longestUtterance(utts, 'C')).toBeNull();
  });
});

describe('matchAudioToVideoTracks', () => {
  it('pairs audio tracks to video tracks by dominant shared clip name', () => {
    const seq: SequenceInfo = {
      name: 's', endSec: 10, fps: 30,
      videoTracks: [
        { index: 0, name: 'V1', clips: [{ index: 0, nodeId: 'a', name: 'camA.mov', startSec: 0, endSec: 10, enabled: true }] },
        { index: 1, name: 'V2', clips: [{ index: 0, nodeId: 'b', name: 'camB.mov', startSec: 0, endSec: 10, enabled: true }] },
      ],
      audioTracks: [
        { index: 0, name: 'A1', clips: [{ index: 0, nodeId: 'c', name: 'camB.mov', startSec: 0, endSec: 10, enabled: true }] },
        { index: 1, name: 'A2', clips: [{ index: 0, nodeId: 'd', name: 'camA.mov', startSec: 0, endSec: 10, enabled: true }] },
        { index: 2, name: 'A3', clips: [] },
      ],
    };
    expect(matchAudioToVideoTracks(seq)).toEqual([
      { audioIndex: 0, videoIndex: 1 },
      { audioIndex: 1, videoIndex: 0 },
    ]);
  });
});

describe('speakerEnergy', () => {
  it('measures mean energy inside a speaker turn windows only', () => {
    const sr = 1000;
    const samples = new Float32Array(4000);
    for (let i = 1000; i < 2000; i++) samples[i] = 0.8; // loud during 1-2s
    const loud = speakerEnergy(samples, sr, [u(1, 2, 'A')], 'A');
    const quiet = speakerEnergy(samples, sr, [u(3, 4, 'A')], 'A');
    expect(loud).toBeGreaterThan(quiet * 100);
  });
});

describe('assignByEnergy', () => {
  it('assigns each speaker the camera whose mic favors them, one camera per speaker', () => {
    // energy[cameraIdx][speakerIdx]: camera 0 favors speaker 1, camera 1 favors speaker 0
    const r = assignByEnergy([[1, 4], [3, 1]], ['spkA', 'spkB'], [10, 20]);
    expect(r.assignments).toEqual({ spkA: 20, spkB: 10 });
    expect(r.confidence.spkA).toBeGreaterThan(0.5);
    expect(r.confidence.spkB).toBeGreaterThan(0.5);
  });
  it('does not collapse both speakers onto one camera even when it dominates raw energy', () => {
    // camera 0 is louder overall for both speakers; relative shares still separate them
    const r = assignByEnergy([[10, 12], [1, 4]], ['spkA', 'spkB'], [0, 1]);
    expect(new Set(Object.values(r.assignments)).size).toBe(2);
    expect(r.assignments.spkB).toBe(1); // spkB's share on cam1 (4/5) beats cam0 (12/22)
  });
});
