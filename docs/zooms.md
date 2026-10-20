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

Le mode Voix est désormais implémenté avec deux modes audio ; sa validation complète dans Premiere reste à effectuer. Le mode Libellés continue à fonctionner indépendamment, sans analyse vocale.

1. Sélectionner la vidéo dans Premiere puis **Charger la vidéo sélectionnée**. Le panneau extrait une image locale du rush et affiche le plan large, sans modifier Trajectoire dans la séquence.
2. Nommer les deux personnes. Cliquer sur une vignette, déplacer son rectangle sur l’image, puis régler la taille avec la poignée ou le curseur de zoom. Les deux vignettes montrent le cadrage obtenu. Les presets Large / Portrait / Serré règlent rapidement la taille ; la barre sous l’image permet de choisir une autre image du rush.
3. **Les deux ensemble** : choisir la piste de dialogue puis **Identifier les deux voix**. Le moteur propose des répliques réparties dans la sélection, en cherchant deux voix différentes. Écouter l’extrait dans le panneau, puis répondre **Qui parle dans cet extrait ?** avec le nom d’une personne. Répéter pour la seconde. **Autre extrait** permet d’éviter une réplique confuse ou avec deux voix. Aucune lecture du curseur de Premiere ni enregistrement du microphone système.
4. **Un micro par personne** : associer une piste audio différente aux deux vignettes ; l’écoute d’exemples n’est pas nécessaire. Préparer les micros comme sources mono séparées s’ils sont stockés dans deux canaux d’un même fichier.
5. **Créer les zooms** enchaîne reconnaissance et application sur une nouvelle copie. La liste repliée des attributions permet des corrections ; **Appliquer les corrections** revient à la sélection source inchangée et crée une nouvelle version.

Le plan large provient d’un ajustement uniforme de la source dans les dimensions de la séquence, ou du plan large déjà conservé dans la configuration. Les cadrages sont calculés par transformation du rectangle de recadrage vers les valeurs de position/échelle natives ; ancrage et rotation sont conservés. L’aperçu ne simule pas les effets colorimétriques ni la composition des autres pistes. La tranche actuelle demande des pixels carrés. Les aperçus JPEG passent dans le canal HTTP local privé ; les extraits de quelques secondes utilisent des URL MP4 opaques de 128 bits avec support des requêtes Range. Ils expirent au nettoyage des aperçus de plus de 24 h, au prochain appel. Aucun aperçu n’est importé dans le projet.

Les rectangles sont utilisables à la souris et au clavier : flèches pour déplacer, Maj pour un pas plus grand, +/− pour changer la taille. Les couleurs violet/bleu sont accompagnées des noms ; la sélection est également représentée par la vignette active.

Le moteur mixte utilise Silero VAD puis des embeddings WeSpeaker ResNet34-LM via sherpa-onnx, comparés aux deux références, sans LLM ni service cloud. Le modèle est téléchargé séparément et vérifié par SHA-256. Il est entraîné sur VoxCeleb et n’est pas validé ici sur la voix française d’Adam. Des voix proches, du bruit et des conversations simultanées peuvent provoquer des erreurs. Les décisions insuffisamment confiantes utilisent le plan large ; ce n’est pas une garantie de détection des chevauchements de voix.

Le mode deux micros compare l’énergie de la parole sur les pistes, avec normalisation des niveaux et décision neutre si les deux scores sont proches. La diaphonie et une musique dominante peuvent affecter le résultat.

L’analyse respecte les points d’entrée/sortie et positions des clips audio de la timeline. Les cibles vidéo doivent appartenir à une même source caméra par traitement et être à vitesse normale ; les clips composés ou déjà animés sont refusés. Les pistes ne sont pas analysées comme un mixeur Premiere : les effets, niveaux et routages de sortie Premiere ne sont pas rendus ; les fichiers source et leurs coupes sont utilisés. La première piste audio embarquée de chaque fichier est décodée.

L’application ajoute des images clés natives de position, échelle, ancrage et rotation sur une copie de la séquence : HOLD pour les sauts, LINEAR échantillonné avec un lissage pour les mouvements. Le cadrage change quand l’intervenant change, sans réencoder la vidéo, sans couper/modifier l’audio et sans modifier la séquence originale. Les réglages des deux personnes et les références temporelles sont conservés dans les données privées du plugin, par projet/source. L’analyse vocale et ses décisions restent un résultat de tâche local. L’audio et la sélection sont vérifiés de nouveau avant application ; les paramètres animés existants sont refusés.

Installation : `npm run setup:modules`, puis `npm run setup:speakers`. La seconde installation ajoute sherpa-onnx 1.13.8 et un modèle ONNX de 26,5 Mo ; elle ne lit aucun média. Installation, empreinte, syntaxe JavaScript et compilation Python contrôlées. Le chargement réel de l’image du rush et l’affichage des cadres/vignettes ont été observés dans Premiere Beta sur le projet isolé Nocturnz_Zooms_validation. La lecture audio, la reconnaissance complète et l’application native des nouveaux cadrages ne sont pas déclarées validées. Aucun test automatisé ajouté/exécuté pour cette tranche.

### Mouvements et recalage aux cuts — 20 octobre 2026

Dans Voix, **Mouvement** propose Zoom in, Zoom out, Jump (sans animation), ou Alterner. Le mode Alterner affiche trois cases : seuls les types cochés sont joués, dans l’ordre In → Out → Jump. L’alternance avance à chaque segment attribué à une personne, dans l’ordre chronologique des clips sélectionnés ; un silence/segment neutre reste au plan large. Chaque cut réinitialise le mouvement. In part du plan large vers le cadrage personnel ; Out effectue le trajet inverse ; Jump pose immédiatement le cadrage personnel. Les transitions sont bornées au segment et à la dernière image disponible. Les clés de fin sont maintenues jusqu’au segment suivant. La durée (0,3 / 0,6 / 1,2 s) est rangée dans Options avancées. Le mode Cuts propose aussi l’alternance In/Out/Jump.

**Recharger l’aperçu** reste hors de la zone vidéo : il recharge l’image choisie et reconstruit les vignettes sans effacer les noms, cadrages, références vocales ou décisions d’analyse. La requête d’aperçu expire côté panneau après 45 s ; une réponse devenue obsolète ne remplace pas le nouvel aperçu.

**Recaler les visages à chaque cut · bêta**, désactivé par défaut dans Options avancées, effectue une analyse locale avant de créer la copie, sans calcul pendant la lecture. Une image de référence (celle de l’éditeur) puis une image environ 120 ms après l’entrée de chaque clip sont extraites, dans le même espace de plan large, au maximum 960 px. Le détecteur frontal Haar d’OpenCV est exécuté avec un seul thread. Les résultats sont mis en cache privé pendant au plus 24 h, indexés sur le chemin, taille/date de modification du média, instant et transformation de cadrage.

Le recalage est volontairement limité à une même caméra et à de petits déplacements : un seul visage doit être détecté dans chaque rectangle de référence ; les correspondances candidates sont filtrées par position, taille et ressemblance d’une petite vignette en niveaux de gris. Ce mécanisme n’est pas un modèle d’identité faciale : il ne gère pas de manière fiable les changements de place, de caméra, de profil ou les occultations. Les correspondances absentes, proches en score ou partagées entre personnes conservent le cadrage manuel ; leur nombre figure à la fin. Le décalage du visage est reporté sur le rectangle sans changer sa taille ni la composition manuelle relative. Il n’y a pas de suivi entre les cuts, ni de détection des cuts intégrés dans un fichier unique. Annuler interrompt la préparation avant toute création de séquence ; une requête d’image en cours peut finir avant que l’annulation soit prise en compte.

Cette tranche a reçu des contrôles de syntaxe JavaScript/Python et de diff. Les mouvements, le reset et le recalage n’ont pas encore été validés de bout en bout dans Premiere. Aucun test automatisé ajouté ou exécuté.

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
