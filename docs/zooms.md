# Zooms

## Conservation de la séquence source

Depuis la demande du 20 octobre, chaque application (Fixe, Presets animés, Aux cuts et Libellés) commence par une duplication native de la séquence complète. La copie reçoit un nom distinct, par exemple `Montage — Nocturnz Zooms 1`, et s’ouvre dans la timeline. Seuls les clips correspondant à la sélection de départ y reçoivent les zooms via Trajectoire. Aucun calque d’effets n’est créé, aucun média n’est réencodé et aucune sauvegarde automatique n’est déclenchée.

Les paramètres à modifier sont relus sur les clips de la copie; les paramètres de la séquence source ne sont jamais utilisés comme cibles d’actions. La correspondance vérifie piste, élément média, nom et bornes source/timeline. Une duplication refusée, plusieurs nouvelles séquences, un élément de projet non distinct ou une correspondance ambiguë bloquent l’application. Il n’existe aucun repli sur une modification de l’original. Une copie déjà créée peut rester dans le projet en cas d’échec ultérieur, sans zoom appliqué.

Duplication et application sont deux transactions distinctes : Annuler après une application retire les zooms et le renommage de la copie, puis une autre annulation peut retirer la duplication. Le parcours sur copie est testé avec un hôte simulé, mais sa validation native reste à effectuer. Le module reste grisé. Les séquences imbriquées ne sont pas parcourues pour en modifier les clips internes.

## Interface et code ajoutés

- **Presets** : Fixe (zoom relatif existant), Lent in, Lent out, Punch in, Punch out, Aller-retour.
- **Aux cuts** : animation In, Out ou alternée à chaque clip sélectionné, dans l’ordre chronologique de chaque piste. L’alternance commence par In sur chaque piste.
- Intensité relative à l’échelle existante, durée sur tout le clip ou limitée à 0,3 / 0,6 / 1,2 / 2,4 secondes, courbe linéaire ou douce.
- Les animations sont limitées aux clips vidéo sélectionnés; elles ne créent pas de nouvelles coupes. Les clips composés, retimés, inversés, désactivés, les calques d’effets et les échelles déjà animées sont écartés.
- Les images clés sont calculées en ticks source et sur des intervalles d’images de la séquence. Le dernier point reste dans le clip. In va de l’échelle existante à l’échelle augmentée; Out revient de l’échelle augmentée à l’échelle existante.
- Une transaction reçoit les actions d’animation. L’interpolation linéaire est explicitement demandée entre les points; la courbe douce est échantillonnée avec une progression smoothstep.

**Validation** : seul le zoom relatif fixe a été appliqué et lu dans Premiere auparavant. Les nouveaux presets animés et le mode Aux cuts sont implémentés mais non exécutés/validés dans Premiere. Ils sont atténués et affichent « À valider dans Premiere ». Retour Annuler, images clés sur rushes avec point d’entrée non nul, cadence source différente, transitions et état de verrouillage restent à vérifier dans l’hôte. L’API UXP VideoTrack documentée ne fournit pas de lecture de verrouillage; aucune protection des pistes verrouillées n’est revendiquée ici.

## Interlocuteur — demande d’Adam

Deux sources indépendantes à proposer :

1. **Libellés des clips de la timeline**, choisis comme fonctionnement habituel par Adam. Le tri couleur déjà réalisé doit être réutilisé. Chaque couleur doit pouvoir être associée à un interlocuteur et à son cadrage (position/échelle).
2. **Voix** : analyse des locuteurs puis association de chaque voix à son cadrage.

Les presets doivent pouvoir servir de mouvement pour ces cadrages. Le mode Libellés ne doit pas déclencher d’analyse vocale.

### Libellés — tranche implémentée

Le bouton **Lire les libellés enregistrés** lit le `.prproj` du projet actif via le service local. Il récupère les propriétés `asl.clip.label.name` et `asl.clip.label.color` du `VideoClip` référencé par chaque occurrence de timeline. Aucun repli sur la couleur du `ProjectItem` ou du master clip n’est effectué. Le fichier est lu uniquement; le service n’écrit pas le projet et ne déclenche pas de sauvegarde Premiere.

Quand le projet ne contient que l’index du libellé, le service consulte uniquement les 16 noms et couleurs du profil Adobe local correspondant à la version majeure de l’hôte. Il exige un profil unique et refuse de choisir entre plusieurs profils. Les couleurs COLORREF sont décodées en BGR. Sans palette résolue, l’interface indique explicitement qu’elle affiche les identifiants de libellés.

Parcours :

1. Enregistrer les couleurs dans Premiere, ouvrir Zooms → Interlocuteur → Libellés timeline, puis lire les libellés enregistrés.
2. Cadrer un clip dans Premiere, le sélectionner, puis **Capturer le cadrage sélectionné** sous sa couleur. Un nom d’interlocuteur peut être associé à la couleur.
3. Capturer un cadrage pour chaque source vidéo utilisée par cette couleur. Les prises d’une autre source ne reçoivent pas un cadrage capturé sur un fichier différent.
4. Sélectionner les clips à traiter, choisir Fixe ou un preset animé, puis **Créer la version cadrée**. La sélection est retrouvée dans une nouvelle copie de la séquence; les actions s’appliquent à cette copie.

La capture lit position, point d’ancrage, échelle et rotation de Trajectoire. Le mode Fixe reprend exactement le cadrage capturé; l’intensité supplémentaire est réservée aux presets animés. Les cadrages et noms sont conservés dans le dossier de données privé du plugin, par projet/séquence/couleur/source. Aucun média n’est envoyé sur un serveur distant. Les captures deviennent inapplicables si les dimensions de la séquence changent.

Avant capture et application, le panneau relit le fichier, compare son SHA-256, la séquence, les dimensions et la cadence. Un clip sélectionné doit correspondre sans ambiguïté à une occurrence enregistrée : piste, source, nom et bornes source/timeline. Les captures manquantes, les clips retimés/inversés/composés, les pistes verrouillées ou muettes dans la sauvegarde et les trajectoires animées sont écartés. Une transaction reçoit les actions natives UXP; une sélection sans cible compatible ne crée aucune action.

**Limite de fraîcheur** : les couleurs et verrous viennent de la dernière sauvegarde. Des couleurs ou des verrous modifiés uniquement en mémoire ne peuvent pas être détectés par cette lecture. Le panneau demande de les enregistrer puis de relire les libellés. Les changements de montage détectables par les coordonnées sont refusés. Ce mode ne constitue pas une lecture directe des couleurs actuellement affichées dans Premiere.

**Validation native du 20 octobre 2026 — Premiere Beta 27.0.0** : projet isolé de trois occurrences d’une mire PNG, 1920 × 1080 à 25 i/s. Le panneau lit Rose sur deux occurrences et Mangue sur la troisième, toutes issues du même média. La connexion locale, la résolution des noms/couleurs, la capture d’un cadrage à 125 % avec position normalisée (0,35 ; 0,5), puis sa conservation après rechargement du plugin ont été vérifiées. Le SDK renvoie les points sous `{value: [x, y]}`; leur lecture est désormais compatible avec cette représentation. Le rafraîchissement de la liste conserve exactement deux lignes.

**Reprise native** : le sélecteur initial Fixe a été vérifié. L’ancien parcours direct a appliqué le cadrage Rose au troisième clip : échelle 100 → 125 %, position (0,5 ; 0,5) → (0,35 ; 0,5); le premier clip et le clip Mangue sont restés inchangés. Annuler a été déclenché dans le menu Édition, mais le débogueur s’est réinitialisé avant la relecture des valeurs : le retour n’est pas confirmé.

**Restant** : le parcours direct a ensuite été remplacé par une duplication obligatoire à la demande d’Adam. Ce nouveau parcours et Annuler, ainsi que les animations, restent à valider dans l’hôte : le Mac s’est à nouveau verrouillé. Le mode demeure grisé. Le protocole et la mire reproductible sont dans `docs/premiere-validation.md`. Les tests du lecteur, des points et de la protection par copie sont rapportés séparément dans `docs/status.md`.

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
