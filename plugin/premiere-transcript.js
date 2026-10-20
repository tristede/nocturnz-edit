/* Adapted from AdobePremiereProMCP uxp-panel/transcript-export.js (MIT).
 * Copyright (c) 2026 Ayush Ojha. See third_party/AdobePremiereProMCP.LICENSE.
 * Read existing source transcript into the editor, without a manual JSON export.
 */
window.NocturnzPremiereTranscript = async (premiere) => {
  for(const [object,method] of [[premiere?.Project,'getActiveProject'],[premiere?.ProjectUtils,'getSelection'],
    [premiere?.ClipProjectItem,'cast'],[premiere?.Transcript,'exportToJSON']]) {
    if(!object || typeof object[method]!=='function') throw new Error('Lecture de transcription indisponible dans cette version de Premiere.');
  }
  const project=await premiere.Project.getActiveProject();
  if(!project) throw new Error('Ouvre un projet Premiere.');
  const selection=await premiere.ProjectUtils.getSelection(project);
  const items=selection ? await selection.getItems():[];
  if(!Array.isArray(items) || items.length!==1) throw new Error('Sélectionne un média transcrit dans le chutier.');
  const clip=premiere.ClipProjectItem.cast(items[0]);
  if(!clip || await clip.isSequence() || await clip.isOffline()) throw new Error('Sélectionne un média source en ligne.');
  if(typeof premiere.Transcript.hasTranscript==='function' && !await premiere.Transcript.hasTranscript(clip)) throw new Error('Ce média n’a pas de transcription Premiere.');
  const raw=await premiere.Transcript.exportToJSON(clip);
  if(typeof raw!=='string' || !raw.trim()) throw new Error('Transcription Premiere vide.');
  let transcript;
  try {transcript=JSON.parse(raw);} catch(_) {throw new Error('Transcription Premiere illisible.');}
  if(!transcript || !Array.isArray(transcript.segments) || !transcript.segments.length) throw new Error('Aucun sous-titre dans cette transcription.');
  return {paths:[(await clip.getMediaFilePath()).replace(/^\/{3,}/,'/')],transcript};
};
