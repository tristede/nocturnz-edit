/* Original Nocturnz planner. Source ticks, frame-aligned, no host/project writes. */
const TICKS=254016000000n;
const seconds=(ticks)=>Number(BigInt(ticks))/Number(TICKS);
function mix(a,b,t) {
  return {scale:a.scale+(b.scale-a.scale)*t,rotation:a.rotation+(b.rotation-a.rotation)*t,
    position:{x:a.position.x+(b.position.x-a.position.x)*t,y:a.position.y+(b.position.y-a.position.y)*t},
    anchor:{x:a.anchor.x+(b.anchor.x-a.anchor.x)*t,y:a.anchor.y+(b.anchor.y-a.anchor.y)*t},frameSize:b.frameSize};
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
    const tickAt=(time)=>sourceIn+((BigInt(Math.round((time-start)*1e6))*TICKS/1000000n+frameTicks/2n)/frameTicks)*frameTicks;
    boundaries.set(String(sourceIn),turns.find((turn)=>turn.start<=start && turn.end>start)?.speaker ?? -1);
    for(const turn of turns) {
      if(turn.start>start && turn.start<end) {const tick=tickAt(turn.start);if(tick<=last) boundaries.set(String(tick),turn.speaker);}
      // Explicit neutral gaps, even if a future backend omits neutral turns.
      if(turn.end>start && turn.end<end && !turns.some((other)=>other.start<=turn.end && other.end>turn.end)) {
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
      const durationTicks=BigInt(Math.max(1,Math.round(config.duration*Number(TICKS)/1000/Number(frameTicks))))*frameTicks;
      const finish=row.tick+(durationTicks<stop-row.tick ? durationTicks:stop-row.tick),span=(finish-row.tick)/frameTicks;
      const from=type==='in' ? wide:frame,to=type==='in' ? frame:wide,steps=Number(span<8n ? span:8n);
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
module.exports={plan};
