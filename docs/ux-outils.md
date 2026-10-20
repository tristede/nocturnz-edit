# Parcours des outils — 20 octobre 2026

## Composants communs

- Source : nom du média et une action « Choisir ». Lancer sans source tente la sélection de timeline puis ouvre le sélecteur de fichiers.
- Une action principale par étape. Les réglages techniques, modèles, interchange JSON et historique sont dans « Options avancées ».
- Les traitements restent annulables. Les tuiles non validées dans Premiere restent atténuées.
- Les sections repliables utilisent `hidden`, `aria-expanded` et `aria-controls` ; activation au clic, Entrée ou Espace. Contrôles et galerie utilisent les variables de `panel.css`.
- Les paramètres utiles au choix du résultat restent visibles : format de recadrage, nombre d’extraits, opération audio, mots à censurer, recette, etc. Les autres sont disponibles en avançant les réglages.

## Sous-titres

1. « Créer les sous-titres » transcrit le rush avec faster-whisper local.
2. Les mots horodatés s’ouvrent automatiquement dans l’éditeur paginé. La saisie modifie le brouillon sans exporter de JSON.
3. Quatre presets visibles : Nocturnz, Impact, Néon et Sobre. L’aperçu du panneau illustre le style ; il ne lit pas le rush.
4. « Importer les sous-titres » envoie le brouillon corrigé au service, crée un nouveau rendu puis l’importe au chutier. Par défaut : vidéo MOV transparente avec surlignage des mots ; SRT/VTT/ASS disponibles dans les options avancées.

Le résultat animé est un média à placer au-dessus de la vidéo, pas un texte natif modifiable dans les graphismes de Premiere. Les corrections se font dans notre éditeur, puis par nouveau rendu. Aucun ajout silencieux à la timeline.

Option avancée : « Reprendre la transcription Premiere » lit celle d’un clip source sélectionné **dans le chutier**, sans lancer une deuxième reconnaissance. Le lecteur est adapté du dépôt MIT AdobePremiereProMCP ; les durées Adobe sont converties en bornes début/fin avant traitement. La disponibilité de l’API dépend de l’hôte.

Les brouillons en cours sont conservés en mémoire tant que le panneau reste chargé. Les rendus et transcriptions traités persistent dans `.runtime/module-jobs`. Les brouillons non rendus ne sont pas une sauvegarde durable.

## Silences

- Naturel : −35 dB, 400 ms, marges 120/120 ms.
- Dynamique : −30 dB, 250 ms, marges 80/80 ms.
- Prudent : −40 dB, 650 ms, marges 200/200 ms.
- Analyse puis « Créer la version nettoyée » : export et import du XML dans une seule action. Révision des coupes et exports manuels repliés.
- Fichier choisi : cadence détectée avec FFprobe ; média audio sans piste vidéo : 25 i/s. Sélection timeline : cadence exacte de la séquence.

Le traitement porte sur une source/plage, pas sur un montage multipiste existant. Nouvelle séquence source ; les effets du montage ne sont pas repris. Cette limite reste visible avant l’import.

## Images

- Mac : « Coller une image » ou ⌘V dans l’outil Images. Prend en charge les bitmaps PNG/TIFF du presse-papiers et les fichiers image locaux copiés, convertis en PNG avec transparence.
- « Choisir une image » reste disponible par sélection de fichier.
- L’image est importée dans le chutier ; la timeline n’est pas modifiée. Si l’import échoue, le bouton « Importer » permet de réessayer.
- Installation : `npm run setup:clipboard` compile le petit auxiliaire AppKit avec les outils de développement Apple. Pas de dépendance Python supplémentaire ; aucune lecture du presse-papiers à l’installation.
- Lecture uniquement sur action explicite, sans surveillance ni téléchargement de liens. Limite : 64 Mio et 100 millions de pixels.
- Les images collées restent dans `.runtime/clipboard` après redémarrage. **Conserver ce dossier**, ou collecter les médias avec le projet Premiere avant de déplacer/supprimer le dépôt. Les fichiers choisis restent référencés à leur emplacement original.
- Windows : choix de fichier disponible ; collage natif non implémenté.

## Vérification de cette tranche

Contrôles de syntaxe JavaScript/Python et compilation de l’auxiliaire Swift effectués. Aucune lecture du presse-papiers pour vérifier le helper, aucun nouveau test automatisé ajouté/exécuté. Les nouveaux parcours complets restent à valider dans Premiere ; ne pas confondre implémentation et validation native.
