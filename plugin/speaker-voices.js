/* Two people, two saved frames. Voice decisions never edit the source sequence. */
(() => {
  const $=(id)=>document.getElementById(id),zoom=window.NocturnzZoom,TICKS=254016000000n;
  let host=null,uxp=null,setup=null,job=null,result=null,analysisSignature=null,analysisAudio=null,busy=false,page=0;
  let people=[{name:'Intervenant 1',frame:null,reference:null},{name:'Intervenant 2',frame:null,reference:null}],wide=null;
  let saves=Promise.resolve();
  try {host=require('premierepro');uxp=require('uxp');} catch(_) {}
  const id=(value)=>String(value.guid),pathKey=(value)=>String(value).replace(/^\/{3,}/,'/').normalize('NFC');
  const say=(text,bad=false)=>{$('voice-status').textContent=text;$('voice-status').className='tool-status'+(bad ? ' error':'');};
  const sec=(ticks)=>Number(BigInt(ticks))/Number(TICKS);
  function disabled(value) {
    document.querySelectorAll('#speaker-voice-pending [role=button]').forEach((button)=>button.setAttribute('aria-disabled',String(value)));
    document.querySelectorAll('#speaker-voice-pending input,#speaker-voice-pending select').forEach((input)=>{input.disabled=value;});
    $('voice-cancel').hidden=!value || !job;
  }
  async function perform(action) {
    if(busy || !zoom.acquire()) return;
    busy=true;disabled(true);
    try {await action();} catch(error) {say(error.message || String(error),true);}
    finally {busy=false;disabled(false);$('voice-cancel').hidden=true;zoom.release();}
  }
  function bind(button,action,lock=true) {
    const run=()=>lock ? perform(action):Promise.resolve().then(action).catch((error)=>say(error.message,true));
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
        if(/^(uniform )?scale$|^échelle( uniforme)?$|^echelle( uniforme)?$/i.test(name)) params.scale=param;
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
      mixedTrack:$('voice-track').value,micTracks:[0,1].map((index)=>$(`voice-mic-${index}`)?.value)});
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
    const count=await setup.sequence.getAudioTrackCount();
    if(changed) {
      people=[{name:'Intervenant 1',frame:null,reference:null},{name:'Intervenant 2',frame:null,reference:null}];
      wide=await frame(setup.targets[0].item,setup.frameSize);
      await saves.catch(()=>{});
      let data=null;
      try {const folder=await uxp.storage.localFileSystem.getDataFolder();const file=await folder.getEntry(filename(setup));const text=await file.read();if(text.length<100000) data=JSON.parse(text);} catch(_) {}
      if(data?.version===1 && data.source===setup.source && Array.isArray(data.people) && data.people.length===2) {
        people=data.people.map((person,index)=>({name:String(person.name || `Intervenant ${index+1}`).slice(0,80),frame:validFrame(person.frame) ? person.frame:null,
          reference:person.reference && typeof person.reference.path==='string' && Number.isFinite(person.reference.start) && Number.isFinite(person.reference.end) ? person.reference:null}));
        if(validFrame(data.wide)) wide=data.wide;
      }
      options($('voice-track'),count,data?.mixedTrack || 0);
      renderPeople(count,data?.micTracks);
    } else {options($('voice-track'),count,$('voice-track').value);renderPeople(count);}
    say(`${setup.targets.length} clip(s) · ${setup.source.split('/').pop()}`);
  }
  async function ensure() {
    const current=await selection();
    if(!setup || filename(current)!==filename(setup)) await load();
    else setup=current;
    return setup;
  }
  async function capture(index) {
    await ensure();
    const current=await selection();
    if(current.targets.length!==1) throw new Error('Sélectionne un seul clip cadré pour mémoriser ce plan.');
    const value=await frame(current.targets[0].item,current.frameSize);
    if(index===-1) wide=value;else people[index].frame=value;
    await save();renderPeople(await setup.sequence.getAudioTrackCount());say(index===-1 ? 'Plan large mémorisé.':'Cadrage mémorisé.');
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
  async function reference(index) {
    await ensure();
    const time=sec((await setup.sequence.getPlayerPosition()).ticks);
    const rows=await audioRows(Number($('voice-track').value),0,setup);
    const matches=rows.filter((row)=>row.start<=time && time<row.end);
    if(matches.length!==1) throw new Error('Place le curseur sur une réplique seule, dans la sélection vidéo.');
    const row=matches[0],end=Math.min(row.end,time+3),start=Math.max(row.start,end-3);
    if(end-start<2) throw new Error('Choisis une réplique d’au moins deux secondes.');
    invalidate();people[index].reference={path:row.path,start:row.sourceIn+start-row.start,end:row.sourceIn+end-row.start};
    await save();renderPeople(await setup.sequence.getAudioTrackCount());say('Réplique de référence mémorisée.');
  }
  function renderPeople(count=0,tracks) {
    tracks=tracks || [0,1].map((index)=>$(`voice-mic-${index}`)?.value ?? index);
    const holder=$('voice-people');while(holder.firstChild) holder.removeChild(holder.firstChild);
    const mixed=$('voice-mode').value==='mixed';$('voice-mixed-track').hidden=!mixed;
    people.forEach((person,index)=>{
      const card=document.createElement('section');card.className='voice-person';
      const name=document.createElement('input');name.type='text';name.value=person.name;name.maxLength=80;name.setAttribute('aria-label',`Nom de l’intervenant ${index+1}`);
      name.addEventListener('input',()=>{person.name=name.value.slice(0,80);save().catch((error)=>say(error.message,true));});card.appendChild(name);
      const framing=document.createElement('div');framing.className='button button-secondary';framing.setAttribute('role','button');framing.setAttribute('tabindex','0');framing.textContent=person.frame ? `Cadrage · ${person.frame.scale.toFixed(0)} %`:'Mémoriser son cadrage';bind(framing,()=>capture(index));card.appendChild(framing);
      if(mixed) {
        const button=document.createElement('div');button.className='text-action';button.setAttribute('role','button');button.setAttribute('tabindex','0');button.textContent=person.reference ? 'Voix repérée · reprendre au curseur':'Repérer sa voix au curseur';bind(button,()=>reference(index));card.appendChild(button);
      } else {
        const label=document.createElement('label');label.className='muted';label.textContent='Micro';
        const select=document.createElement('select');select.id=`voice-mic-${index}`;select.setAttribute('aria-label',`Piste micro de ${person.name}`);options(select,count,tracks[index]);
        select.addEventListener('change',()=>{invalidate();save().catch((error)=>say(error.message,true));});label.appendChild(select);card.appendChild(label);
      }
      holder.appendChild(card);
    });
    disabled(busy);
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
    await ensure();invalidate();
    if(!people.every((person)=>validFrame(person.frame)) || !validFrame(wide)) throw new Error('Mémorise les deux cadrages avant de lancer.');
    const current=await selection(),mode=$('voice-mode').value;
    let audio;
    if(mode==='mixed') {
      if(!people.every((person)=>person.reference)) throw new Error('Repère une réplique de chaque intervenant au curseur.');
      audio=await audioRows(Number($('voice-track').value),0,current);
    } else {
      const tracks=[0,1].map((index)=>Number($(`voice-mic-${index}`).value));
      if(tracks[0]===tracks[1]) throw new Error('Choisis deux pistes micros différentes.');
      audio=[...await audioRows(tracks[0],0,current),...await audioRows(tracks[1],1,current)];
    }
    analysisSignature=signature(current);
    analysisAudio={signature:JSON.stringify(audio),mode,tracks:mode==='mixed' ? [Number($('voice-track').value)]:[0,1].map((index)=>Number($(`voice-mic-${index}`).value))};
    const payload={mode,audio,references:people.map((person)=>person.reference),start:Math.min(...current.targets.map((target)=>sec(target.start))),end:Math.max(...current.targets.map((target)=>sec(target.end)))};
    let record=await api('zooms/speakers/analyze',payload);job=record.id;$('voice-cancel').hidden=false;
    while(['queued','running','cancelling'].includes(record.status)) {
      say(`${record.message || 'Analyse locale…'} · ${record.progress || 0} %`);
      await new Promise((resolve)=>setTimeout(resolve,700));record=await api(`module-jobs/${job}`);
    }
    if(record.status!=='complete') throw new Error(record.error || 'Analyse annulée.');
    result=record.result;page=0;renderTurns();$('voice-result').hidden=false;
    $('voice-summary').textContent=`${result.turns.filter((turn)=>turn.speaker!==-1).length} prises de parole · ${result.unknownSeconds.toFixed(1)} s en plan large`;
    say('Prises de parole prêtes.');
  }
  async function apply() {
    if(!result) throw new Error('Détecte les prises de parole.');
    const current=await selection();if(signature(current)!==analysisSignature) throw new Error('La sélection ou le montage a changé. Relance l’analyse.');
    const audio=analysisAudio.mode==='mixed' ? await audioRows(analysisAudio.tracks[0],0,current):[...await audioRows(analysisAudio.tracks[0],0,current),...await audioRows(analysisAudio.tracks[1],1,current)];
    if(JSON.stringify(audio)!==analysisAudio.signature) throw new Error('Le montage audio a changé. Relance l’analyse.');
    for(const person of [...people,{frame:wide}]) if(!validFrame(person.frame) || person.frame.frameSize.width!==current.frameSize.width || person.frame.frameSize.height!==current.frameSize.height) throw new Error('Les dimensions ont changé. Reprends les cadrages.');
    for(const target of current.targets) await frame(target.item,current.frameSize);
    const copier=require('./sequence-copy.cjs').withHost(host),draft=await copier.create(current.project,current.sequence,current.targets.map((target)=>target.item));
    const params=await Promise.all(draft.items.map(motion));if(params.some((value)=>!value)) throw new Error('Trajectoire absente dans la copie.');
    const changes=current.targets.map((target)=>{
      const points=new Map(),sourceIn=BigInt(target.sourceIn),sourceOut=BigInt(target.sourceOut),frameTicks=BigInt(current.timebase);
      const put=(time,person)=>{
        let tick=sourceIn+BigInt(Math.round((time-sec(target.start))*1e6))*TICKS/1000000n;
        tick=time===sec(target.start) ? sourceIn:((tick+frameTicks/2n)/frameTicks)*frameTicks;
        tick=tick<sourceIn ? sourceIn:tick>=sourceOut ? sourceOut-frameTicks:tick;
        if(tick>=sourceIn) points.set(String(tick),person===-1 ? wide:people[person].frame);
      };
      const initial=result.turns.find((turn)=>turn.start<=sec(target.start) && turn.end>sec(target.start));
      put(sec(target.start),initial?.speaker ?? -1);
      for(const turn of result.turns) if(turn.start>sec(target.start) && turn.start<sec(target.end)) put(turn.start,turn.speaker);
      return [...points].sort((a,b)=>BigInt(a[0])<BigInt(b[0]) ? -1:1);
    });
    if(changes.reduce((sum,points)=>sum+points.length,0)>3000) throw new Error('Plus de 3 000 changements de cadrage. Traite une sélection plus courte.');
    await copier.assertCopy(current.project,draft);
    let committed=false;
    current.project.lockedAccess(()=>{
      const actions=[draft.projectItem.createSetNameAction(draft.name.replace('Zooms','Intervenants'))];
      for(let index=0;index<changes.length;index++) {
        for(const name of ['scale','position','anchor','rotation']) {
          const param=params[index][name];actions.push(param.createSetTimeVaryingAction(true));
          for(const [ticks,value] of changes[index]) {
            const v=['position','anchor'].includes(name) ? new host.PointF(value[name].x,value[name].y):value[name];
            const key=param.createKeyframe(v);key.position=host.TickTime.createWithTicks(ticks);
            actions.push(param.createAddKeyframeAction(key));actions.push(param.createSetInterpolationAtKeyframeAction(key.position,host.Constants.InterpolationMode.HOLD,true));
          }
        }
      }
      committed=current.project.executeTransaction((compound)=>{for(const action of actions) if(!compound.addAction(action)) throw new Error('Une action de zoom a été refusée.');},'Nocturnz/Edit — Zooms des intervenants');
    });
    if(!committed) throw new Error('Application non confirmée. La séquence source reste intacte.');
    say('Zooms automatiques appliqués dans la copie.');
  }
  bind($('voice-load'),load);bind($('voice-wide'),()=>capture(-1));bind($('voice-analyze'),analyze);bind($('voice-apply'),apply);
  bind($('voice-cancel'),async()=>{if(job) await api(`module-jobs/${job}/cancel`,{});},false);
  bind($('voice-previous'),()=>{if(page>0) {page--;renderTurns();}},false);
  bind($('voice-next'),()=>{if(result && (page+1)*30<result.turns.length) {page++;renderTurns();}},false);
  $('voice-mode').addEventListener('change',()=>{invalidate();renderPeople(setup ? $('voice-track').children.length:0);save().catch((error)=>say(error.message,true));});
  $('voice-track').addEventListener('change',()=>{invalidate();people.forEach((person)=>{person.reference=null;});renderPeople($('voice-track').children.length);save().catch((error)=>say(error.message,true));});
  renderPeople();
})();
