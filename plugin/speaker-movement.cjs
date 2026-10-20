/* Original Nocturnz planner. Source ticks, frame-aligned, no host/project writes. */
const TICKS=254016000000n;
const seconds=(ticks)=>Number(BigInt(ticks))/Number(TICKS);
function mix(a,b,t) {
  return {scale:a.scale+(b.scale-a.scale)*t,rotation:a.rotation+(b.rotation-a.rotation)*t,
    position:{...b.position},
    anchor:{...b.anchor},frameSize:b.frameSize};
}
// Editorial decisions are slower than the half-second voice classifier.
// Brief hesitations/uncertainty must not repeatedly reset the shot to wide.
function settle(turns,start,end,minHold=3) {
  const raw=turns.filter((turn)=>turn.end>start && turn.start<end)
    .map((turn)=>({...turn,start:Math.max(start,turn.start),end:Math.min(end,turn.end)})).sort((a,b)=>a.start-b.start);
  const rows=[];
  const add=(a,b,speaker)=>{if(b<=a) return;const last=rows[rows.length-1];if(last && last.speaker===speaker && Math.abs(last.end-a)<.001) last.end=b;else rows.push({start:a,end:b,speaker});};
  let cursor=start;
  for(const row of raw) {if(row.start>cursor) add(cursor,row.start,-1);add(Math.max(cursor,row.start),row.end,row.speaker);cursor=Math.max(cursor,row.end);}
  add(cursor,end,-1);
  // Bridge brief neutral breaks only when the same voice returns afterwards.
  for(let i=1;i<rows.length-1;i++) if(rows[i].speaker===-1 && rows[i].end-rows[i].start<=1.8 && rows[i-1].speaker===rows[i+1].speaker) rows[i].speaker=rows[i-1].speaker;
  const joined=[];
  for(const row of rows) {const last=joined[joined.length-1];if(last && last.speaker===row.speaker) last.end=row.end;else joined.push({...row});}
  const output=[];let speaker=-1,lastChange=start-minHold,hasSpeaker=false;
  const push=(a,b,value)=>{if(b<=a) return;const last=output[output.length-1];if(last && last.speaker===value) last.end=b;else output.push({start:a,end:b,speaker:value});};
  for(const row of joined) {
    const minimum=!hasSpeaker && row.speaker>=0 ? .35:1.8;
    if(row.speaker===speaker || row.end-row.start<minimum) {push(row.start,row.end,speaker);continue;}
    const change=Math.max(row.start,lastChange+minHold);
    if(row.end-change<minimum) {push(row.start,row.end,speaker);continue;}
    push(row.start,change,speaker);speaker=row.speaker;if(speaker>=0) hasSpeaker=true;lastChange=change;push(change,row.end,speaker);
  }
  return output;
}
function plan(targets,turns,wide,frames,timebase,config) {
  const frameTicks=BigInt(timebase),types=config.motion==='alternate' ? config.types:[config.motion];
  if(!types.length || types.some((type)=>!['in','out','jump'].includes(type))) throw new Error('Choisis au moins un type de zoom.');
  if(!Number.isFinite(config.duration) || config.duration<=0) throw new Error('Durée de transition invalide.');
  let ordinal=0;
  const plans=new Array(targets.length);
  const ordered=targets.map((target,index)=>({target,index})).sort((a,b)=>seconds(a.target.start)-seconds(b.target.start)||a.target.track-b.target.track);
  for(const {target,index} of ordered) {
    const sourceIn=BigInt(target.sourceIn),sourceOut=BigInt(target.sourceOut),start=seconds(target.start),end=seconds(target.end);
    const length=sourceOut-sourceIn,last=sourceIn+((length-1n)/frameTicks)*frameTicks,points=new Map(),boundaries=new Map();
    const paced=settle(turns,start,end,config.minHold || 3);
    const tickAt=(time)=>sourceIn+((BigInt(Math.round((time-start)*1e6))*TICKS/1000000n+frameTicks/2n)/frameTicks)*frameTicks;
    boundaries.set(String(sourceIn),paced.find((turn)=>turn.start<=start && turn.end>start)?.speaker ?? -1);
    for(const turn of paced) {
      if(turn.start>start && turn.start<end) {const tick=tickAt(turn.start);if(tick<=last) boundaries.set(String(tick),turn.speaker);}
      // Explicit neutral gaps, even if a future backend omits neutral turns.
      if(turn.end>start && turn.end<end && !paced.some((other)=>other.start<=turn.end && other.end>turn.end)) {
        const tick=tickAt(turn.end);if(tick<=last) boundaries.set(String(tick),-1);
      }
    }
    const rows=[...boundaries].map(([tick,speaker])=>({tick:BigInt(tick),speaker})).sort((a,b)=>a.tick<b.tick?-1:1);
    const put=(tick,value,linear=false)=>points.set(String(tick),{value,linear});
    for(let i=0;i<rows.length;i++) {
      const row=rows[i],stop=i+1<rows.length ? rows[i+1].tick-frameTicks:last;
      const frame=frames[index]?.[row.speaker];
      if(row.speaker===-1 || !frame) {put(row.tick,wide);continue;}
      const type=types[ordinal++%types.length];
      if(type==='jump' || stop<=row.tick) {put(row.tick,frame);continue;}
      // A small move around the chosen portrait, never a full wide/close yo-yo.
      const duration=Math.max(1200,config.duration);
      const durationTicks=BigInt(Math.max(1,Math.round(duration*Number(TICKS)/1000/Number(frameTicks))))*frameTicks;
      const finish=row.tick+(durationTicks<stop-row.tick ? durationTicks:stop-row.tick),span=(finish-row.tick)/frameTicks;
      if(stop-row.tick<durationTicks+frameTicks*4n) {put(row.tick,frame);continue;}
      const soft=mix(wide,frame,.88);
      const from=type==='in' ? soft:frame,to=type==='in' ? frame:soft,steps=Number(span<12n ? span:12n);
      for(let j=0;j<=steps;j++) {
        const tick=row.tick+(span*BigInt(j)/BigInt(steps))*frameTicks,t=Number(tick-row.tick)/Number(finish-row.tick);
        put(tick,mix(from,to,t*t*(3-2*t)),j<steps);
      }
      // HOLD at the end prevents interpolating towards the next speaker/cut.
      put(finish,to);
    }
    plans[index]=[...points].sort((a,b)=>BigInt(a[0])<BigInt(b[0])?-1:1);
  }
  return plans;
}
// One independent layer per paced intervention. Its pivot stays on the speaker;
// only scale changes. All offsets are relative to the layer, not the source clip.
function layerPlan(targets,turns,wide,frames,bases,timebase,config,names) {
  const frameTicks=BigInt(timebase),types=config.motion==='alternate' ? config.types:[config.motion];
  if(!types.length || types.some(type=>!['in','out','jump'].includes(type))) throw new Error('Choisis au moins un type de zoom.');
  if(!Number.isFinite(config.duration) || config.duration<=0) throw new Error('Durée de transition invalide.');
  const segments=[];let ordinal=0;
  const ordered=targets.map((target,index)=>({target,index})).sort((a,b)=>BigInt(a.target.start)<BigInt(b.target.start)?-1:1);
  for(const {target,index} of ordered) {
    const start=BigInt(target.start),end=BigInt(target.end),base=bases[index];
    const align=time=>{const offset=BigInt(Math.round((time-seconds(start))*1e6))*TICKS/1000000n;return start+((offset+frameTicks/2n)/frameTicks)*frameTicks;};
    for(const row of (config.includeShort ? turns.filter(row=>row.end>seconds(start) && row.start<seconds(end)).map(row=>({...row,start:Math.max(row.start,seconds(start)),end:Math.min(row.end,seconds(end))})):settle(turns,seconds(start),seconds(end),config.minHold || 3))) {
      const frame=frames[index]?.[row.speaker];
      if(row.speaker<0 || !frame) continue;
      const a=align(row.start),b=row.end>=seconds(end) ? end:align(row.end);
      if(b-a<frameTicks) continue;
      if(Math.abs(frame.anchor.x-base.anchor.x)>.0001 || Math.abs(frame.anchor.y-base.anchor.y)>.0001 || Math.abs(base.rotation)>.0001 || Math.abs(frame.rotation)>.0001) throw new Error('Les calques exigent des clips sans rotation et un ancrage identique.');
      // Adjustment layers transform the displayed canvas, not the camera pixels.
      // Large (frame === wide) must therefore be exactly 100%, regardless of
      // source resolution, Motion scale or Premiere's media scaling mode.
      const ratio=Math.max(1,frame.scale/wide.scale),scale=ratio*100;
      if(!Number.isFinite(ratio) || ratio<=0) throw new Error('Échelle du cadrage invalide.');
      const soft=100*(1+(ratio-1)*.88);
      const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
      // Keep the entire viewport within the input canvas at the SMALLEST scale.
      // With a fixed centered output position, this also covers all larger keys.
      const radius=50/soft;
      const anchor={x:clamp(wide.position.x+(.5-frame.position.x)/ratio,radius,1-radius),
        y:clamp(wide.position.y+(.5-frame.position.y)/ratio,radius,1-radius)};
      const type=types[ordinal++%types.length],keys=[];
      if(type!=='jump' && b-a>frameTicks*2n && ratio>1.00001) {
        // Short interventions get a shorter eased move, never a surprise Jump.
        const requested=BigInt(Math.max(1,Math.round(Math.max(2000,config.duration)*Number(TICKS)/1000/Number(frameTicks))))*frameTicks;
        const available=b-a-frameTicks*2n,duration=requested<available ? requested:available;
        const from=type==='in' ? soft:scale,to=type==='in' ? scale:soft;
        const span=duration/frameTicks;
        // Sample every frame; quintic easing has zero speed and acceleration at
        // both ends. No 12-point polygon approximation on slow movements.
        for(let j=0n;j<=span;j++) {
          const offset=j*frameTicks,t=Number(j)/Number(span),ease=t*t*t*(t*(6*t-15)+10);
          keys.push({time:String(offset),value:from+(to-from)*ease,linear:j<span});
        }
      }
      segments.push({start:String(a),end:String(b),index,speaker:row.speaker,name:names[row.speaker] || `Intervenant ${row.speaker+1}`,type,anchor,position:{x:.5,y:.5},scale,keys});
    }
  }
  if(!segments.length) throw new Error('Aucune prise de parole assez longue pour créer un zoom.');
  if(segments.length>1000 || segments.reduce((sum,row)=>sum+row.keys.length,0)>12000) throw new Error('Trop de zooms. Traite une sélection plus courte.');
  return segments;
}
module.exports={plan,settle,layerPlan};
