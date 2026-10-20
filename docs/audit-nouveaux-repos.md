# Audit des nouveaux dépôts — Nocturnz/Edit

Date : 20 octobre 2026. Audit statique des sources et licences, sans exécuter les projets tiers. Ce rapport évalue la réutilisation ; il ne constitue pas une validation de fonctionnement dans Premiere.

## Décisions

| Projet | Apport pour Nocturnz/Edit | Décision |
| --- | --- | --- |
| Auto-Editor | Analyse audio, coupes, exports Premiere XML | Conserver le moteur déjà intégré ; étudier séparément la mise à jour |
| AdobePremiereProMCP | Inspection UXP, transcription Adobe existante, validation des décisions de montage | Réutiliser des composants ciblés sous MIT |
| PremiereRemote | Commandes externes / Stream Deck | Porter les commandes utiles ; ne pas embarquer son serveur tel quel |
| Premiere Pro Console | Snippets, diagnostic développeur | Réutilisation ciblée sous MIT, hors interface principale |
| Pymiere | Automatisation Python via CEP | Réserve technique ; pas une dépendance nécessaire à notre UXP |
| Jumpcut | Détection de silence et anciennes opérations CEP | Déjà archivé dans vendor ; privilégier Auto-Editor pour le produit |
| Focus Peaking | Visualisation des contours contrastés | Chantier natif séparé ; notices Adobe à éclaircir |
| OpenCurve | Éditeur de courbes et presets | Référence uniquement : aucune licence trouvée dans le checkout |
| Ambar | Workflow transcription / montage / organisation | Référence uniquement : aucune licence trouvée dans le checkout |
| ZXPInstaller | Installation d’extensions CEP .zxp | Outil externe ; pas l’installateur de notre extension UXP .ccx |

## 1. Auto-Editor

- Source : [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor), Unlicense.
- Version réellement intégrée : **29.3.1**, commit `43d47dc5157f0c84dd0b01a43d9406d35e0c4b4e`.
- Entrées examinées : `vendor/sources/auto-editor/src/analyze/audio.nim`, `src/exports/fcp7.nim` ; adaptateur local `service/auto_editor.py`.
- À garder : analyse locale, marges de coupe, plan révisable, export d’une nouvelle séquence XML. Pas besoin d’un deuxième moteur de silences.
- Le [fcp7.nim de master](https://github.com/WyattBlue/auto-editor/blob/master/src/exports/fcp7.nim) et [action.nim](https://github.com/WyattBlue/auto-editor/blob/master/src/action.nim), consultés en ligne, contiennent désormais davantage d’actions et d’animations. Leur présence ne garantit pas leur export intégral dans Premiere.
- Mise à jour à isoler : notre adaptateur impose une version précise et un schéma de sortie. Master n’a pas été cloné ni épinglé pendant cette passe, faute d’accès réseau du terminal ; aucune équivalence de compatibilité n’est affirmée.

## 2. AdobePremiereProMCP

- Source : [ayushozha/AdobePremiereProMCP](https://github.com/ayushozha/AdobePremiereProMCP), **MIT** ; commit `36574e4920d56ae71efeb055ba8e2af827b2106c`.
- Candidats concrets : `uxp-panel/inspect.js`, `uxp-panel/transcript-export.js`, `ts-bridge/src/timeline/{validator,timecode,operations}.ts`, `ts-bridge/src/auth/token.ts`.
- L’export de transcription lit celle d’un **clip source sélectionné dans le chutier**, via `Transcript.exportToJSON`. Il ne transcrit pas un rush et ne fournit pas une transcription complète de séquence montée.
- L’assembleur valide une liste de décisions puis crée une nouvelle séquence : intéressant pour notre exigence de préserver l’original.
- Le petit panneau UXP effectue inspection et export ; le reste repose sur des ponts CEP et services supplémentaires. La liste des outils MCP ne prouve donc pas une disponibilité native UXP.
- Décision : porter inspection, validation et lecture de transcription ; éviter l’empilement complet Go/Rust/TypeScript/CEP pour nos boutons.

## 3. PremiereRemote

- Source : [sebinside/PremiereRemote](https://github.com/sebinside/PremiereRemote), **MIT** ; commit `be5f97b115f05a1bed5735d9c7b62dbb288f0175`.
- Sources : `client/index.js`, `host/src/index.tsx`, types Premiere fournis.
- Utilité : catalogue de commandes, automatisation externe, intégration future Stream Deck.
- Adaptation nécessaire : CEP/ExtendScript et parfois QE, pas notre API UXP. Le serveur appelle `app.listen(SERVER_PORT)` sans adresse de boucle locale explicite ; les routes examinées n’ont pas de contrôle d’authentification. Des paramètres sont transformés en code ExtendScript.
- Décision : reprendre des commandes MIT et leurs idées d’interface, puis utiliser une liste de commandes autorisées, validation des paramètres, authentification et écoute locale explicite. Pas de serveur hérité activé automatiquement.

## 4. Premiere Pro Console

- Dépôt identifié depuis le lien communautaire : [ibrahimsaber1/PremierePro-Console](https://github.com/ibrahimsaber1/PremierePro-Console), **MIT** ; commit `88b8ae6fab69ac70277b094a8d488ae7eb6074e6`.
- Sources : `client/snippets.js`, `autocomplete-core.js`, `extendscript-api.js`, `index.js`.
- Réutilisable : snippets d’inspection et composants d’autocomplétion pour un éventuel mode développeur.
- L’exécution utilise `CSInterface.evalScript` : ses snippets ne deviennent pas des commandes UXP par simple copie. Les tables d’API ExtendScript ne décrivent pas notre API UXP.
- Décision : outil de diagnostic et accélérateur de développement ; aucun bénéfice à exposer une console de code dans le parcours minimal de montage.

## 5. Pymiere

- Source corrigée : [qmasingarbe/pymiere](https://github.com/qmasingarbe/pymiere), **GPL-3.0** ; commit `bf637b74e8ec145a66955062a43393b50e878c9f`.
- Sources : `pymiere/core.py`, `wrappers.py`, `objects/premiere_objects.py`, panneau CEP de développement.
- Le client Python envoie des requêtes à `127.0.0.1:3000` avec du code ExtendScript. Il nécessite son panneau CEP actif.
- Réutilisable : wrappers et exemples d’opérations en traitement par lots, sous leurs conditions GPL. Ce n’est pas un moteur audio ni un remplacement de Whisper.
- Décision : conserver comme piste pour des opérations impossibles avec UXP après vérification précise. Ne pas ajouter un deuxième pont Python/CEP pour des actions déjà couvertes par notre service et UXP.

## 6. Jumpcut

- Source : [cameron-astor/jumpcut](https://github.com/cameron-astor/jumpcut), **GPL-3.0** ; version déjà vendue dans le projet : `b1df31783291423cd217217c425158f8ebcd5d89`.
- Sources : `vendor/sources/jumpcut/jumpcut.py`, `host/index.jsx`.
- Détection avec Pydub/FFmpeg ; opérations Premiere CEP/QE. Le code cible V1/A1, coupe au rasoir et supprime avec raccord. Une sauvegarde est optionnelle ; cela ne suffit pas à garantir l’intégrité d’un montage multipiste.
- Décision : utile pour comparaison des marges et de la logique de silences ; ne pas reprendre tel quel l’exécuteur de coupes. Auto-Editor est déjà notre base active. Préserver les notices GPL des sources archivées.

## 7. Focus Peaking

- Source : [mitkonikov/premiere](https://github.com/mitkonikov/premiere), licence racine **MIT** ; commit `251fbb43421918c54702f695b7b22ec489a8d535`.
- Source : `Focus Peaking/FocusPeaking/FocusPeaking.cpp` et en-têtes associés.
- Effet C++ fondé sur des variations d’intensité entre pixels voisins, avec seuil et couleur. Ce n’est pas une reconnaissance de visage ni une mesure sémantique de netteté.
- Projet ancien utilisant les suites Adobe : pas copiable dans un panneau JavaScript. Recompilation, SDK actuel, architectures et distribution natives à traiter séparément.
- Point de licence : les fichiers C++ examinés portent aussi des en-têtes Adobe restrictifs. La licence MIT racine ne suffit pas à effacer ces notices ; provenance/conditions SDK à éclaircir avant redistribution.
- Décision : priorité basse, éventuel effet natif indépendant.

## 8. OpenCurve

- Source : [fayewave/OpenCurve](https://github.com/fayewave/OpenCurve) ; commit `e9d5caab919394072f9e0ab17f92806656acb4a2`.
- Sources : `src/graph-editor.js`, `src/ppro-bridge.js`, `src/ui-controller.js`, variante `cep/`.
- Intérêt : édition de courbes, bibliothèque de presets et workflow de lissage pour nos zooms.
- Observation technique : dans `bakeKeyframes` du pont UXP examiné, la courbe est échantillonnée avec ajout d’images clés intermédiaires dans une transaction. Ne pas présenter ce chemin comme la seule modification de poignées Bézier natives.
- **Aucun fichier de licence trouvé dans ce checkout.** Gratuit et dépôt public ne sont pas une autorisation de redistribution.
- Décision : référence fonctionnelle uniquement ; obtenir une licence explicite avant toute reprise. Le concept d’un preset de zoom peut être développé indépendamment.

## 9. Ambar

- Source : [Robelob/Ambar-AI-Video-Editor-Plugin-For-Premiere-Pro](https://github.com/Robelob/Ambar-AI-Video-Editor-Plugin-For-Premiere-Pro) ; commit `b876b0d34082b589b5a4c5f9ea0ed95fc542ebe2`.
- Sources : `js/ai/{whisper-service,ai-service}.js`, `js/core/{caption-engine,timeline-editor}.js`.
- Intérêt : workflow transcription vers montage, regroupement des mots en lignes, organisation et réutilisation d’un transcript.
- Le code prévoit Whisper local **et** OpenAI/Groq/Gemini ainsi que des fournisseurs LLM distants. L’absence d’envoi cloud dépend de la configuration.
- Le chemin `applyToTimeline` examiné envoie un SRT au pont CEP ; les paramètres de template ne prouvent pas à eux seuls un rendu animé. Les coupes ont encore un recours CEP.
- **Aucune licence trouvée dans ce checkout** : pas d’import de code.
- Décision : référence UX ; conserver notre faster-whisper local et développer notre éditeur/presets. Les services distants impliquent données transmises et tarification du fournisseur si on les propose ultérieurement.

## 10. ZXPInstaller

- Source : [elements-storage/ZXPInstaller](https://github.com/elements-storage/ZXPInstaller), **GPL-2.0**. Examen en ligne de `package.json`, `LICENSE` et `app/src/installer.js` ; pas de checkout épinglé obtenu pendant cette passe.
- Le manifeste annonce 1.8.2 et des tâches de packaging Mac ARM64/x64 et Windows. Cela ne valide pas leur fonctionnement sur notre installation.
- Le code invoque `ExManCmd` pour installer un `.zxp`. Ce n’est pas le mécanisme de distribution de notre `.ccx` UXP.
- Décision : lien vers un outil externe si une variante CEP devient nécessaire. Aucun module de montage à importer ; ne pas reprendre l’application Electron pour notre installateur UXP.

## Sous-titres, zooms et presse-papiers

### Sous-titres

Le moteur déjà branché est `faster-whisper==1.2.1` (`requirements-modules.txt`, `service/module_worker.py`). Reconnaissance et timings locaux ; l’éditeur interne et le rendu des presets constituent des couches supplémentaires encore en cours de finition. Aucun dépôt ci-dessus ne livre automatiquement tout le parcours demandé. Une transcription Adobe existante pourrait devenir une entrée alternative grâce au composant MIT du dépôt MCP.

### Zooms et locuteurs

OpenCurve apporte une référence pour les courbes. La voix nécessite l’identification des locuteurs et l’association à une position/caméra ; une transcription Whisper seule ne le fait pas. La lecture des couleurs de **clips de timeline**, demandée par Adam, doit être vérifiée avec l’API hôte : une couleur de média du chutier n’est pas un substitut équivalent. Toute application doit cibler une copie de séquence et rester annulable.

### Coller une image externe

Dans les points d’entrée examinés, aucun candidat n’apporte un module PNG/JPEG presse-papiers prêt à porter. Le [guide Adobe Clipboard UXP](https://developer.adobe.com/premiere-pro/uxp/resources/recipes/clipboard/) ne suffit pas à établir la disponibilité de lecture de bitmaps. Il faut vérifier ce support ou prévoir un petit auxiliaire natif Mac. La fonctionnalité attendue reste : collage à la demande, fichier média durable, import Premiere ; pas de lecture continue du presse-papiers. Non implémentée par cet audit.

## Ordre de développement recommandé

1. Terminer l’UX existante : une action principale, presets visibles, paramètres avancés repliés ; éditeur de sous-titres réellement connecté au rendu.
2. Fiabiliser le résultat dans Premiere : copie/nouvelle séquence, chemins durables, synchronisation, annulation. Les traitements sur rush source ne préservent pas automatiquement un montage existant.
3. Ajouter le collage d’images avec prise en charge Mac explicite.
4. Porter les petits composants MIT du MCP : inspection, transcript existant et validation du plan.
5. Isoler l’étude de mise à jour Auto-Editor ; vérifier schéma, fréquence d’images, audio lié et export avant bascule.
6. Ensuite commandes externes ; Focus Peaking reste séparé. OpenCurve/Ambar attendent une autorisation de reprise.

## Conditions de reprise et critères de validation

- MIT : conserver copyright et licence ; vérifier aussi les dépendances et fichiers tiers.
- GPL : conserver les licences et fournir le code correspondant aux composants distribués. Ne pas relabelliser les fichiers GPL en MIT. La licence MIT de notre code propre ne remplace pas celles des composants tiers.
- Sans licence : aucune redistribution ou copie dans notre produit prévue par cet audit.
- Aucune extension tierce n’a été installée/exécutée pour cet examen. Pas de preuve de compatibilité native par simple lecture du code.
- Avant activation produit : rush français, timings mot à mot, correction puis nouveau rendu ; coupes multipistes et fréquences fractionnaires ; absence de modification de l’original ; annulation ; import puis réouverture du projet ; collage PNG/JPEG avec alpha et chemins persistants. Ces validations restent à effectuer et ne sont pas annoncées comme réalisées.

## État de livraison

Ce rapport est une décision d’intégration. Le lecteur de transcription source MIT a ensuite été adapté dans `plugin/premiere-transcript.js`, avec sa licence conservée ; son parcours natif reste à valider. Les autres composants MIT cités ne sont pas portés. Les clones d’audit sont sous `.runtime/repo-audit/` et ne sont pas embarqués dans l’extension. Les moteurs déjà intégrés et les travaux UX en cours sont distincts de cette livraison documentaire.
