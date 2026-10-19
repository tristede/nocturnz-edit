# État des fonctions

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
| Service local | Squelette écrit | Contrat santé testé; écoute HTTP impossible dans le bac à sable qui refuse le bind loopback |
| Duplication/coupe/images clés | À faire | Pas encore intégrées |
| Autres modules du périmètre final | À faire | Voir feuille de route |

## Tranche Silences — moteur réel

- auto-editor 29.3.1 officiel installé en local, version et SHA-256 vérifiés; intégration par CLI et licence conservée.
- Source unique : seuil/piste sonore, durée minimale, marges, correspondance exacte des ticks, sélection et refus de coupes, XML Premiere généré par le moteur amont.
- Service : tâches asynchrones persistées, annulation, statut d’interruption après redémarrage, protection des origines et exports révisés distincts. Pas de cache d’analyse partagé ni de pairage utilisateur pour le moment.
- Validation réelle locale : audio synthétique de 5 s, silences détectés, marges contrôlées, refus de la seconde coupe, XML final de 81 images à 25 i/s. Tests HTTP avec le même moteur. Aucun objet simulé pour cette validation moteur.
- Panneau : formulaire et révision implémentés; choix de fichier, sélection source et import XML UXP restent à vérifier dans Premiere. Module maintenu grisé.
- Périmètre restant : analyse de timeline complète, préservation des effets/corrections, VAD, cache partagé, import Premiere validé.
