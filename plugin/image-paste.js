/* Native bitmap clipboard access is delegated to the local Mac helper on demand. */
(() => {
  const $=(id)=>document.getElementById(id);
  let host=null,uxp=null,busy=false,pending=null;
  try {host=require('premierepro');uxp=require('uxp');} catch(_) {}
  const say=(text,error=false)=>{$('image-status').textContent=text;$('image-status').className='tool-status'+(error ? ' error':'');};
  function setBusy(value) {
    busy=value;
    for(const id of ['image-paste','image-choose','image-import']) $(id).setAttribute('aria-disabled',String(value));
  }
  async function project() {
    if(!host) throw new Error('Ouvre le panneau dans Premiere.');
    const value=await host.Project.getActiveProject();
    if(!value) throw new Error('Ouvre un projet Premiere.');
    return value;
  }
  async function importImage(target) {
    if(!pending) return;
    $('image-import').hidden=false;
    if(!await target.importFiles([pending.path],true,await target.getRootItem(),false)) throw new Error('Import non confirmé. Réessaie avec Importer.');
    say('Image importée dans le chutier.');pending=null;$('image-import').hidden=true;
  }
  async function paste() {
    const target=await project();
    say('Collage…');
    let response;
    try {response=await fetch('http://localhost:8765/api/v1/clipboard/image',{method:'POST',
      headers:{'Content-Type':'application/json','X-Nocturnz-Client':'premiere-panel'},body:'{}'});}
    catch(_) {throw new Error('Service local inaccessible. Lance npm run service.');}
    const result=await response.json();if(!response.ok) throw new Error(result.error || 'Collage impossible.');
    pending=result;$('image-name').textContent=`${result.width} × ${result.height} · PNG`;
    await importImage(target);
  }
  async function choose() {
    const target=await project();
    const file=await uxp.storage.localFileSystem.getFileForOpening({types:['png','jpg','jpeg','tiff','webp','heic'],allowMultiple:false});
    if(!file) return;
    pending={path:file.nativePath};$('image-name').textContent=file.name;await importImage(target);
  }
  async function run(action) {
    if(busy) return;setBusy(true);
    try {await action();} catch(error) {say(error.message,true);} finally {setBusy(false);}
  }
  for(const [id,action] of [['image-paste',paste],['image-choose',choose],['image-import',async()=>importImage(await project())]]) {
    $(id).addEventListener('click',()=>run(action));
    $(id).addEventListener('keydown',(event)=>{if(event.key==='Enter' || event.key===' ') {event.preventDefault();run(action);}});
  }
  document.querySelectorAll('[data-tool]').forEach((tile)=>{
    const navigate=()=>{$('image-controls').hidden=tile.dataset.tool!=='images';if(tile.dataset.tool==='images') $('pending-state').hidden=true;};
    tile.addEventListener('click',navigate);
    tile.addEventListener('keydown',(event)=>{if(event.key==='Enter' || event.key===' ') navigate();});
  });
  document.addEventListener('keydown',(event)=>{
    const input=event.target;
    if($('image-controls').hidden || $('tool-view').hidden || ['INPUT','TEXTAREA','SELECT'].includes(input?.tagName) || input?.isContentEditable) return;
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='v') {event.preventDefault();run(paste);}
  });
})();
