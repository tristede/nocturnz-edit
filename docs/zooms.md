# Zooms

## Interface et code ajoutés

- **Presets** : Fixe (zoom relatif existant), Lent in, Lent out, Punch in, Punch out, Aller-retour.
- **Aux cuts** : animation In, Out ou alternée à chaque clip sélectionné, dans l’ordre chronologique de chaque piste. L’alternance commence par In sur chaque piste.
- Intensité relative à l’échelle existante, durée sur tout le clip ou limitée à 0,3 / 0,6 / 1,2 / 2,4 secondes, courbe linéaire ou douce.
- Les animations sont limitées aux clips vidéo sélectionnés; elles ne créent pas de nouvelles coupes. Les clips composés, retimés, inversés, désactivés, les calques d’effets et les échelles déjà animées sont écartés.
- Les images clés sont calculées en ticks source et sur des intervalles d’images de la séquence. Le dernier point reste dans le clip. In va de l’échelle existante à l’échelle augmentée; Out revient de l’échelle augmentée à l’échelle existante.
- Une transaction reçoit les actions d’animation. L’interpolation linéaire est explicitement demandée entre les points; la courbe douce est échantillonnée avec une progression smoothstep.

**Validation** : seul le zoom relatif fixe a été appliqué et lu dans Premiere auparavant. Les nouveaux presets animés et le mode Aux cuts sont implémentés mais non exécutés/validés dans Premiere. Ils sont atténués et affichent « À valider dans Premiere ». Aucun test supplémentaire n’a été lancé pour cette tranche. Retour Annuler, images clés sur rushes avec point d’entrée non nul, cadence source différente, transitions et état de verrouillage restent à vérifier dans l’hôte. L’API UXP VideoTrack documentée ne fournit pas de lecture de verrouillage; aucune protection des pistes verrouillées n’est revendiquée ici.

## Interlocuteur — demande d’Adam

Deux sources indépendantes à proposer :

1. **Libellés des clips de la timeline**, choisis comme fonctionnement habituel par Adam. Le tri couleur déjà réalisé doit être réutilisé. Chaque couleur doit pouvoir être associée à un interlocuteur et à son cadrage (position/échelle).
2. **Voix** : analyse des locuteurs puis association de chaque voix à son cadrage.

Les presets doivent pouvoir servir de mouvement pour ces cadrages. Le mode Libellés ne doit pas déclencher d’analyse vocale.

### Libellés — tranche implémentée

Le bouton **Lire les libellés enregistrés** lit le `.prproj` du projet actif via le service local. Il récupère les propriétés `asl.clip.label.name` et `asl.clip.label.color` du `VideoClip` référencé par chaque occurrence de timeline. Aucun repli sur la couleur du `ProjectItem` ou du master clip n’est effectué. Le fichier est lu uniquement; le service n’écrit pas le projet et ne déclenche pas de sauvegarde Premiere.

Parcours :

1. Enregistrer les couleurs dans Premiere, ouvrir Zooms → Interlocuteur → Libellés timeline, puis lire les libellés enregistrés.
2. Cadrer un clip dans Premiere, le sélectionner, puis **Capturer le cadrage sélectionné** sous sa couleur. Un nom d’interlocuteur peut être associé à la couleur.
3. Capturer un cadrage pour chaque source vidéo utilisée par cette couleur. Les prises d’une autre source ne reçoivent pas un cadrage capturé sur un fichier différent.
4. Sélectionner les clips à traiter, choisir Fixe ou un preset animé, puis **Appliquer les cadrages**.

La capture lit position, point d’ancrage, échelle et rotation de Trajectoire. Le mode Fixe reprend exactement le cadrage capturé; l’intensité supplémentaire est réservée aux presets animés. Les cadrages et noms sont conservés dans le dossier de données privé du plugin, par projet/séquence/couleur/source. Aucun média n’est envoyé sur un serveur distant. Les captures deviennent inapplicables si les dimensions de la séquence changent.

Avant capture et application, le panneau relit le fichier, compare son SHA-256, la séquence, les dimensions et la cadence. Un clip sélectionné doit correspondre sans ambiguïté à une occurrence enregistrée : piste, source, nom et bornes source/timeline. Les captures manquantes, les clips retimés/inversés/composés, les pistes verrouillées ou muettes dans la sauvegarde et les trajectoires animées sont écartés. Une transaction reçoit les actions natives UXP; une sélection sans cible compatible ne crée aucune action.

**Limite de fraîcheur** : les couleurs et verrous viennent de la dernière sauvegarde. Des couleurs ou des verrous modifiés uniquement en mémoire ne peuvent pas être détectés par cette lecture. Le panneau demande de les enregistrer puis de relire les libellés. Les changements de montage détectables par les coordonnées sont refusés. Ce mode ne constitue pas une lecture directe des couleurs actuellement affichées dans Premiere.

**Validation restante** : le lecteur et le parcours UXP sont implémentés; seule leur syntaxe a été contrôlée pour cette tranche. Aucun nouveau test ni exécution sur le projet d’Adam n’a été effectué. Lecture réelle de deux occurrences d’un même rush portant des couleurs différentes, décodage visuel des couleurs, capture des points, application native et Annuler restent à valider dans Premiere. Le mode demeure grisé jusqu’à cette validation.

### Voix

Choix présent mais grisé en développement. Aucun traitement vocal n’est exécuté lors de l’utilisation des libellés. La détection des locuteurs et leur association aux cadrages restent à brancher.

### Format du projet

Les chemins du graphe `.prproj` ont été identifiés à partir du code MIT [Pouf/py-premiere](https://github.com/Pouf/py-premiere), commit `38e72ef5d389f472183fb23c471f9c9eb79394f8`, notamment `parsers/sequence.py`, `models/media_import.py`, `parsers/project.py` et `xml/document.py`. Le lecteur Nocturnz est volontairement limité à cette extraction et n’importe pas la bibliothèque. Sa licence est conservée dans `third_party/py-premiere.LICENSE`. Ce format interne n’est pas un contrat public de compatibilité Adobe; un graphe inconnu ou ambigu est refusé.

## Références techniques

- [Adobe — ComponentParam](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/componentparam)
- [Adobe — Keyframe](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/keyframe)
- [Adobe — TickTime](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/ticktime)
- [Adobe — VideoClipTrackItem](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videocliptrackitem)
- [Adobe — VideoTrack](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videotrack)
- [Adobe — ProjectItem et libellés du chutier](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/projectitem)

Les sources amont disponibles restent inchangées dans `vendor/`; le nouveau code du panneau est original Nocturnz.
