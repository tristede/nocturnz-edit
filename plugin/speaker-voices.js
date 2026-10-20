/* Two people, two saved frames. Voice decisions never edit the source sequence. */
(() => {
  const $=(id)=>document.getElementById(id),zoom=window.NocturnzZoom,TICKS=254016000000n;
  let host=null,uxp=null,setup=null,job=null,result=null,analysisSignature=null,analysisAudio=null,busy=false,page=0;
  let people=[{name:'Intervenant 1',frame:null,reference:null},{name:'Intervenant 2',frame:null,reference:null}],wide=null;
  let saves=Promise.resolve(),poster=null,activePerson=0,drag=null,previewSerial=0;
  let samples=[],sampleIndex=0,heard=false,sampleMedia=null,listenSerial=0,generatedId=null,analysisSource=null;
  let posterTime=null,faceScanning=false,faceCancelled=false,faceSummary='';
  try {host=require('premierepro');uxp=require('uxp');} catch(_) {}
  const id=(value)=>String(value.guid),pathKey=(value)=>String(value).replace(/^\/{3,}/,'/').normalize('NFC');
  const say=(text,bad=false)=>{$('voice-status').textContent=text;$('voice-status').className='tool-status'+(bad ? ' error':'');};
  const sec=(ticks)=>Number(BigInt(ticks))/Number(TICKS);
  function disabled(value) {
    document.querySelectorAll('#speaker-voice-pending [role=button]').forEach((button)=>button.setAttribute('aria-disabled',String(value)));
    document.querySelectorAll('#speaker-voice-pending input,#speaker-voice-pending select').forEach((input)=>{input.disabled=value;});
    $('voice-cancel').hidden=!value || (!job && !faceScanning);
    $('voice-reset-preview').setAttribute('aria-disabled',String(value || !setup));
    for(const index of [0,1]) $('voice-assign-'+index).setAttribute('aria-disabled',String(value || !heard));
    $('voice-analyze').setAttribute('aria-disabled',String(value || !poster || ($('voice-mode').value==='mixed' && !people.every((person)=>person.reference))));
  }
  async function perform(action) {
    if(busy || !zoom.acquire()) return;
    busy=true;disabled(true);
    try {await action();} catch(error) {say(error.message || String(error),true);}
    finally {busy=false;disabled(false);$('voice-cancel').hidden=true;zoom.release();}
  }
  function bind(button,action,lock=true) {
    const run=()=>{if(button.getAttribute('aria-disabled')==='true') return;return lock ? perform(action):Promise.resolve().then(action).catch((error)=>say(error.message,true));};
    button.addEventListener('click',run);button.addEventListener('keydown',(event)=>{if(event.key==='Enter' || event.key===' ') {event.preventDefault();run();}});
  }
  async function api(path,payload) {
    let response;
    try {response=await fetch('http://localhost:8765/api/v1/'+path,{method:payload===undefined ? 'GET':'POST',
      headers:{'X-Nocturnz-Client':'premiere-panel',...(payload===undefined ? {}:{'Content-Type':'application/json'})},
      ...(payload===undefined ? {}:{body:JSON.stringify(payload)})});} catch(_) {throw new Error('Service local inaccessible. Lance npm run service.');}
    const data=await response.json();if(!response.ok) throw new Error(data.error || 'Analyse vocale impossible.');return data;
  }
  async function motion(item) {
    const chain=await item.getComponentChain(),params={};
    for(let i=0;i<chain.getComponentCount();i++) {
      const component=chain.getComponentAtIndex(i);if(!/motion/i.test(await component.getMatchName())) continue;
      for(let j=0;j<component.getParamCount();j++) {
        const param=component.getParam(j),name=param.displayName || '';
        if(/^scale$|^échelle$|^echelle$/i.test(name)) params.scale=param;
        if(/^uniform scale$|^échelle uniforme$|^echelle uniforme$/i.test(name)) params.uniform=param;
        if(/^position$/i.test(name)) params.position=param;
        if(/^(anchor point|point d[’']ancrage)$/i.test(name)) params.anchor=param;
        if(/^rotation$/i.test(name)) params.rotation=param;
      }
    }
    return params.scale && params.position && params.anchor && params.rotation ? params:null;
  }
  async function frame(item,frameSize) {
    const params=await motion(item);if(!params) throw new Error('Sélectionne un clip vidéo avec Trajectoire.');
    const values={frameSize:{width:frameSize.width,height:frameSize.height}};
    for(const key of ['scale','position','anchor','rotation']) {
      if(await params[key].isTimeVarying()) throw new Error('Le cadrage sélectionné est déjà animé.');
      const raw=(await params[key].getStartValue()).value;
      values[key]=['position','anchor'].includes(key) ? require('./point.cjs').readPoint(raw):Number(raw && typeof raw==='object' && 'value' in raw ? raw.value:raw);
    }
    if(!validFrame(values)) throw new Error('Cadrage illisible.');return values;
  }
  function validFrame(value) {
    return value && value.frameSize && [value.scale,value.rotation,value.position?.x,value.position?.y,value.anchor?.x,value.anchor?.y,value.frameSize.width,value.frameSize.height].every(Number.isFinite)
      && [value.position.x,value.position.y,value.anchor.x,value.anchor.y,value.rotation].every((number)=>Math.abs(number)<=1000000)
      && value.scale>0 && value.scale<=10000 && value.frameSize.width>0 && value.frameSize.height>0;
  }
  async function selection() {
    if(!host) throw new Error('Ouvre le panneau dans Premiere.');
    const project=await host.Project.getActiveProject(),sequence=project && await project.getActiveSequence();
    if(!sequence) throw new Error('Ouvre une séquence puis sélectionne la vidéo des intervenants.');
    const selected=await sequence.getSelection(),targets=[];
    for(const item of selected ? await selected.getTrackItems():[]) {
      if(!await motion(item)) continue;
      const clip=host.ClipProjectItem.cast(await item.getProjectItem());
      if(!clip || await clip.isSequence() || await clip.isOffline() || await clip.isMulticamClip() || await clip.isMergedClip() || await item.isSpeedReversed() || await item.isDisabled() || await item.isAdjustmentLayer()) throw new Error('Sélectionne des clips vidéo simples, en ligne et à vitesse normale.');
      const [start,end,sourceIn,sourceOut]=await Promise.all([item.getStartTime(),item.getEndTime(),item.getInPoint(),item.getOutPoint()]);
      if(BigInt(end.ticks)-BigInt(start.ticks)!==BigInt(sourceOut.ticks)-BigInt(sourceIn.ticks)) throw new Error('Les clips retimés ne sont pas pris en charge.');
      targets.push({item,path:pathKey(await clip.getMediaFilePath()),track:await item.getTrackIndex(),start:String(start.ticks),end:String(end.ticks),sourceIn:String(sourceIn.ticks),sourceOut:String(sourceOut.ticks)});
    }
    if(!targets.length) throw new Error('Sélectionne la vidéo à zoomer dans la timeline.');
    if(new Set(targets.map((target)=>target.path)).size!==1) throw new Error('Configure une source caméra à la fois.');
    const size=await sequence.getFrameSize();
    return {project,sequence,targets,source:targets[0].path,frameSize:{width:size.width,height:size.height},timebase:String(await sequence.getTimebase())};
  }
  const signature=(value)=>JSON.stringify([id(value.project),id(value.sequence),value.frameSize,value.timebase,
    value.targets.map(({path,track,start,end,sourceIn,sourceOut})=>[path,track,start,end,sourceIn,sourceOut]).sort()]);
  function filename(value) {
    let hash=2166136261;for(const char of value.source) {hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return `speaker-setup-${id(value.project).replace(/[^a-z0-9-]/gi,'')}-${hash>>>0}.json`;
  }
  async function save() {
    if(!setup || !uxp) return;
    const name=filename(setup),text=JSON.stringify({version:1,source:setup.source,people,wide,mode:$('voice-mode').value,
      mixedTrack:$('voice-track').value,micTracks:[0,1].map((index)=>$(`voice-mic-${index}`)?.value),
      movement:movement(),reframeCuts:$('voice-reframe-cuts').checked});
    saves=saves.catch(()=>{}).then(async()=>{const folder=await uxp.storage.localFileSystem.getDataFolder();const file=await folder.createFile(name,{overwrite:true});await file.write(text);});
    return saves;
  }
  function options(select,count,current) {
    while(select.firstChild) select.removeChild(select.firstChild);
    for(let i=0;i<count;i++) {const option=document.createElement('option');option.value=String(i);option.textContent=`A${i+1}`;select.appendChild(option);}
    select.selectedIndex=count ? Math.min(Number(current) || 0,count-1):-1;
    if(count) select.value=String(select.selectedIndex);
  }
  async function load() {
    const next=await selection();
    const changed=!setup || filename(next)!==filename(setup);
    setup=next;result=null;analysisSignature=null;$('voice-result').hidden=true;
    $('voice-reset-preview').hidden=false;
    const count=await setup.sequence.getAudioTrackCount();
    let savedWide=false;
    if(changed) {
      people=[{name:'Intervenant 1',frame:null,reference:null},{name:'Intervenant 2',frame:null,reference:null}];
      wide=await frame(setup.targets[0].item,setup.frameSize);
      await saves.catch(()=>{});
      let data=null;
      try {const folder=await uxp.storage.localFileSystem.getDataFolder();const file=await folder.getEntry(filename(setup));const text=await file.read();if(text.length<100000) data=JSON.parse(text);} catch(_) {}
      if(data?.version===1 && data.source===setup.source && Array.isArray(data.people) && data.people.length===2) {
        people=data.people.map((person,index)=>({name:String(person.name || `Intervenant ${index+1}`).slice(0,80),frame:validFrame(person.frame) ? person.frame:null,
          crop:person.crop,reference:person.reference && typeof person.reference.path==='string' && Number.isFinite(person.reference.start) && Number.isFinite(person.reference.end) ? person.reference:null}));
        if(validFrame(data.wide)) {wide=data.wide;savedWide=true;}
        if(['in','out','jump','alternate'].includes(data.movement?.motion)) $('voice-motion').value=data.movement.motion;
        for(const input of document.querySelectorAll('[data-voice-motion]')) input.checked=data.movement?.types ? data.movement.types.includes(input.dataset.voiceMotion):true;
        if([300,600,1200].includes(data.movement?.duration)) $('voice-motion-duration').value=String(data.movement.duration);
        $('voice-reframe-cuts').checked=data.reframeCuts===true;
      }
      $('voice-motion-mix').hidden=$('voice-motion').value!=='alternate';
      if(!savedWide) wide=null;
      samples=[];poster=null;$('voice-visual').hidden=true;stopListening();$('voice-listen-panel').hidden=true;
      options($('voice-track'),count,data?.mixedTrack || 0);
      renderPeople(count,data?.micTracks);
    } else {options($('voice-track'),count,$('voice-track').value);renderPeople(count);}
    const times=setup.targets.flatMap((target)=>[sec(target.start),sec(target.end)]);
    $('voice-preview-time').min=String(Math.min(...times));$('voice-preview-time').max=String(Math.max(...times));
    if(changed) $('voice-preview-time').value=String(sec(setup.targets[0].start)+Math.min(2,(sec(setup.targets[0].end)-sec(setup.targets[0].start))/2));
    await refreshPreview();$('voice-visual').hidden=false;$('voice-load').textContent='Changer la vidéo';$('voice-load').className='text-action voice-change-source';
    drawEditor();say('');
  }
  async function ensure() {
    const current=await selection();
    if(!setup || filename(current)!==filename(setup)) await load();
    else setup=current;
    return setup;
  }
  async function audioRows(track,speaker,current) {
    if(!Number.isInteger(track) || track<0 || track>=await current.sequence.getAudioTrackCount()) throw new Error('Choisis une piste audio.');
    const audio=await current.sequence.getAudioTrack(track),rows=[];
    if(typeof audio.isMuted==='function' && await audio.isMuted()) throw new Error(`La piste A${track+1} est muette.`);
    const min=Math.min(...current.targets.map((target)=>sec(target.start))),max=Math.max(...current.targets.map((target)=>sec(target.end)));
    for(const item of await audio.getTrackItems(1,false)) {
      const [a,b,c,d]=await Promise.all([item.getStartTime(),item.getEndTime(),item.getInPoint(),item.getOutPoint()]);
      if(sec(b.ticks)<=min || sec(a.ticks)>=max) continue;
      const clip=host.ClipProjectItem.cast(await item.getProjectItem());
      if(!clip || await clip.isSequence() || await clip.isOffline() || await item.isSpeedReversed() || await item.isDisabled() || BigInt(b.ticks)-BigInt(a.ticks)!==BigInt(d.ticks)-BigInt(c.ticks)) throw new Error('La piste voix contient un clip composé, désactivé ou retimé.');
      rows.push({path:pathKey(await clip.getMediaFilePath()),start:sec(a.ticks),end:sec(b.ticks),sourceIn:sec(c.ticks),speaker});
    }
    if(!rows.length) throw new Error(`Aucune voix sur A${track+1} dans la plage vidéo sélectionnée.`);
    return rows;
  }
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  function cropFor(index) {
    const person=people[index];let crop=person.crop;
    if(!crop && validFrame(person.frame) && validFrame(wide)) {
      const r=wide.scale/person.frame.scale;
      crop={r,x:wide.position.x+(.5-person.frame.position.x)*r,y:wide.position.y+(.5-person.frame.position.y)*r};
    }
    if(!crop || ![crop.r,crop.x,crop.y].every(Number.isFinite)) crop={r:.6,x:index ? .7:.3,y:.5};
    crop.r=clamp(crop.r,.25,1);crop.x=clamp(crop.x,crop.r/2,1-crop.r/2);crop.y=clamp(crop.y,crop.r/2,1-crop.r/2);
    person.crop=crop;return crop;
  }
  function syncFrame(index) {
    if(!validFrame(wide)) return;
    const crop=cropFor(index);
    people[index].frame={...wide,scale:wide.scale/crop.r,position:{x:.5+(wide.position.x-crop.x)/crop.r,y:.5+(wide.position.y-crop.y)/crop.r},
      anchor:{...wide.anchor},frameSize:{...wide.frameSize}};
  }
  function stageSize() {
    if(!setup) return;
    const stage=$('voice-stage'),width=stage.clientWidth || 300;
    stage.style.height=`${Math.round(width*setup.frameSize.height/setup.frameSize.width)}px`;
    document.querySelectorAll('.voice-thumb').forEach((thumb)=>{thumb.style.height=`${Math.round((thumb.clientWidth || 130)*setup.frameSize.height/setup.frameSize.width)}px`;});
  }
  function drawEditor() {
    if(!validFrame(wide)) return;
    for(const index of [0,1]) {
      syncFrame(index);const crop=cropFor(index),box=document.querySelector(`.voice-crop[data-person="${index}"]`);
      box.style.left=`${100*(crop.x-crop.r/2)}%`;box.style.top=`${100*(crop.y-crop.r/2)}%`;box.style.width=`${100*crop.r}%`;box.style.height=`${100*crop.r}%`;
      box.classList.toggle('is-active',index===activePerson);box.setAttribute('aria-pressed',String(index===activePerson));box.querySelector('span').textContent=people[index].name;
      const card=$('voice-person-'+index);if(card) card.classList.toggle('is-active',index===activePerson);
      const image=$('voice-thumb-'+index);
      if(image && poster) {image.src=poster;image.style.width=`${100/crop.r}%`;image.style.height=`${100/crop.r}%`;image.style.left=`${-100*(crop.x-crop.r/2)/crop.r}%`;image.style.top=`${-100*(crop.y-crop.r/2)/crop.r}%`;}
      const badge=$('voice-ready-'+index);if(badge) badge.textContent=people[index].reference ? '✓ Voix associée':'Voix à associer';
      $('voice-assign-'+index).textContent=people[index].name;
    }
    $('voice-crop-title').textContent=`Zoom · ${people[activePerson].name}`;
    $('voice-crop-zoom').value=String(Math.round(100/cropFor(activePerson).r));$('voice-crop-value').textContent=$('voice-crop-zoom').value+' %';
    $('voice-identify').textContent=people.every((person)=>person.reference) ? 'Modifier les voix':'Identifier les deux voix';
    stageSize();
  }
  async function refreshPreview() {
    if(!setup) return;
    const serial=++previewSerial,current=setup;
    let time=Number($('voice-preview-time').value);
    let target=current.targets.find((item)=>sec(item.start)<=time && time<sec(item.end));
    if(!target) {
      target=[...current.targets].sort((a,b)=>Math.min(Math.abs(time-sec(a.start)),Math.abs(time-sec(a.end)))-Math.min(Math.abs(time-sec(b.start)),Math.abs(time-sec(b.end))))[0];
      time=clamp(time,sec(target.start),Math.max(sec(target.start),sec(target.end)-sec(current.timebase)));$('voice-preview-time').value=String(time);
    }
    say('Chargement de l’image…');
    let timer;
    const request=api('zooms/preview',{path:target.path,time:sec(target.sourceIn)+time-sec(target.start),size:current.frameSize,frame:validFrame(wide) ? wide:null});
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{previewSerial++;reject(new Error('L’aperçu ne répond pas. Clique sur Recharger l’aperçu.'));},45000);});
    let response;try {response=await Promise.race([request,timeout]);} finally {clearTimeout(timer);}
    if(serial!==previewSerial || current!==setup) return;
    poster=response.image;posterTime=sec(target.sourceIn)+time-sec(target.start);wide=response.frame;$('voice-poster').src=poster;
    $('voice-preview-clock').textContent=clock(time);drawEditor();say('');
  }
  async function resetPreview() {
    if(!setup) return;
    drag=null;previewSerial++;
    $('voice-poster').removeAttribute('src');
    for(const index of [0,1]) $('voice-thumb-'+index)?.removeAttribute('src');
    try {await refreshPreview();$('voice-visual').hidden=false;drawEditor();}
    catch(error) {if(poster) {$('voice-poster').src=poster;drawEditor();}throw error;}
  }
  function movement() {
    return {motion:$('voice-motion').value,duration:Number($('voice-motion-duration').value),
      types:[...document.querySelectorAll('[data-voice-motion]')].filter((input)=>input.checked).map((input)=>input.dataset.voiceMotion)};
  }
  async function cutFrames(current) {
    const frames=current.targets.map(()=>people.map((person)=>person.frame));faceSummary='';
    if(!$('voice-reframe-cuts').checked) return frames;
    if(!Number.isFinite(posterTime)) throw new Error('Recharge l’aperçu avant le recalage.');
    faceScanning=true;faceCancelled=false;disabled(true);
    try {
      const detect=(target,time)=>api('zooms/faces',{path:target.path,time,size:current.frameSize,frame:wide});
      say('Repérage des visages…');
      const reference=(await detect({path:current.source},posterTime)).faces;
      const crops=[0,1].map((index)=>({...cropFor(index)}));
      const anchors=crops.map((crop)=>{
        const inside=reference.filter((face)=>Math.abs(face.x-crop.x)<crop.r/2 && Math.abs(face.y-crop.y)<crop.r/2);
        // Two visible faces inside one crop are ambiguous. Keep the manual frame.
        return inside.length===1 ? inside[0]:null;
      });
      if(anchors[0]===anchors[1]) anchors.fill(null);
      let adjusted=0,fallback=0;
      const cache=new Map();
      for(let index=0;index<current.targets.length;index++) {
        if(faceCancelled) throw new Error('Recalage annulé. Aucune séquence créée.');
        say(`Recalage aux cuts · ${index+1}/${current.targets.length}`);
        const target=current.targets[index],moment=sec(target.sourceIn)+Math.min(.12,(sec(target.sourceOut)-sec(target.sourceIn))/2),key=target.path+'|'+moment;
        if(!cache.has(key)) cache.set(key,(await detect(target,moment)).faces);
        const faces=cache.get(key),matches=anchors.map((anchor)=>{
          if(!anchor) return null;
          const candidates=faces.filter((face)=>Math.hypot(face.x-anchor.x,face.y-anchor.y)<.18 && face.w/anchor.w>.65 && face.w/anchor.w<1.5)
            .map((face)=>({face,score:face.descriptor.reduce((sum,value,i)=>sum+value*anchor.descriptor[i],0)})).sort((a,b)=>b.score-a.score);
          // This is conservative visual matching, not facial identity recognition.
          return candidates[0]?.score>.72 && (!candidates[1] || candidates[0].score-candidates[1].score>.12) ? candidates[0].face:null;
        });
        if(matches[0] && matches[0]===matches[1]) matches.fill(null);
        frames[index]=matches.map((face,person)=>{
          if(!face) {fallback++;return people[person].frame;}
          const crop=crops[person],anchor=anchors[person],x=clamp(crop.x+face.x-anchor.x,crop.r/2,1-crop.r/2),y=clamp(crop.y+face.y-anchor.y,crop.r/2,1-crop.r/2);
          adjusted++;return {...people[person].frame,position:{x:.5+(wide.position.x-x)/crop.r,y:.5+(wide.position.y-y)/crop.r}};
        });
      }
      if(faceCancelled) throw new Error('Recalage annulé. Aucune séquence créée.');
      faceSummary=` · ${adjusted} cadrage(s) repéré(s), ${fallback} conservé(s)`;
      return frames;
    } finally {faceScanning=false;disabled(true);}
  }
  function clock(value) {const seconds=Math.floor(value);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
  function stopListening() {
    listenSerial++;
    try {$('voice-listener').pause();} catch(_) {}
    heard=false;sampleMedia=null;$('voice-listen').textContent='▶ Écouter l’extrait';
  }
  function renderPeople(count=0,tracks) {
    tracks=tracks || [0,1].map((index)=>$(`voice-mic-${index}`)?.value ?? index);
    const holder=$('voice-people');while(holder.firstChild) holder.removeChild(holder.firstChild);
    const mixed=$('voice-mode').value==='mixed';$('voice-mixed-track').hidden=!mixed;$('voice-identify').hidden=!mixed;
    people.forEach((person,index)=>{
      const card=document.createElement('section');card.className='voice-person';card.id='voice-person-'+index;
      const thumb=document.createElement('div');thumb.className='voice-thumb';thumb.setAttribute('role','button');thumb.setAttribute('tabindex','0');thumb.setAttribute('aria-label',`Régler le cadrage de ${person.name}`);
      const image=document.createElement('img');image.id='voice-thumb-'+index;image.alt=`Aperçu du cadrage ${index+1}`;image.draggable=false;thumb.appendChild(image);
      bind(thumb,()=>{if(!busy) {activePerson=index;drawEditor();}},false);card.appendChild(thumb);
      const name=document.createElement('input');name.type='text';name.value=person.name;name.maxLength=80;name.setAttribute('aria-label',`Nom de l’intervenant ${index+1}`);
      name.addEventListener('focus',()=>{activePerson=index;drawEditor();});
      name.addEventListener('input',()=>{person.name=name.value.slice(0,80);drawEditor();save().catch((error)=>say(error.message,true));});card.appendChild(name);
      if(mixed) {const badge=document.createElement('span');badge.className='voice-ready';badge.id='voice-ready-'+index;card.appendChild(badge);}
      else {
        const label=document.createElement('label');label.className='muted';label.textContent='Micro';
        const select=document.createElement('select');select.id=`voice-mic-${index}`;select.setAttribute('aria-label',`Micro de ${person.name}`);options(select,count,tracks[index]);
        select.addEventListener('change',()=>{invalidate();save().catch((error)=>say(error.message,true));});label.appendChild(select);card.appendChild(label);
      }
      holder.appendChild(card);
    });
    drawEditor();disabled(busy);
  }
  async function waitJob(record) {
    job=record.id;$('voice-cancel').hidden=false;
    while(['queued','running','cancelling'].includes(record.status)) {
      say(`${record.message || 'Analyse locale…'} · ${record.progress || 0} %`);
      await new Promise((resolve)=>setTimeout(resolve,700));record=await api(`module-jobs/${job}`);
    }
    if(record.status!=='complete') {job=null;throw new Error(record.error || 'Analyse annulée.');}
    job=null;$('voice-cancel').hidden=true;return record.result;
  }
  async function identify() {
    await ensure();stopListening();
    const current=await selection(),audio=await audioRows(Number($('voice-track').value),0,current);
    const response=await waitJob(await api('zooms/speakers/samples',{mode:'mixed',audio,
      start:Math.min(...current.targets.map((target)=>sec(target.start))),end:Math.max(...current.targets.map((target)=>sec(target.end)))}));
    samples=response.samples;sampleIndex=0;$('voice-listen-panel').hidden=false;renderSample();say('Écoute l’extrait, puis choisis la personne.');
  }
  function renderSample() {
    stopListening();
    $('voice-sample-count').textContent=`${sampleIndex+1}/${samples.length}`;
    for(const index of [0,1]) {$('voice-assign-'+index).textContent=people[index].name;$('voice-assign-'+index).setAttribute('aria-disabled','true');}
  }
  async function listen() {
    const sample=samples[sampleIndex];if(!sample) return;
    const player=$('voice-listener'),serial=listenSerial;
    if(!sampleMedia) {
      const response=await api('zooms/listen',{path:sample.path,time:sample.start,duration:sample.end-sample.start});
      if(serial!==listenSerial || $('voice-listen-panel').hidden || $('tool-view').hidden) return;
      sampleMedia='http://localhost:8765'+response.media;player.src=sampleMedia;player.load();
    } else {player.currentTime=0;}
    if(typeof player.play!=='function') throw new Error('Le lecteur intégré n’est pas disponible dans cet hôte Premiere.');
    await player.play();
  }
  async function assign(index) {
    if(busy || !heard) return;
    const sample=samples[sampleIndex];if(!sample) return;
    invalidate();people[index].reference={path:sample.path,start:sample.start,end:sample.end};
    stopListening();await save();drawEditor();
    if(people.every((person)=>person.reference)) {$('voice-listen-panel').hidden=true;say('Les deux voix sont associées.');}
    else {sampleIndex=(sampleIndex+1)%samples.length;renderSample();say('Écoute maintenant l’autre voix.');}
    disabled(false);
  }
  function invalidate() {result=null;analysisSignature=null;analysisAudio=null;$('voice-result').hidden=true;}
  function renderTurns() {
    const holder=$('voice-turns');while(holder.firstChild) holder.removeChild(holder.firstChild);
    const turns=result.turns;
    for(const turn of turns.slice(page*30,page*30+30)) {
      const row=document.createElement('div');row.className='voice-turn';
      const time=document.createElement('span');time.textContent=`${turn.start.toFixed(1)} → ${turn.end.toFixed(1)} s`;row.appendChild(time);
      const select=document.createElement('select');select.setAttribute('aria-label',`Intervenant à ${turn.start.toFixed(1)} secondes`);
      for(const [value,name] of [[-1,'Plan large'],[0,people[0].name],[1,people[1].name]]) {const option=document.createElement('option');option.value=String(value);option.textContent=name;select.appendChild(option);}
      select.selectedIndex=turn.speaker+1;select.value=String(turn.speaker);select.addEventListener('change',()=>{turn.speaker=Number(select.value);});row.appendChild(select);holder.appendChild(row);
    }
    $('voice-page').textContent=`${page+1}/${Math.max(1,Math.ceil(turns.length/30))}`;
    $('voice-previous').hidden=page===0;$('voice-next').hidden=(page+1)*30>=turns.length;
  }
  async function analyze() {
    await restoreSourceSelection();
    await ensure();invalidate();
    const config=movement();if(config.motion==='alternate' && !config.types.length) throw new Error('Choisis au moins un type de zoom.');
    if(!people.every((person)=>validFrame(person.frame)) || !validFrame(wide)) throw new Error('Place les deux cadres sur l’image avant de lancer.');
    const current=await selection(),mode=$('voice-mode').value;
    let audio;
    if(mode==='mixed') {
      if(!people.every((person)=>person.reference)) throw new Error('Écoute les extraits et associe les deux voix.');
      audio=await audioRows(Number($('voice-track').value),0,current);
    } else {
      const tracks=[0,1].map((index)=>Number($(`voice-mic-${index}`).value));
      if(tracks[0]===tracks[1]) throw new Error('Choisis deux pistes micros différentes.');
      audio=[...await audioRows(tracks[0],0,current),...await audioRows(tracks[1],1,current)];
    }
    analysisSignature=signature(current);analysisSource=current;
    analysisAudio={signature:JSON.stringify(audio),mode,tracks:mode==='mixed' ? [Number($('voice-track').value)]:[0,1].map((index)=>Number($(`voice-mic-${index}`).value))};
    const payload={mode,audio,references:people.map((person)=>person.reference),start:Math.min(...current.targets.map((target)=>sec(target.start))),end:Math.max(...current.targets.map((target)=>sec(target.end)))};
    const detected=await waitJob(await api('zooms/speakers/analyze',payload));
    result=detected;page=0;renderTurns();$('voice-result').hidden=false;
    $('voice-summary').textContent=`${result.turns.filter((turn)=>turn.speaker!==-1).length} prises de parole · ${result.unknownSeconds.toFixed(1)} s en plan large`;
    await apply();
  }
  async function apply() {
    if(!result) throw new Error('Détecte les prises de parole.');
    await restoreSourceSelection();
    const current=await selection();if(signature(current)!==analysisSignature) throw new Error('La sélection ou le montage a changé. Relance l’analyse.');
    const audio=analysisAudio.mode==='mixed' ? await audioRows(analysisAudio.tracks[0],0,current):[...await audioRows(analysisAudio.tracks[0],0,current),...await audioRows(analysisAudio.tracks[1],1,current)];
    if(JSON.stringify(audio)!==analysisAudio.signature) throw new Error('Le montage audio a changé. Relance l’analyse.');
    for(const person of [...people,{frame:wide}]) if(!validFrame(person.frame) || person.frame.frameSize.width!==current.frameSize.width || person.frame.frameSize.height!==current.frameSize.height) throw new Error('Les dimensions ont changé. Reprends les cadrages.');
    for(const target of current.targets) await frame(target.item,current.frameSize);
    const config=movement(),frames=await cutFrames(current);
    const changes=require('./speaker-movement.cjs').plan(current.targets,result.turns,wide,frames,current.timebase,config);
    if(changes.reduce((sum,points)=>sum+points.length,0)>12000) throw new Error('Plus de 12 000 images clés. Traite une sélection plus courte.');
    // Recheck after potentially long face analysis, before any sequence is created.
    if(signature(await selection())!==analysisSignature) throw new Error('La sélection a changé pendant le recalage. Relance l’analyse.');
    const latestAudio=analysisAudio.mode==='mixed' ? await audioRows(analysisAudio.tracks[0],0,current):[...await audioRows(analysisAudio.tracks[0],0,current),...await audioRows(analysisAudio.tracks[1],1,current)];
    if(JSON.stringify(latestAudio)!==analysisAudio.signature) throw new Error('Le montage audio a changé pendant le recalage. Relance l’analyse.');
    for(const target of current.targets) await frame(target.item,current.frameSize);
    const copier=require('./sequence-copy.cjs').withHost(host),draft=await copier.create(current.project,current.sequence,current.targets.map((target)=>target.item));
    generatedId=id(draft.sequence);
    const params=await Promise.all(draft.items.map(motion));if(params.some((value)=>!value)) throw new Error('Trajectoire absente dans la copie.');
    await copier.assertCopy(current.project,draft);
    let committed=false;
    current.project.lockedAccess(()=>{
      const actions=[draft.projectItem.createSetNameAction(draft.name.replace('Zooms','Intervenants'))];
      for(let index=0;index<changes.length;index++) {
        if(params[index].uniform) actions.push(params[index].uniform.createSetValueAction(params[index].uniform.createKeyframe(true),true));
        for(const name of ['scale','position','anchor','rotation']) {
          const param=params[index][name];actions.push(param.createSetTimeVaryingAction(true));
          for(const [ticks,point] of changes[index]) {
            const value=point.value;
            const v=['position','anchor'].includes(name) ? new host.PointF(value[name].x,value[name].y):value[name];
            const key=param.createKeyframe(v);key.position=host.TickTime.createWithTicks(ticks);
            actions.push(param.createAddKeyframeAction(key));actions.push(param.createSetInterpolationAtKeyframeAction(key.position,point.linear ? host.Constants.InterpolationMode.LINEAR:host.Constants.InterpolationMode.HOLD,true));
          }
        }
      }
      committed=current.project.executeTransaction((compound)=>{for(const action of actions) if(!compound.addAction(action)) throw new Error('Une action de zoom a été refusée.');},'Nocturnz/Edit — Zooms des intervenants');
    });
    if(!committed) throw new Error('Application non confirmée. La séquence source reste intacte.');
    generatedId=id(draft.sequence);say('Zooms créés dans une nouvelle séquence.'+faceSummary);
  }
  async function restoreSourceSelection() {
    if(!analysisSource) return;
    const project=await host.Project.getActiveProject(),sequence=project && await project.getActiveSequence();
    if(!project || id(project)!==id(analysisSource.project)) throw new Error('Reviens au projet analysé.');
    if(sequence && id(sequence)===generatedId) {
      if(!await project.openSequence(analysisSource.sequence) || !await project.setActiveSequence(analysisSource.sequence)) throw new Error('La séquence source ne peut pas être retrouvée.');
      host.TrackItemSelection.createEmptySelection((selected)=>{for(const target of analysisSource.targets) selected.addItem(target.item,true);analysisSource.sequence.setSelection(selected);});
    }
  }
  function editCrop(x,y,r) {
    if(busy || !poster) return;
    const crop=cropFor(activePerson);crop.r=clamp(r ?? crop.r,.25,1);
    crop.x=clamp(x ?? crop.x,crop.r/2,1-crop.r/2);crop.y=clamp(y ?? crop.y,crop.r/2,1-crop.r/2);
    drawEditor();
  }
  const stage=$('voice-stage');
  stage.addEventListener('mousedown',(event)=>{
    if(busy || !poster || (event.button!==undefined && event.button!==0)) return;
    let node=event.target,index=null,resize=false;
    while(node && node!==stage) {if(node.dataset?.resize!==undefined) resize=true;if(node.dataset?.person!==undefined) index=Number(node.dataset.person);node=node.parentNode;}
    if(index!==null) activePerson=index;
    const rect=stage.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(index===null) editCrop(x,y);
    const crop=cropFor(activePerson);drag={rect,x,y,crop:{...crop},resize};drawEditor();event.preventDefault();
  });
  document.addEventListener('mousemove',(event)=>{
    if(!drag || busy) return;
    const x=(event.clientX-drag.rect.left)/drag.rect.width,y=(event.clientY-drag.rect.top)/drag.rect.height;
    if(drag.resize) editCrop(drag.crop.x,drag.crop.y,drag.crop.r+2*(x-drag.x));
    else editCrop(drag.crop.x+x-drag.x,drag.crop.y+y-drag.y);
    event.preventDefault();
  });
  document.addEventListener('mouseup',()=>{if(drag) {drag=null;save().catch((error)=>say(error.message,true));}});
  document.querySelectorAll('.voice-crop').forEach((box)=>box.addEventListener('keydown',(event)=>{
    if(busy || !poster) return;
    activePerson=Number(box.dataset.person);const crop=cropFor(activePerson),step=event.shiftKey ? .05:.01;
    if(event.key==='ArrowLeft') editCrop(crop.x-step,crop.y);
    else if(event.key==='ArrowRight') editCrop(crop.x+step,crop.y);
    else if(event.key==='ArrowUp') editCrop(crop.x,crop.y-step);
    else if(event.key==='ArrowDown') editCrop(crop.x,crop.y+step);
    else if(event.key==='+' || event.key==='=') editCrop(crop.x,crop.y,crop.r-.03);
    else if(event.key==='-') editCrop(crop.x,crop.y,crop.r+.03);
    else if(event.key==='Enter' || event.key===' ') drawEditor();
    else return;
    event.preventDefault();save().catch((error)=>say(error.message,true));
  }));
  $('voice-crop-zoom').addEventListener('input',()=>editCrop(null,null,100/Number($('voice-crop-zoom').value)));
  $('voice-crop-zoom').addEventListener('change',()=>save().catch((error)=>say(error.message,true)));
  document.querySelectorAll('[data-crop-size]').forEach((button)=>bind(button,()=>{editCrop(null,null,Number(button.dataset.cropSize));return save();},false));
  $('voice-preview-time').addEventListener('change',()=>perform(refreshPreview));
  window.addEventListener('resize',stageSize);
  document.querySelectorAll('[data-tool],[data-zoom-mode],[data-speaker-source]').forEach((button)=>button.addEventListener('click',()=>{stopListening();setTimeout(stageSize,0);}));
  document.querySelectorAll('[data-home]').forEach((button)=>button.addEventListener('click',stopListening));
  $('open-settings').addEventListener('click',stopListening);
  $('voice-listener').addEventListener('play',()=>{if(!sampleMedia || $('voice-listener').src!==sampleMedia) return;heard=true;disabled(busy);$('voice-listen').textContent='↻ Réécouter';});
  $('voice-listener').addEventListener('error',()=>{if(!sampleMedia) return;heard=false;disabled(busy);say('Lecture audio impossible. Relance l’écoute de l’extrait.',true);sampleMedia=null;});
  bind($('voice-reset-preview'),resetPreview);
  bind($('voice-load'),load);bind($('voice-identify'),identify);bind($('voice-listen'),listen);
  for(const index of [0,1]) bind($('voice-assign-'+index),()=>assign(index),false);
  bind($('voice-skip'),()=>{if(busy || !samples.length) return;sampleIndex=(sampleIndex+1)%samples.length;renderSample();},false);
  bind($('voice-analyze'),analyze);bind($('voice-apply'),apply);
  bind($('voice-cancel'),async()=>{faceCancelled=true;if(job) await api(`module-jobs/${job}/cancel`,{});},false);
  bind($('voice-previous'),()=>{if(!busy && page>0) {page--;renderTurns();}},false);
  bind($('voice-next'),()=>{if(!busy && result && (page+1)*30<result.turns.length) {page++;renderTurns();}},false);
  $('voice-mode').addEventListener('change',()=>{invalidate();stopListening();$('voice-listen-panel').hidden=true;renderPeople(setup ? $('voice-track').children.length:0);save().catch((error)=>say(error.message,true));});
  $('voice-track').addEventListener('change',()=>{invalidate();stopListening();samples=[];$('voice-listen-panel').hidden=true;people.forEach((person)=>{person.reference=null;});renderPeople($('voice-track').children.length);save().catch((error)=>say(error.message,true));});
  $('voice-motion').addEventListener('change',()=>{$('voice-motion-mix').hidden=$('voice-motion').value!=='alternate';save().catch((error)=>say(error.message,true));});
  for(const input of [...document.querySelectorAll('[data-voice-motion]'),$('voice-motion-duration'),$('voice-reframe-cuts')]) input.addEventListener('change',()=>save().catch((error)=>say(error.message,true)));
  $('voice-poster').addEventListener('error',()=>{if(poster) say('Affichage interrompu. Clique sur Recharger l’aperçu.',true);});
  renderPeople();
})();
