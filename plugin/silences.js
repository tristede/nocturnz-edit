/* Local auto-editor client. This panel only exports a separate source sequence. */
(() => {
  const el = (id) => document.getElementById(id);
  let host = null, uxp = null;
  try { host = require('premierepro'); uxp = require('uxp'); } catch (_) {}
  let source = null, job = null, plan = null, exported = null, busy = false, page = 0;
  const selected = new Set();
  const base = 'http://127.0.0.1:8765';
  const pageSize = 40;
  const tickBase = 254016000000n;
  const fields = ['silence-threshold','silence-minimum','silence-before','silence-after','silence-rate','silence-stream'];
  const say = (text, error = false) => {
    el('silence-status').textContent = text;
    el('silence-status').className = `tool-status${error ? ' error' : ''}`;
  };
  const bind = (id, action) => {
    const button = el(id);
    const run = () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      Promise.resolve().then(action).catch((error) => say(error.message || String(error), true));
    };
    button.addEventListener('click', run);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); run(); }
    });
  };
  function setBusy(value) {
    busy = value;
    for (const id of ['silence-selection','silence-file','silence-analyze','silence-export','silence-save','silence-import','silence-accept-all','silence-reject-all','silence-previous','silence-next']) el(id).setAttribute('aria-disabled', String(value));
    fields.forEach((id) => { el(id).disabled = value; });
    document.querySelectorAll('#silence-cuts input').forEach((input) => { input.disabled = value; });
    el('silence-cancel').hidden = !value || !job;
  }
  function reset() {
    plan = null; job = null; exported = null; selected.clear(); page = 0;
    el('silence-review').hidden = true;
    el('silence-save').hidden = el('silence-import').hidden = true;
    say('');
  }
  function setSource(value, name) {
    reset(); source = value;
    el('silence-source').textContent = name;
    el('silence-source').title = value.path;
  }
  async function api(path, payload) {
    let response;
    try {
      response = await fetch(base + path, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: payload === undefined ? {'X-Nocturnz-Client':'premiere-panel'} : {'Content-Type':'application/json','X-Nocturnz-Client':'premiere-panel'},
        ...(payload === undefined ? {} : {body:JSON.stringify(payload)}),
      });
    } catch (_) { throw new Error('Service local inaccessible. Lance npm run service.'); }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Service : HTTP ${response.status}`);
    return body;
  }
  const seconds = (ticks) => Number(BigInt(ticks)) / Number(tickBase);
  function timeLabel(ticks) {
    const ms = Math.round(seconds(ticks)*1000);
    const minutes = Math.floor(ms/60000);
    return `${String(minutes).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
  }
  function review() {
    const count = plan.operations.length;
    const duration = plan.operations.filter((op) => selected.has(op.id)).reduce((sum, op) => sum+op.durationSeconds, 0);
    el('silence-summary').textContent = `${selected.size}/${count} · ${duration.toFixed(2)} s`;
    el('silence-cuts').replaceChildren();
    const visible = plan.operations.slice(page*pageSize,(page+1)*pageSize);
    for (const op of visible) {
      const row = document.createElement('div'); row.className='cut-row';
      const checkbox = document.createElement('input'); checkbox.type='checkbox'; checkbox.id=`silence-${op.id}`; checkbox.checked=selected.has(op.id);
      const label = document.createElement('label'); label.htmlFor=checkbox.id;
      label.textContent=`${timeLabel(op.sourceRange.startTicks)} → ${timeLabel(op.sourceRange.endTicks)}`;
      const length = document.createElement('span'); length.textContent=`${op.durationSeconds.toFixed(2)} s`;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(op.id); else selected.delete(op.id);
        exported=null; el('silence-save').hidden=el('silence-import').hidden=true; review();
      });
      row.appendChild(checkbox); row.appendChild(label); row.appendChild(length); el('silence-cuts').appendChild(row);
    }
    el('silence-page').textContent = `${page+1}/${Math.max(1,Math.ceil(count/pageSize))}`;
    el('silence-previous').hidden = page===0;
    el('silence-next').hidden = (page+1)*pageSize>=count;
  }
  async function selectedSource() {
    if (!host) throw new Error('Disponible dans Premiere.');
    const project=await host.Project.getActiveProject();
    const sequence=project && await project.getActiveSequence();
    if (!sequence) throw new Error('Aucune séquence active.');
    const selection=await sequence.getSelection();
    const items=selection ? await selection.getTrackItems() : [];
    if (!items.length) throw new Error('Sélectionne un clip dans la timeline.');
    const candidates = new Map();
    for (const item of items) {
      const clip=host.ClipProjectItem.cast(await item.getProjectItem());
      if (!clip || await clip.isSequence() || await clip.isMulticamClip() || await clip.isMergedClip()) throw new Error('Séquences imbriquées, multicam et clips fusionnés non pris en charge.');
      if (await clip.isOffline()) throw new Error('Média hors ligne.');
      const path=await clip.getMediaFilePath();
      const [inPoint,outPoint,start,end]=await Promise.all([item.getInPoint(),item.getOutPoint(),item.getStartTime(),item.getEndTime()]);
      if (BigInt(outPoint.ticks)-BigInt(inPoint.ticks)!==BigInt(end.ticks)-BigInt(start.ticks) || await item.isSpeedReversed()) throw new Error('Les clips ralentis, accélérés ou inversés ne sont pas pris en charge.');
      candidates.set(`${path}|${inPoint.ticks}|${outPoint.ticks}`,{path,sourceInTicks:String(inPoint.ticks),sourceOutTicks:String(outPoint.ticks),sequenceStartTicks:String(start.ticks)});
    }
    if (candidates.size!==1) throw new Error('Choisis un seul média source, ou utilise Fichier.');
    setSource([...candidates.values()][0], await items[0].getName());
    el('silence-rate').value=`${tickBase}/${String(await sequence.getTimebase())}`;
  }
  bind('silence-selection',selectedSource);
  bind('silence-file',async () => {
    if (!uxp) throw new Error('Ouvre le panneau dans Premiere pour choisir un fichier.');
    const file=await uxp.storage.localFileSystem.getFileForOpening({types:['wav','mp3','mp4','mov','m4a','mkv','aiff','flac','webm','mxf'],allowMultiple:false});
    if (file) setSource({path:file.nativePath,sourceInTicks:'0',sequenceStartTicks:'0'},file.name);
  });
  fields.forEach((id) => el(id).addEventListener('change', () => { if (!busy) reset(); }));
  bind('silence-analyze',async () => {
    if (!source) throw new Error('Choisis une source.');
    reset(); setBusy(true); say('Analyse en cours…');
    try {
      const record=await api('/api/v1/silences/analyze',{
        ...source, thresholdDb:Number(el('silence-threshold').value), minSilenceMs:Number(el('silence-minimum').value),
        beforeMs:Number(el('silence-before').value), afterMs:Number(el('silence-after').value),
        frameRate:el('silence-rate').value, stream:el('silence-stream').value,
      });
      job=record.id; el('silence-cancel').hidden=false;
      let current=record;
      while (['queued','running','cancelling'].includes(current.status)) {
        say(current.status==='queued' ? 'En attente…' : current.status==='cancelling' ? 'Annulation en cours…' : 'Analyse en cours…');
        await new Promise((resolve) => setTimeout(resolve,500));
        current=await api(`/api/v1/jobs/${job}`);
      }
      if (current.status==='cancelled') { say('Analyse annulée.'); return; }
      if (current.status!=='complete') throw new Error(current.error || 'Analyse interrompue.');
      plan=current.result; plan.operations.forEach((op) => selected.add(op.id));
      el('silence-review').hidden=false; review(); say(`${plan.operations.length} coupe(s) proposée(s).`);
    } finally { setBusy(false); }
  });
  bind('silence-cancel',async () => { if (job) { await api(`/api/v1/jobs/${job}/cancel`,{}); say('Annulation en cours…'); } });
  bind('silence-accept-all',() => { if (plan) { plan.operations.forEach((op) => selected.add(op.id)); exported=null; el('silence-save').hidden=el('silence-import').hidden=true; review(); } });
  bind('silence-reject-all',() => { selected.clear(); exported=null; el('silence-save').hidden=el('silence-import').hidden=true; review(); });
  bind('silence-previous',() => { if (page>0) { page-=1; review(); } });
  bind('silence-next',() => { if ((page+1)*pageSize<plan.operations.length) { page+=1; review(); } });
  bind('silence-export',async () => {
    if (!plan || !job) throw new Error('Analyse requise.');
    setBusy(true); el('silence-cancel').hidden=true; say('Génération du XML…');
    try {
      exported=await api(`/api/v1/jobs/${job}/export`,{acceptedIds:[...selected]});
      el('silence-save').hidden=false; el('silence-import').hidden=!host;
      say('XML source généré. Les effets de la timeline ne sont pas repris.');
    } finally { setBusy(false); }
  });
  bind('silence-save',async () => {
    if (!exported || !uxp) return;
    const xml=exported.xml;
    const file=await uxp.storage.localFileSystem.getFileForSaving('Nocturnz_Silences.xml',{types:['xml']});
    if (file) { await file.write(xml); say('XML enregistré.'); }
  });
  bind('silence-import',async () => {
    if (!exported || !host) return;
    setBusy(true); el('silence-cancel').hidden=true;
    try {
      const project=await host.Project.getActiveProject();
      if (!project) throw new Error('Ouvre un projet Premiere.');
      const before=await project.getSequences();
      const imported=await project.importFiles([exported.path],true,await project.getRootItem(),false);
      const after=await project.getSequences();
      if (!imported || after.length<=before.length) throw new Error('Premiere n’a pas confirmé de nouvelle séquence. Le XML reste disponible.');
      say('Nouvelle séquence source importée. Projet non sauvegardé.');
    } finally { setBusy(false); }
  });
})();
