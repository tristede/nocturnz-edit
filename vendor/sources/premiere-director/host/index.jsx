// Premiere Director — ExtendScript host bridge (ES3).
// All entry points return JSON strings. Mutations arrive only as validated operation batches.

function PD_ping() { return 'pong'; }

function _pdActiveSequence() {
  if (!app.project || !app.project.activeSequence) return null;
  return app.project.activeSequence;
}

function _pdFps(seq) {
  // videoFrameRate is a Time object holding one frame's duration.
  var frameSec = seq.getSettings().videoFrameRate.seconds;
  return frameSec > 0 ? 1 / frameSec : 30;
}

function _pdTrackInfo(track, index) {
  var clips = [];
  for (var i = 0; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    clips.push({
      index: i,
      nodeId: c.nodeId || String(i),
      name: c.name || '',
      startSec: c.start.seconds,
      endSec: c.end.seconds,
      enabled: !c.disabled
    });
  }
  var muted = false;
  try { muted = !!track.isMuted(); } catch (eMute) { /* older hosts may lack isMuted */ }
  return { index: index, name: track.name || '', clips: clips, muted: muted };
}

function PD_getSequenceInfo() {
  try {
    var seq = _pdActiveSequence();
    if (!seq) return JSON.stringify({ error: 'No active sequence' });
    var v = [], a = [], i;
    for (i = 0; i < seq.videoTracks.numTracks; i++) v.push(_pdTrackInfo(seq.videoTracks[i], i));
    for (i = 0; i < seq.audioTracks.numTracks; i++) a.push(_pdTrackInfo(seq.audioTracks[i], i));
    return JSON.stringify({
      name: seq.name,
      endSec: seq.end ? Number(seq.end) / 254016000000 : 0,
      fps: _pdFps(seq),
      videoTracks: v,
      audioTracks: a
    });
  } catch (e) {
    return JSON.stringify({ error: 'getSequenceInfo: ' + e.toString() });
  }
}

function PD_exportAudio(outPath, presetPath) {
  try {
    var seq = _pdActiveSequence();
    if (!seq) return JSON.stringify({ ok: false, error: 'No active sequence' });
    // Synchronous render inside Premiere; 0 = ENCODE_ENTIRE.
    var res = seq.exportAsMediaDirect(outPath, presetPath, app.encoder.ENCODE_ENTIRE);
    var f = new File(outPath);
    if (!f.exists) return JSON.stringify({ ok: false, error: 'export produced no file: ' + res });
    return JSON.stringify({ ok: true, path: outPath });
  } catch (e) {
    return JSON.stringify({ ok: false, error: 'exportAudio: ' + e.toString() });
  }
}

function _pdSmpte(sec, fps) {
  var totalFrames = Math.round(sec * fps);
  var fpsInt = Math.round(fps);
  var ff = totalFrames % fpsInt;
  var totalSec = Math.floor(totalFrames / fpsInt);
  var ss = totalSec % 60;
  var mm = Math.floor(totalSec / 60) % 60;
  var hh = Math.floor(totalSec / 3600);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(hh) + ':' + p(mm) + ':' + p(ss) + ':' + p(ff);
}

function _pdRazorAll(timeSec) {
  app.enableQE();
  var seq = _pdActiveSequence();
  var qseq = qe.project.getActiveSequence();
  var tc = _pdSmpte(timeSec, _pdFps(seq));
  var i;
  for (i = 0; i < seq.videoTracks.numTracks; i++) {
    if (seq.videoTracks[i].clips.numItems > 0) qseq.getVideoTrackAt(i).razor(tc);
  }
  for (i = 0; i < seq.audioTracks.numTracks; i++) {
    if (seq.audioTracks[i].clips.numItems > 0) qseq.getAudioTrackAt(i).razor(tc);
  }
}

function _pdGetClip(trackType, trackIndex, clipIndex) {
  var seq = _pdActiveSequence();
  var tracks = trackType === 'video' ? seq.videoTracks : seq.audioTracks;
  if (trackIndex >= tracks.numTracks) throw new Error('track ' + trackIndex + ' out of range');
  var track = tracks[trackIndex];
  if (clipIndex >= track.clips.numItems) throw new Error('clip ' + clipIndex + ' out of range');
  return track.clips[clipIndex];
}

function PD_execute(batchJson) {
  var applied = 0;
  try {
    var batch = JSON.parse(batchJson);
    if (!batch || !batch.ops || !batch.ops.length) return JSON.stringify({ ok: true, applied: 0 });
    for (var i = 0; i < batch.ops.length; i++) {
      var op = batch.ops[i];
      try {
        if (op.type === 'razorAll') {
          _pdRazorAll(op.timeSec);
        } else if (op.type === 'rippleDelete') {
          _pdGetClip(op.trackType, op.trackIndex, op.clipIndex).remove(1, 1);
        } else if (op.type === 'setClipEnabled') {
          _pdGetClip(op.trackType, op.trackIndex, op.clipIndex).disabled = !op.enabled;
        } else if (op.type === 'setTrackMute') {
          var mseq = _pdActiveSequence();
          if (op.trackIndex >= mseq.audioTracks.numTracks) throw new Error('audio track ' + op.trackIndex + ' out of range');
          mseq.audioTracks[op.trackIndex].setMute(op.mute ? 1 : 0);
        } else {
          throw new Error('unknown op type ' + op.type);
        }
        applied++;
      } catch (opErr) {
        return JSON.stringify({ ok: false, applied: applied, failedAt: i, error: opErr.toString() });
      }
    }
    return JSON.stringify({ ok: true, applied: applied });
  } catch (e) {
    return JSON.stringify({ ok: false, applied: applied, error: 'execute: ' + e.toString() });
  }
}
