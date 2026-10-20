/* Source tool adapters. Imports add assets/sequences; they never edit a timeline. */
(() => {
  const $ = (id) => document.getElementById(id);
  const definitions = new Map(window.NocturnzModules.map((spec) => [spec.id, spec]));
  const states = new Map();
  let active = null, host = null, uxp = null, openedText = null, transcriptData=null, transcriptPage=0;
  try { host = require('premierepro'); uxp = require('uxp'); } catch (_) {}
  const labels = {normalize:'Normaliser', denoise:'Réduire le bruit', duck:'Ducking', fit:'Adapter la durée',
    tone:'Tonalité', sfx:'Effet sonore', bleep:'Bip', mute:'Silence', faces:'Flouter les visages',
    center:'Centré', auto:'Automatique', face:'Visage', animated:'Animation', side_by_side:'Côte à côte',
    '2x2_grid':'Grille 2 × 2', pip_top_right:'Incrustation', grid:'Grille multicam',
    interview:'Interview', social:'Réseaux sociaux', audio:'Audio', heuristic:'Heuristique locale', ollama:'Ollama local'};
  const extensions = ['wav','mp3','mp4','mov','m4a','mkv','aiff','aif','flac','webm','mxf'];
  const clear = (element) => { while (element.firstChild) element.removeChild(element.firstChild); };
  function bind(button, action) {
    const run = () => { if(button.getAttribute('aria-disabled')==='true') return; return Promise.resolve().then(action).catch((error) => say(error.message, true)); };
    button.addEventListener('click', run);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); run(); }
    });
  }
  function say(text, bad=false) {
    $('module-status').textContent = text;
    $('module-status').className = `tool-status${bad ? ' error' : ''}`;
  }
  async function api(path, payload) {
    let response;
    try {
      response = await fetch('http://localhost:8765/api/v1/' + path, {method:payload === undefined ? 'GET':'POST',
        headers:{'X-Nocturnz-Client':'premiere-panel', ...(payload === undefined ? {} : {'Content-Type':'application/json'})},
        ...(payload === undefined ? {} : {body:JSON.stringify(payload)})});
    } catch (_) { throw new Error('Service local inaccessible. Lance npm run service.'); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  function state() {
    if (!states.has(active)) states.set(active, {paths:[],options:{},job:null,accepted:new Set()});
    return states.get(active);
  }
  function busy(value) {
    $('module-run').setAttribute('aria-disabled', String(value));
    $('module-file').setAttribute('aria-disabled', String(value));
    $('module-selection').setAttribute('aria-disabled', String(value));
    $('caption-apply').setAttribute('aria-disabled',String(value));$('caption-from-premiere').setAttribute('aria-disabled',String(value));
    $('module-cancel').hidden = !value;
    $('module-progress').hidden = !value;
    document.querySelectorAll('#module-fields input,#module-fields select,#module-advanced-fields input,#module-advanced-fields select').forEach((input)=>{input.disabled=value;});
  }
  async function choose(multiple=false, types=extensions) {
    if (!uxp) throw new Error('Choix de fichiers disponible dans Premiere.');
    const files = await uxp.storage.localFileSystem.getFileForOpening({allowMultiple:multiple, types});
    return files ? (Array.isArray(files) ? files : [files]) : [];
  }
  const basicFields={cadrages:['layout'],recadrage:['aspect'],shorts:['count'],broll:['footage'],
    audio:['operation','music'],musique:['operation','duration'],censure:['operation','words'],recettes:['recipe'],lots:['module']};
  const captionStyles=[['nocturnz','Nocturnz'],['youtube_bold','Impact'],['neon_pop','Néon'],['minimal','Sobre']];
  let previewWord=0;
  function renderPresets() {
    clear($('caption-presets'));
    const data=state();
    for(const [value,title] of captionStyles) {
      const button=document.createElement('div');button.className='caption-preset'+(data.options.style===value ? ' is-active':'');
      button.dataset.style=value;button.setAttribute('role','button');button.setAttribute('tabindex','0');
      button.setAttribute('aria-pressed',String(data.options.style===value));
      const sample=document.createElement('span');sample.className='preset-sample';sample.textContent='Aa';
      const name=document.createElement('span');name.textContent=title;button.appendChild(sample);button.appendChild(name);
      bind(button,()=>{if($('module-run').getAttribute('aria-disabled')==='true') return;data.options.style=value;renderFields();});
      $('caption-presets').appendChild(button);
    }
    $('caption-preview').dataset.style=data.options.style;
    clear($('caption-preview-line'));
    for(const text of ['Chaque','mot','compte.']) {const word=document.createElement('span');word.textContent=text;$('caption-preview-line').appendChild(word);}
  }
  setInterval(()=>{
    if(active!=='captions' || $('tool-view').hidden) return;
    const words=$('caption-preview-line').children;
    for(let i=0;i<words.length;i++) words[i].classList.toggle('is-spoken',i===previewWord%words.length);
    previewWord++;
  },550);
  function renderFields() {
    clear($('module-fields'));clear($('module-advanced-fields'));
    const spec = definitions.get(active), data=state();
    document.querySelector('#module-controls .zoom-scope').textContent=active==='podcast' || active==='cadrages'
      ? 'Sources synchronisées au même départ · résultats séparés' : 'Médias source entiers · résultats séparés';
    for (const field of spec.fields) {
      if (!(field.key in data.options)) data.options[field.key] = field.default;
      const label=document.createElement('label');
      const title=document.createElement('span'); title.textContent=field.label; label.appendChild(title);
      if (field.type === 'file' || field.type === 'files') {
        const button=document.createElement('div'); button.className='button button-secondary module-picker';
        button.setAttribute('role','button');button.setAttribute('tabindex','0');
        const show = () => { const value=data.options[field.key]; button.textContent=Array.isArray(value) ? `${value.length} fichier(s)` : value ? value.split(/[\\/]/).pop() : 'Choisir'; };
        show();
        bind(button,async()=>{
          const files=await choose(field.type==='files',field.extensions || extensions);
          if(!files.length) return;
          data.options[field.key]=field.type==='files' ? files.map((file)=>file.nativePath) : files[0].nativePath;
          show();
        });
        label.appendChild(button);
        if(field.key==='transcript') {
          const recent=document.createElement('div');recent.className='module-action';recent.textContent='Réutiliser une transcription';recent.setAttribute('role','button');recent.setAttribute('tabindex','0');
          bind(recent,async()=>{
            if(!data.paths.length) throw new Error('Choisis d’abord la source.');
            const history=await api('module-jobs');
            const job=history.jobs.find((record)=>record.status==='complete' && record.request?.paths[0]===data.paths[0] && record.artifacts.some((artifact)=>/(^|\/)transcription\.json$/.test(artifact.name)));
            if(!job) throw new Error('Aucune transcription conservée pour cette source.');
            data.options.transcript=job.artifacts.find((artifact)=>/(^|\/)transcription\.json$/.test(artifact.name)).path;show();
          });label.appendChild(recent);
        }
      } else {
        const input=document.createElement(field.type==='select' ? 'select':'input');
        input.setAttribute('aria-label',field.label);
        if(field.type==='select') {
          for(const choice of field.choices) {
            const option=document.createElement('option');option.value=choice;
            option.textContent=definitions.get(choice)?.title || labels[choice] || choice;
            option.selected=choice===data.options[field.key];input.appendChild(option);
          }
        } else {
          input.type=field.type;
          for(const name of ['min','max','step']) if(field[name]!==undefined) input.setAttribute(name,String(field[name]));
        }
        input.value=String(data.options[field.key]);
        input.addEventListener('change',()=>{data.options[field.key]=field.type==='number' ? Number(input.value):input.value;if(field.key==='operation' || field.key==='style') renderFields();});
        label.appendChild(input);
      }
      const visible=(basicFields[active] || []).includes(field.key) &&
        !(field.key==='music' && data.options.operation!=='duck') &&
        !(field.key==='words' && data.options.operation==='faces');
      (visible ? $('module-fields'):$('module-advanced-fields')).appendChild(label);
    }
    $('module-source').textContent = data.paths.length ? data.paths.map((path)=>path.split(/[\\/]/).pop()).join(' · ') : 'Média source';
    $('caption-from-premiere').hidden=!['captions','transcription'].includes(active);
    $('caption-studio').hidden=active!=='captions';if(active==='captions') renderPresets();
    $('module-run').textContent=active==='captions' ? 'Créer les sous-titres':spec.action;
  }
  async function history() {
    const data=await api('module-jobs');
    const select=$('module-history'); clear(select);
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choisir une tâche';placeholder.selected=true;select.appendChild(placeholder);
    for(const job of data.jobs) {
      const option=document.createElement('option');option.value=job.id;
      option.textContent=`${definitions.get(job.module)?.title || job.module} · ${job.status} · ${new Date(job.createdAt*1000).toLocaleTimeString()}`;
      select.appendChild(option);
    }
    select.selectedIndex=0;select.value='';
  }
  function renderJob(record) {
    const data=state(); data.job=record;
    const running=['queued','running','cancelling'].includes(record.status);busy(running);
    $('module-progress').value=record.progress || 0;
    say(record.error || `${record.message || record.status}${running ? ` · ${record.progress || 0} %` : ''}`,Boolean(record.error));
    $('module-results').hidden=record.status!=='complete';
    $('module-review').hidden=true; $('module-result-text').hidden=true;$('module-save-text').hidden=true;$('module-transcript-editor').hidden=true;
    openedText=null;clear($('module-artifacts'));clear($('module-cuts'));
    $('caption-apply').hidden=true;
    if(record.status!=='complete') return;
    if(data.transcript) {transcriptData=data.transcript;transcriptPage=data.transcriptPage || 0;renderTranscript();}
    $('module-results-title').textContent=active==='captions' ? 'Modifier les sous-titres':'Résultats';
    $('caption-apply').hidden=active!=='captions' || !data.transcript;
    if(record.result?.reviewRequired && Array.isArray(record.result.cuts)) {
      $('module-review').hidden=false;
      if(data.reviewJob!==record.id) {data.accepted=new Set(record.result.cuts.map((_,index)=>index));data.reviewJob=record.id;data.cutPage=0;}
      const start=(data.cutPage || 0)*40,total=record.result.cuts.length;
      $('module-cuts-page').textContent=`${data.accepted.size}/${total} · ${(data.cutPage || 0)+1}/${Math.max(1,Math.ceil(total/40))}`;
      $('module-cuts-previous').hidden=start===0;$('module-cuts-next').hidden=start+40>=total;
      record.result.cuts.slice(start,start+40).forEach((cut,offset)=>{
        const index=start+offset;
        const label=document.createElement('label');label.className='cut-row';
        const check=document.createElement('input');check.type='checkbox';check.checked=data.accepted.has(index);
        check.addEventListener('change',()=>{if(check.checked) data.accepted.add(index);else data.accepted.delete(index);renderJob(record);});
        const text=document.createElement('span');text.textContent=`${Number(cut.start).toFixed(2)} → ${Number(cut.end).toFixed(2)} s${cut.text ? ` · ${cut.text}`:''}`;
        label.appendChild(check);label.appendChild(text);$('module-cuts').appendChild(label);
      });
    }
    for(const artifact of record.artifacts) {
      const row=document.createElement('div');row.className='module-artifact';
      const name=document.createElement('span');name.textContent=artifact.name;name.title=artifact.path;row.appendChild(name);
      if(artifact.importable) {
        const button=document.createElement('div');button.className='module-action';button.textContent='Importer';button.setAttribute('role','button');button.setAttribute('tabindex','0');
        bind(button,async()=>{
          if(!host) throw new Error('Import disponible dans Premiere.');
          const project=await host.Project.getActiveProject();
          if(!project) throw new Error('Ouvre un projet Premiere.');
          if(!await project.importFiles([artifact.path],true,await project.getRootItem(),false)) throw new Error('Import non confirmé.');
          say('Importé dans le projet.');
        });row.appendChild(button);
      }
      if(/\.(json|txt|srt|vtt|ass|xml)$/i.test(artifact.name)) {
        const button=document.createElement('div');button.className='module-action';button.textContent='Ouvrir';button.setAttribute('role','button');button.setAttribute('tabindex','0');
        bind(button,async()=>{
          const result=await api(`module-jobs/${record.id}/artifacts/${artifact.id}`);
          openedText=result;transcriptData=null;$('module-transcript-editor').hidden=true;
          if(/(^|\/)transcription\.json$/.test(artifact.name)) {
            const data=JSON.parse(result.text);
            if(Array.isArray(data.segments)) {state().transcript=data;state().transcriptJob=record.id;transcriptData=data;transcriptPage=0;renderTranscript();$('caption-apply').hidden=active!=='captions';}
          }
          $('module-result-text').value=result.text;$('module-result-text').hidden=Boolean(transcriptData);$('module-save-text').hidden=false;
        });row.appendChild(button);
      }
      $('module-artifacts').appendChild(row);
    }
  }
  bind($('module-cuts-previous'),()=>{if(state().cutPage>0) {state().cutPage-=1;renderJob(state().job);}});
  bind($('module-cuts-next'),()=>{const data=state();if(data.job?.result?.cuts && ((data.cutPage || 0)+1)*40<data.job.result.cuts.length) {data.cutPage=(data.cutPage || 0)+1;renderJob(data.job);}});
  function renderTranscript() {
    const holder=$('module-transcript-segments');clear(holder);$('module-transcript-editor').hidden=false;
    state().transcriptPage=transcriptPage;
    const segments=transcriptData.segments,start=transcriptPage*20;
    for(const segment of segments.slice(start,start+20)) {
      const row=document.createElement('div');row.className='module-transcript-row';
      const time=document.createElement('span');time.className='module-time';time.textContent=`${Number(segment.start).toFixed(2)} s`;row.appendChild(time);
      const words=document.createElement('div');words.className='module-words';
      if(segment.words?.length) {
        for(const word of segment.words) {
          const input=document.createElement('input');input.type='text';input.value=word.text || word.word || '';
          input.setAttribute('aria-label',`Mot à ${Number(word.start).toFixed(2)} secondes`);
          input.setAttribute('size',String(Math.max(3,Math.min(24,input.value.length+1))));
          input.addEventListener('input',()=>{word.text=input.value;segment.text=segment.words.map((item)=>item.text ?? item.word ?? '').join(' ');});
          words.appendChild(input);
        }
      } else {
        const input=document.createElement('input');input.type='text';input.value=segment.text || '';input.setAttribute('aria-label','Texte du segment');
        input.addEventListener('input',()=>{segment.text=input.value;});words.appendChild(input);
      }
      row.appendChild(words);holder.appendChild(row);
    }
    $('module-transcript-page').textContent=`${transcriptPage+1}/${Math.max(1,Math.ceil(segments.length/20))}`;
    $('module-transcript-previous').hidden=transcriptPage===0;$('module-transcript-next').hidden=start+20>=segments.length;
  }
  bind($('module-transcript-previous'),()=>{if(transcriptPage>0) {transcriptPage-=1;renderTranscript();}});
  bind($('module-transcript-next'),()=>{if(transcriptData && (transcriptPage+1)*20<transcriptData.segments.length) {transcriptPage+=1;renderTranscript();}});
  async function openTranscript(record,module) {
    const data=states.get(module);
    if(data.transcript) return;
    const artifact=record.artifacts.find((item)=>/(^|\/)transcription\.json$/.test(item.name));
    if(!artifact) return;
    const result=await api(`module-jobs/${record.id}/artifacts/${artifact.id}`);
    const parsed=JSON.parse(result.text);
    if(!Array.isArray(parsed.segments) || data.job?.id!==record.id) return;
    data.transcript=parsed;data.transcriptJob=record.id;data.transcriptPage=0;
    if(active===module) {openedText=result;transcriptData=parsed;transcriptPage=0;renderTranscript();$('caption-apply').hidden=module!=='captions';$('module-save-text').hidden=false;}
  }
  async function follow(record,module) {
    while(['queued','running','cancelling'].includes(record.status)) {
      states.get(module).job=record;
      if(active===module) renderJob(record);
      await new Promise((resolve)=>setTimeout(resolve,700));
      record=await api(`module-jobs/${record.id}`);
    }
    states.get(module).job=record;
    if(active===module) {renderJob(record);await history();}
    if(record.status==='complete' && ['captions','transcription'].includes(module)) await openTranscript(record,module);
    return record;
  }
  bind($('module-file'),async()=>{
    if($('module-file').getAttribute('aria-disabled')==='true') return;
    const module=active,data=state();
    const files=await choose(Boolean(definitions.get(module).multiple));
    if(files.length) {data.paths=files.map((file)=>file.nativePath);data.transcript=null;data.job=null;if(active===module) {$('module-results').hidden=true;renderFields();}}
  });
  async function selectedSource(module=active) {
    const data=states.get(module);
    if($('module-selection').getAttribute('aria-disabled')==='true') return;
    if(!host) throw new Error('Disponible dans Premiere.');
    const project=await host.Project.getActiveProject(),sequence=project && await project.getActiveSequence();
    const selection=sequence && await sequence.getSelection();
    const items=selection ? await selection.getTrackItems():[];
    const paths=new Set();
    for(const item of items) {
      const clip=host.ClipProjectItem.cast(await item.getProjectItem());
      if(!clip || await clip.isSequence() || await clip.isOffline()) continue;
      paths.add((await clip.getMediaFilePath()).replace(/^\/{3,}/,'/'));
    }
    if(!paths.size) throw new Error('Sélectionne un média dans la timeline.');
    if(!definitions.get(module).multiple && paths.size>1) throw new Error('Sélectionne une seule source.');
    data.paths=[...paths];data.transcript=null;data.job=null;if(active===module) {$('module-results').hidden=true;renderFields();}
  }
  bind($('module-selection'),()=>selectedSource());
  bind($('module-run'),async()=>{
    if($('module-run').getAttribute('aria-disabled')==='true') return;
    const module=active,data=state();busy(true);say('Préparation…');
    try {
      if(!data.paths.length && !definitions.get(module).sourceOptional) {
        try {await selectedSource(module);} catch(_) {
          const files=await choose(Boolean(definitions.get(module).multiple));if(!files.length) return;
          data.paths=files.map((file)=>file.nativePath);if(active===module) renderFields();
        }
      }
      if(active!==module) return;
      busy(true);data.transcript=null;data.transcriptJob=null;transcriptData=null;
      const target=module==='captions' && !data.options.transcript ? 'transcription':module;
      const options=module==='captions' ? (data.options.transcript ? {...data.options,format:'srt'}:{language:data.options.language,model:data.options.model}):data.options;
      const record=await api(`modules/${target}/run`,{paths:data.paths,options});await follow(record,module);
    } finally {if(active===module) busy(false);}
  });
  bind($('caption-from-premiere'),async()=>{
    const module=active,data=state();busy(true);
    try {
      const payload=await window.NocturnzPremiereTranscript(host);
      data.paths=payload.paths;data.transcript=null;data.transcriptJob=null;renderFields();busy(true);
      await follow(await api('captions/from-premiere',payload),module);
    } finally {if(active===module) busy(false);}
  });
  bind($('caption-apply'),async()=>{
    const module=active,data=state();
    if(module!=='captions' || !data.transcriptJob || !data.transcript) return;
    busy(true);
    try {
      const record=await follow(await api(`module-jobs/${data.transcriptJob}/captions`,{
        transcript:data.transcript,style:data.options.style,format:data.options.format || 'animated'}),module);
      if(record.status!=='complete') return;
      if(active===module) busy(true);
      const artifact=record.artifacts.find((item)=>item.importable);
      if(!artifact) throw new Error('Aucun résultat importable.');
      if(!host) {say('Sous-titres générés. Import disponible dans Premiere.');return;}
      const project=await host.Project.getActiveProject();
      if(!project) throw new Error('Ouvre un projet Premiere.');
      if(!await project.importFiles([artifact.path],true,await project.getRootItem(),false)) throw new Error('Import non confirmé.');
      if(active===module) say('Sous-titres importés dans le chutier.');
    } finally {if(active===module) busy(false);}
  });
  bind($('module-cancel'),async()=>{
    if(state().job) renderJob(await api(`module-jobs/${state().job.id}/cancel`,{}));
  });
  bind($('module-review-export'),async()=>{
    const module=active,data=state();
    if(!data.job || !data.accepted.size) throw new Error('Coche les coupes à appliquer.');
    busy(true);await follow(await api(`module-jobs/${data.job.id}/review`,{accepted:[...data.accepted]}),module);
  });
  bind($('module-save-text'),async()=>{
    if(!uxp || !openedText) throw new Error('Enregistrement disponible dans Premiere.');
    const target=await uxp.storage.localFileSystem.getFileForSaving(openedText.name);
    if(target) {await target.write(transcriptData ? JSON.stringify(transcriptData,null,2):$('module-result-text').value);say('Enregistré.');}
  });
  $('module-history').addEventListener('change',async()=>{
    try {
      if(!$('module-history').value) return;
      const record=await api(`module-jobs/${$('module-history').value}`);
      const module=record.module==='reviewcuts' ? active : record.module;
      if(!definitions.has(module)) return;
      active=module;const data=state();data.transcript=null;data.paths=record.request.paths;data.options={...data.options,...record.request.options};transcriptData=null;$('tool-title').textContent=definitions.get(module).title;renderFields();renderJob(record);if(record.status==='complete') await openTranscript(record,module);
      if(['queued','running','cancelling'].includes(record.status)) follow(record,module).catch((error)=>say(error.message,true));
    } catch(error) {say(error.message,true);}
  });
  document.querySelectorAll('[data-tool]').forEach((tile)=>bind(tile,()=>{
    const module=tile.dataset.tool;
    $('module-controls').hidden=!definitions.has(module);
    if(!definitions.has(module)) {active=null;return;}
    active=module;state();transcriptData=null;$('pending-state').hidden=true;renderFields();
    $('module-results').hidden=true;$('module-review').hidden=true;busy(false);say('');
    if(state().job) {renderJob(state().job);if(state().job.status==='complete') openTranscript(state().job,module).catch((error)=>say(error.message,true));}
    history().catch((error)=>say(error.message,true));
  }));
})();
