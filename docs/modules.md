# Raccordement des modules — 20 octobre 2026

Les 15 modules auparavant sans adaptateur sont reliés au panneau et au service. Silences conserve son moteur auto-editor et Zooms son adaptateur natif sur copie. Les fonctions amont sont importées depuis le snapshot OpenCut présent dans `vendor/sources/opencut`; ces sources ne sont pas modifiées.

## Parcours commun

1. Choisir un module puis les fichiers, ou récupérer les médias de la sélection Premiere.
2. Régler les paramètres et lancer. Pour les outils texte, une transcription peut être produite automatiquement, choisie dans un fichier ou réutilisée depuis une tâche récente de la même source.
3. Suivre le traitement et l’annuler si nécessaire. Les tâches et leurs sorties restent dans `.runtime/module-jobs/<id>/`; un redémarrage signale les tâches interrompues.
4. Ouvrir/enregistrer les résultats texte ou importer les sorties compatibles dans le projet. Une transcription s’ouvre dans un éditeur de mots horodatés paginé; ses corrections s’enregistrent dans un nouveau fichier choisi par l’utilisateur.
5. Pour Hésitations/Répétitions, cocher les coupes à retirer, puis générer le XML révisé. La suppression n’est jamais appliquée silencieusement à la timeline.

La sélection Premiere fournit les **fichiers source entiers**, pas les seuls points d’entrée/sortie du montage. Ces adaptateurs ne recopient pas les effets ni le montage existant. Les XML importent de nouvelles séquences source; les rendus importent de nouveaux médias. Aucun adaptateur de ces 15 modules ne modifie une séquence Premiere ou un fichier source. Les zooms utilisent un parcours natif distinct avec duplication obligatoire.

## Fonctions raccordées

| Module | Fonctionnement disponible | Sorties |
|---|---|---|
| Transcription | faster-whisper local, langue et modèle; correction des mots dans le panneau | Transcription JSON horodatée |
| Hésitations | Détection des fillers avec mots personnalisés français; coupes révisables | Propositions, transcription, XML après révision |
| Répétitions | Similarité et regroupement des reprises; coupes révisables | Propositions, transcription, XML après révision |
| Sous-titres | SRT, VTT, ASS et rendu animé via styled_captions | Texte ou vidéo de sous-titres séparée |
| Podcast | Décisions de caméra par énergie de prises séparées, ou JSON de prises de parole | Plan et XML podcast |
| Cadrages | Côte à côte, grille 2 × 2 et incrustation | Nouveau rendu MP4 |
| Recadrage | Centré, automatique ou visage; format vertical/carré/horizontal | Nouveau rendu MP4 |
| Shorts | Fenêtres classées par heuristique locale ou sélection via Ollama | Propositions et XML d’extraits |
| Chapitres | Ollama local, avec repli heuristique amont si indisponible | JSON et texte de chapitres |
| B-roll | Suggestions sur transcription et rapprochement avec les plans locaux choisis | Plan de propositions JSON |
| Audio | Normalisation LUFS, débruitage FFmpeg et ducking voix/musique | Nouveaux WAV |
| Musique | Adaptation à une durée, tonalité et effets sonores synthétiques | Nouveau WAV |
| Censure | Bip/silence sur les mots ou floutage des visages | WAV, remux vidéo pour censure verbale, ou rendu vidéo flouté |
| Recettes | Suites prédéfinies Interview, Réseaux sociaux et Audio via play_macro | Résultats séparés de chaque étape; échecs comptabilisés |
| Traitement par lot | Application d’un outil à plusieurs fichiers, bilan par fichier | Résultats séparés par source |

Podcast et Cadrages exigent des sources déjà synchronisées au même départ. L’analyse d’énergie compare des prises séparées par interlocuteur; elle ne réalise pas la diarisation d’un mix stéréo unique. Les Shorts ne sont pas encore un pipeline complet de recadrage + sous-titres + exports par plateforme. B-roll propose un plan; l’insertion automatique dans la timeline reste à faire. Les recettes regroupent les traitements, elles ne composent pas encore un montage Premiere final.

## Runtime installé

`npm run setup:modules` crée un environnement Python privé, installe les dépendances épinglées, prépare FFmpeg/FFprobe et télécharge les modèles Whisper tiny/base/small aux révisions immuables indiquées par le snapshot amont. `--model small` permet de cibler un modèle. `npm run sync:catalog` régénère uniquement le catalogue du panneau depuis le schéma Python.

Sur ce Mac ARM64, FFmpeg est compilé depuis `FFmpeg/FFmpeg` commit `9badbee44dab9530a02ed0201ce9b8e16a929a6e` et x264 depuis `0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee`, dans `.runtime/toolchain`. La compilation inclut libx264 et zlib. Les contrôles de provenance amont sont conservés et acceptent les deux exécutables. Les binaires, modèles et résultats ne sont pas ajoutés à Git. Cette procédure n’est pas un installateur Mac/Windows final.

Les workers traitent localement avec `OPENCUT_LOCAL_ONLY=1`; aucun fournisseur cloud n’est configuré. Ollama est facultatif pour les chapitres et la sélection sémantique des Shorts; l’utilisateur doit installer/démarrer son service et son modèle local s’il choisit cette variante. Les téléchargements de modèles ont lieu dans l’installateur, séparément des workers.

## Contrat du service

- `GET /api/v1/modules` : catalogue, runtime et diagnostics.
- `POST /api/v1/modules/<id>/run` : `{paths: [...], options: {...}}`, réponse 202 avec identifiant de tâche.
- `GET /api/v1/module-jobs` : trente tâches récentes sans les gros résultats.
- `GET /api/v1/module-jobs/<id>` : progression, erreurs, résultat et fichiers produits.
- `POST /api/v1/module-jobs/<id>/cancel` : annule le worker et ses sous-processus.
- `POST /api/v1/module-jobs/<id>/review` : indices de coupes acceptées; nouvelle tâche XML.
- `GET /api/v1/module-jobs/<id>/artifacts/<index>` : lecture des seules sorties texte du dossier de tâche, jusqu’à 4 Mio.

Les protections Host/Origin et l’en-tête client existants s’appliquent. Aucun CORS universel ni route générique exécutant du code ou des commandes n’a été ajouté. Les noms de modules, paramètres, chemins locaux et plages numériques sont contrôlés. La file accepte huit tâches actives et exécute un worker à la fois; les sorties sont isolées par tâche.

## Vérifications réalisées et limites

Les 15 adaptateurs ont chacun terminé un traitement réel par leur worker. Les opérations ont utilisé uniquement une vidéo synthétique de six secondes, une tonalité et une transcription synthétique horodatée. Les sorties comprennent SRT, XML podcast et Shorts, MP4, WAV, plans JSON et résultats par lot. Une transcription avec le modèle tiny a également terminé sur une tonalité; elle ne mesure pas la qualité de reconnaissance du français.

Variantes exécutées : sous-titres animés, recadrage visage, débruitage, ducking, SFX, floutage et recette Réseaux sociaux. L’export des coupes cochées a produit son XML. L’absence de visage réel dans les mires ne valide pas la qualité du suivi ou du masquage des visages. Les propositions heuristiques ne constituent pas une validation éditoriale.

La syntaxe Python/JavaScript et les espaces du diff ont été contrôlés. La suite automatisée antérieure n’a pas été relancée pour cette tranche. Le parcours visuel UXP et l’import des nouvelles sorties dans Premiere restent à valider. L’aperçu navigateur `file://` a été refusé par la politique du navigateur; ce refus n’a pas été contourné. Les tuiles restent atténuées jusqu’à la validation native.
