# État des fonctions

## Tranche UX et collage — 20 octobre 2026

- Options avancées repliées pour les quinze adaptateurs ; paramètres principaux ciblés par outil.
- Sous-titres : éditeur ouvert automatiquement après Whisper, quatre presets, envoi direct du brouillon au rendu et import au chutier. Option de lecture d’une transcription de clip source Adobe, adaptée du composant MIT AdobePremiereProMCP.
- Silences : trois rythmes, cadence automatique pour les fichiers, révision facultative et export/import en une action vers une nouvelle séquence source.
- Images : dix-huitième tuile, collage natif Mac à la demande, PNG durable et import au chutier, choix de fichier alternatif. Helper Swift compilé et installé dans `.runtime/bin`.
- Contrôles de syntaxe et compilation seulement pour cette tranche. Aucun test ajouté/exécuté, aucun collage lu à l’installation, parcours complets Premiere non validés ; tuiles maintenues atténuées.
- [Périmètre détaillé](ux-outils.md) et [audit des dix nouveaux projets](audit-nouveaux-repos.md).


## Validation dans Premiere Pro Beta — 2026-10-19

- Accueil refait en 17 tuiles SVG et titre, sans textes explicatifs. Ouverture de Zooms, ouverture de Silences avec son état « À développer » et retour à l’accueil vérifiés dans Premiere. Le bloc séquence et les diagnostics sont accessibles via Réglages. Les icônes originales du projet sont sous la licence MIT du dépôt.

- UXP Developer Tools 2.3.0 installé depuis Creative Cloud; `Nocturnz Edit` (ID `xyz.nocturnz.edit`) ajouté à l’espace de travail et chargé avec succès dans Premiere Beta.
- Lecture réelle de la séquence `LOSSA VF EDIT` réussie: 3840 × 2160, base Premiere `10160640000`, 7 pistes vidéo et 166 clips lus.
- Lecture réelle des effets de `C3887.MP4`, piste 1: composant `Trajectoire` (`AE.ADBE Motion`), échelle initiale 112,98699 %.
- Application réelle du zoom relatif +10 % réussie dans Premiere: échelle affichée 124,28569 %. L’action est dans une transaction Premiere.
- Une commande Annuler a ensuite été lancée depuis Édition. Impossible de confirmer le retour à l’échelle initiale: la sélection a disparu avant une nouvelle lecture. Le projet n’a pas été sauvegardé; son titre indique toujours `Modifié`.

| Famille | État | Validation |
|---|---|---|
| Panneau UXP Nocturnz Edit | Implémenté dans le dépôt | Chargé dans Premiere Beta via UXP Developer Tools 2.3.0 |
| Lecture séquence/pistes/clips | Implémentée dans l’adaptateur | Vérifié dans l’hôte: 7 pistes, 166 clips, 3840 × 2160 |
| Lecture des effets et paramètres sélectionnés | Implémentée dans le panneau | Vérifiée sur `C3887.MP4`, dont Trajectoire et échelle |
| Zoom relatif | Implémenté dans le panneau | Appliqué au clip réel: 112,99 % → 124,29 %; retour après Annuler à revalider |
| Format temporel partagé et calcul du zoom | Implémentés au cœur | Tests Node locaux à jour; cadence fractionnaire, ticks longs et calcul relatif |
| Service local | Tâches et routes Silences implémentées | Contrat HTTP testé hors restriction de bind du bac à sable avec le moteur réel; pairage utilisateur restant |
| Duplication/coupe/images clés | À faire | Pas encore intégrées |
| Autres modules du périmètre final | À faire | Voir feuille de route |

## Tranche Silences — moteur réel

- auto-editor 29.3.1 officiel installé en local, version et SHA-256 vérifiés; intégration par CLI et licence conservée.
- Source unique : seuil/piste sonore, durée minimale, marges, correspondance exacte des ticks, sélection et refus de coupes, XML Premiere généré par le moteur amont.
- Service : tâches asynchrones persistées, annulation, statut d’interruption après redémarrage, protection des origines et exports révisés distincts. Pas de cache d’analyse partagé ni de pairage utilisateur pour le moment.
- Validation réelle locale : audio synthétique de 5 s, silences détectés, marges contrôlées, refus de la seconde coupe, XML final de 81 images à 25 i/s. Tests HTTP avec le même moteur. Aucun objet simulé pour cette validation moteur.
- Panneau : formulaire et révision implémentés; choix de fichier, sélection source et import XML UXP restent à vérifier dans Premiere. Module maintenu grisé.
- Périmètre restant : analyse de timeline complète, préservation des effets/corrections, VAD, cache partagé, import Premiere validé.

## Import des sources du brief

Sources de six dépôts copiées avec licences, commits et SHA-256 dans `vendor/manifest.json`. Correspondance des 17 modules dans `vendor/module-map.json`. Les fichiers sources importés sont inchangés; les tests et installateurs amont n’ont pas été exécutés. Aucun nouveau module n’est déclaré opérationnel sur la seule base de cet import : les adaptateurs UXP restent à développer. Les outils partiels restent grisés.

`auto-zoom-premiere` est référencé sans copie publique, faute de licence identifiable. Voir `vendor/README.md` pour les exclusions de médias, modèles et binaires.

## Zooms — modes et presets

Interface organisée en Presets, Aux cuts et Interlocuteur. Six presets disponibles dans le code : Fixe, Lent in/out, Punch in/out, Aller-retour. L’animation In/Out et l’alternance par clip sélectionné utilisent des images clés relatives à l’échelle existante; elles restent à valider dans Premiere et sont atténuées.

Interlocuteur reste grisé jusqu’à validation Premiere. Le mode **Libellés timeline** est implémenté : lecture du projet enregistré, extraction des couleurs propres aux occurrences, capture/mémorisation des cadrages par couleur et source, application fixe ou animée aux clips sélectionnés. Contrôles de contexte, SHA-256 et coordonnées avant application; pas de lecture de couleur du chutier. Le mode Voix reste à développer. Voir `docs/zooms.md`.

## Validation native des libellés — 2026-10-20

- Projet isolé `validation-local/Nocturnz_Zooms_validation.prproj`, séquence de trois mires PNG de quatre secondes à 25 i/s; aucun changement au montage LOSSA.
- Connexion HTTP du panneau au service confirmée via `localhost:8765`. L’autorisation par adresse IP seule était refusée par UXP sur cet hôte.
- Lecture de deux libellés différents sur un même média confirmée : Rose (deux occurrences, `#8c0235`) et Mangue (une occurrence, `#893a04`). Les noms/couleurs viennent du profil Adobe 27 unique; les clips sauvegardés ne contenaient que les index.
- Capture de position/ancrage/échelle/rotation native confirmée : premier clip à 125 %, position (0,35 ; 0,5). Conservation du cadrage après rechargement du plugin confirmée.
- Corrections de compatibilité UXP : points sous forme de tableau encapsulé, chemins POSIX à trois barres, suppression des anciennes lignes sans `replaceChildren`, attributs SVG explicites et sélection initiale des menus.
- Application non confirmée : le premier essai a été refusé avant mutation (« Preset inconnu »). La valeur par défaut est corrigée dans le code; le verrouillage du Mac a empêché de recharger et de vérifier cette correction, l’application et Annuler. Ces étapes et les animations restent à faire dans l’hôte.
- Tests automatiques : 12 tests Node et 17 tests Python (dont six nouveaux sur les libellés/palettes); le protocole natif et le générateur de mire sont documentés séparément.

## Conservation de l’original — reprise du 20 octobre

- L’application fixe directe a été vérifiée après correction du sélecteur : le troisième clip Rose est passé de 100 à 125 %, position de (0,5 ; 0,5) à (0,35 ; 0,5); les deux autres clips sont restés identiques. Annuler a été déclenché, mais ses valeurs n’ont pas pu être relues avant la réinitialisation d’UXP Developer Tools.
- À la demande d’Adam, ce parcours direct a été remplacé : chaque application des trois parcours de zoom passe désormais par une copie native obligatoire et relit les paramètres de cette copie. L’original n’est jamais une cible de modification. Pas de calque d’effets.
- Nom distinct `… — Nocturnz Zooms N`, ouverture et sélection dans la copie; aucun repli sur la source si le clonage ou la correspondance échoue. Aucun enregistrement automatique.
- 17 tests Node et 17 tests Python passent, dont cinq nouveaux tests simulés du parcours de copie (identité distincte, échec/ambiguïté, correspondance des clips, sélection, changement de séquence active). Ils ne constituent pas une validation native du clonage.
- Duplication/application/Annuler restent à vérifier dans Premiere; le Mac s’est à nouveau verrouillé. Le module Zooms et tous ses presets sont atténués jusqu’à cette validation.

## Raccordement des quinze modules supplémentaires — 2026-10-20

Les 15 modules auparavant sans commandes ont des formulaires et des adaptateurs réels : transcription, hésitations, répétitions, sous-titres, podcast, cadrages, recadrage, shorts, chapitres, B-roll, audio, musique, censure, recettes et lots. Le service 0.4.0 est démarré avec une file persistante, annulation des workers, liste des tâches et récupération des résultats. Le panneau propose la révision des coupes et un éditeur de mots horodatés. L’installation est reproductible via `npm run setup:modules`.

Chaque adaptateur a terminé au moins un traitement source réel sur médias synthétiques; plusieurs variantes et le XML de coupes révisées ont également terminé. FFmpeg/FFprobe sont compilés localement et acceptés par les contrôles amont; Whisper tiny/base/small sont installés. Aucun nouveau résultat sur un montage réel d’Adam n’est revendiqué. Le parcours UXP et les imports des nouveaux modules restent à vérifier; la suite automatisée historique n’a pas été relancée pour cette tranche. Périmètre exact, sorties et limitations dans `docs/modules.md`.
