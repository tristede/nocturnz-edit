/* Native adjustment layers with a Transform effect; never edits source clips. */
function withHost(host) {
  const key=(item)=>host.ProjectItem.cast(item).getId();
  const tick=(value)=>host.TickTime.createWithTicks(String(value));
  function commit(project,build,name) {
    try {
      let ok=false;project.lockedAccess(()=>{
        // The action factories themselves require locked access, not only their execution.
        const actions=build();
        ok=project.executeTransaction((compound)=>{for(const action of actions) if(!compound.addAction(action)) throw new Error('Action de calque refusée.');},name);
      });
      if(!ok) throw new Error('Transaction non confirmée.');
    } catch(error) {throw new Error(`${name} : ${error.message || error}`);}
  }
  async function validate(item) {
    if(!await item.isAdjustmentLayer() || await item.isDisabled()) throw new Error('Sélectionne un calque d’effets vierge et actif.');
    const chain=await item.getComponentChain();
    for(let i=0;i<chain.getComponentCount();i++) {
      const component=chain.getComponentAtIndex(i),name=await component.getMatchName();
      if(!/motion|opacity|time.?remap/i.test(name)) throw new Error('Utilise un calque vierge, sans effet ajouté.');
      for(let j=0;j<component.getParamCount();j++) {
        const param=component.getParam(j);
        if(await param.isTimeVarying()) throw new Error('Le calque modèle contient déjà une animation.');
        if(!/motion/i.test(name)) continue;
        const raw=(await param.getStartValue()).value,value=raw && typeof raw==='object' && 'value' in raw ? raw.value:raw;
        if(/^scale$|^échelle$|^echelle$/i.test(param.displayName || '') && Number(value)!==100) throw new Error('Rétablis la Trajectoire par défaut du calque modèle.');
        if(/^rotation$/i.test(param.displayName || '') && Number(value)!==0) throw new Error('Rétablis la Trajectoire par défaut du calque modèle.');
        if(/^(position|anchor point|point d[’']ancrage)$/i.test(param.displayName || '')) {
          const point=require('./point.cjs').readPoint(raw);
          if(Math.abs(point.x-.5)>.0001 || Math.abs(point.y-.5)>.0001) throw new Error('Rétablis la Trajectoire par défaut du calque modèle.');
        }
      }
    }
  }
  async function resolve(project,model,size) {
    if(!model || model.width!==size.width || model.height!==size.height) throw new Error('Le calque automatique n’est pas prêt pour ces dimensions.');
    for(const sequence of (await project.getSequences()).filter((item)=>item.name.startsWith('Nocturnz · Calque auto '))) for(let t=0;t<await sequence.getVideoTrackCount();t++) {
      for(const item of await (await sequence.getVideoTrack(t)).getTrackItems(1,false)) {
        if(key(await item.getProjectItem())!==model.id || !await item.isAdjustmentLayer()) continue;
        await validate(item);return host.ProjectItem.cast(await item.getProjectItem());
      }
    }
    throw new Error('Calque automatique introuvable. Relance la génération.');
  }
  async function ensure(project,size,timebase,api) {
    const name=`Nocturnz · Calque auto ${size.width}×${size.height} · ${timebase}`;
    async function find() {
      for(const sequence of await project.getSequences()) {
        if(sequence.name!==name) continue;
        const dimensions=await sequence.getFrameSize();
        if(dimensions.width!==size.width || dimensions.height!==size.height || String(await sequence.getTimebase())!==String(timebase)) continue;
        for(let t=0;t<await sequence.getVideoTrackCount();t++) for(const item of await (await sequence.getVideoTrack(t)).getTrackItems(1,false)) {
          if(!await item.isAdjustmentLayer()) continue;
          await validate(item);return {id:key(await item.getProjectItem()),width:size.width,height:size.height};
        }
      }
      return null;
    }
    let model=await find();if(model) return model;
    const active=await project.getActiveSequence(),selected=active && await active.getSelection(),items=selected ? await selected.getTrackItems():[];
    const record=await api('zooms/layer-template',{width:size.width,height:size.height,timebase:String(timebase)});
    try {
      if(!await project.importSequences(record.path,[host.Guid.fromString(record.sequenceId)])) throw new Error('Premiere n’a pas importé le calque automatique.');
      model=await find();
    } finally {
      if(active) {
        await project.openSequence(active);await project.setActiveSequence(active);
        host.TrackItemSelection.createEmptySelection((selection)=>{for(const item of items) selection.addItem(item,true);active.setSelection(selection);});
      }
    }
    if(!model) throw new Error('Le calque automatique importé n’a pas été reconnu.');
    return model;
  }
  async function transform(item) {
    const chain=await item.getComponentChain();let component=null;
    for(let i=0;i<chain.getComponentCount();i++) {const c=chain.getComponentAtIndex(i);if(await c.getMatchName()==='AE.ADBE Geometry2') component=c;}
    if(!component) throw new Error('Effet Transformation absent du calque.');
    const params={};
    for(let i=0;i<component.getParamCount();i++) {
      const param=component.getParam(i),name=(param.displayName || '').trim();
      if(/^(scale|scale height|échelle|echelle|hauteur d[’']échelle|échelle hauteur|hauteur d[’']echelle)$/i.test(name)) params.scale=param;
      if(/^(position)$/i.test(name)) params.position=param;
      if(/^(anchor point|point d[’']ancrage)$/i.test(name)) params.anchor=param;
      if(/^(uniform scale|échelle uniforme|echelle uniforme)$/i.test(name)) params.uniform=param;
      if(/^rotation$/i.test(name)) params.rotation=param;
    }
    // Beta 27 FR exposes this checkbox with an empty SDK displayName, although
    // the Effects panel labels it "Echelle uniforme". Verify Geometry2's schema
    // and boolean value before using its slot; never mistake it for Scale.
    if(!params.uniform && component.getParamCount()>=8 &&
      /^(anchor point|point d[’']ancrage)$/i.test(component.getParam(0).displayName || '') &&
      /^position$/i.test(component.getParam(1).displayName || '') &&
      /^(scale|scale height|échelle|echelle|hauteur d[’']échelle|échelle hauteur|hauteur d[’']echelle)$/i.test(component.getParam(3).displayName || '') &&
      /^rotation$/i.test(component.getParam(7).displayName || '')) {
      const candidate=component.getParam(2),raw=(await candidate.getStartValue()).value;
      const value=raw && typeof raw==='object' && 'value' in raw ? raw.value:raw;
      if(!(candidate.displayName || '').trim() && typeof value==='boolean') params.uniform=candidate;
    }
    if(!params.scale || !params.position || !params.anchor || !params.rotation || !params.uniform) throw new Error('Paramètres Transformation non reconnus dans cette version de Premiere.');
    const read=require('./point.cjs').readPoint;
    const center=read((await params.position.getStartValue()).value),anchor=read((await params.anchor.getStartValue()).value);
    if(![center.x,center.y,anchor.x,anchor.y].every((v)=>Number.isFinite(v) && v>0)) throw new Error('Coordonnées Transformation illisibles.');
    return {params,units:{x:center.x*2,y:center.y*2},anchorUnits:{x:anchor.x*2,y:anchor.y*2}};
  }
  async function apply(project,draft,targets,changes,bases,model,size,assertCopy) {
    const source=await resolve(project,model,size),count=await draft.sequence.getVideoTrackCount();
    const order=targets.map((target,index)=>({target,index})).sort((a,b)=>BigInt(a.target.start)<BigInt(b.target.start)?-1:1);
    for(let i=1;i<order.length;i++) if(BigInt(order[i].target.start)<BigInt(order[i-1].target.end)) throw new Error('Les clips se chevauchent : traite une seule piste vidéo.');
    if(!(await host.VideoFilterFactory.getMatchNames()).includes('AE.ADBE Geometry2')) throw new Error('L’effet Transformation n’est pas installé.');
    const layers=[];
    for(const segment of changes) {
      await assertCopy(project,draft);
      commit(project,()=>[host.SequenceEditor.getEditor(draft.sequence).createInsertProjectItemAction(source,tick(segment.start),count,-1,true)],'Nocturnz/Edit — Ajouter le calque zoom');
      const track=await draft.sequence.getVideoTrack(count),matches=[];
      for(const item of await track.getTrackItems(1,false)) if(String((await item.getStartTime()).ticks)===segment.start && await item.isAdjustmentLayer()) matches.push(item);
      if(matches.length!==1) throw new Error('Calque inséré non identifié. Aucun effet appliqué aux clips.');
      const layer=matches[0],chain=await layer.getComponentChain();let pendingComponent;
      project.lockedAccess(()=>{pendingComponent=host.VideoFilterFactory.createComponent('AE.ADBE Geometry2');});
      const component=await pendingComponent;
      const label={in:'Zoom in',out:'Zoom out',jump:'Jump'}[segment.type];
      commit(project,()=>[layer.createSetEndAction(tick(segment.end)),layer.createSetNameAction(`Nocturnz · ${segment.name} · ${label}`),
        chain.createAppendComponentAction(component)],'Nocturnz/Edit — Préparer le calque');
      if(String((await layer.getEndTime()).ticks)!==segment.end) throw new Error('Durée du calque non confirmée.');
      layers.push({layer,segment});
    }
    const prepared=[];
    for(const {layer,segment} of layers) {
      const {params,units,anchorUnits}=await transform(layer),layerIn=BigInt((await layer.getInPoint()).ticks);
      prepared.push({params,segment,position:{x:segment.position.x*units.x,y:segment.position.y*units.y},
        anchor:{x:segment.anchor.x*anchorUnits.x,y:segment.anchor.y*anchorUnits.y},
        keys:segment.keys.map(point=>({...point,time:String(layerIn+BigInt(point.time))}))});
    }
    await assertCopy(project,draft);
    commit(project,()=>{
      const actions=[draft.projectItem.createSetNameAction(draft.name.replace('Zooms','Zooms calques'))];
      for(const {params,segment,position,anchor,keys} of prepared) {
        actions.push(params.uniform.createSetValueAction(params.uniform.createKeyframe(true),true));
        for(const [name,value] of [['position',new host.PointF(position.x,position.y)],['anchor',new host.PointF(anchor.x,anchor.y)],['rotation',0]]) {
          actions.push(params[name].createSetTimeVaryingAction(false),params[name].createSetValueAction(params[name].createKeyframe(value),true));
        }
        actions.push(params.scale.createSetTimeVaryingAction(keys.length>0));
        if(!keys.length) actions.push(params.scale.createSetValueAction(params.scale.createKeyframe(segment.scale),true));
        for(const point of keys) {
          const keyframe=params.scale.createKeyframe(point.value);keyframe.position=tick(point.time);
          actions.push(params.scale.createAddKeyframeAction(keyframe),params.scale.createSetInterpolationAtKeyframeAction(keyframe.position,point.linear ? host.Constants.InterpolationMode.LINEAR:host.Constants.InterpolationMode.HOLD,true));
        }
      }
      return actions;
    },'Nocturnz/Edit — Zooms sur calques');
    for(const {params,keys,segment} of prepared) {
      for(const name of ['position','anchor','rotation']) if(await params[name].isTimeVarying()) throw new Error('Premiere n’a pas confirmé le cadrage fixe du calque.');
      if(keys.length) {
        if(!await params.scale.isTimeVarying() || !(await params.scale.getKeyframeListAsTickTimes()).length) throw new Error('Le calque existe mais Premiere n’a pas confirmé ses images clés.');
      } else if(Math.abs(Number((await params.scale.getStartValue()).value)-segment.scale)>.01) throw new Error('Premiere n’a pas confirmé l’échelle du Jump.');
    }
    return layers.length;
  }
  return {resolve,ensure,apply};
}
module.exports={withHost};
