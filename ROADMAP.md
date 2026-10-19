# Feuille de route — suite Nocturnz/Edit

Le périmètre final comprend le nettoyage des silences, hésitations et répétitions; transcription modifiable; sous-titres animés; réalisation podcast et cadrages virtuels; zooms; recadrages sociaux; shorts; chapitres; B-roll; audio; recettes et traitement par lot. Les étapes organisent la livraison, elles ne retirent aucune de ces familles.

## A — preuve d’intégration Premiere (en cours)

- [x] Créer un dépôt autonome identifié à la suite Nocturnz.
- [x] Charger un panneau UXP et vérifier l’accès à l’API Premiere.
- [x] Lire séquence, cadence, dimensions, pistes vidéo et clips.
- [x] Ajouter un zoom relatif sur les clips sélectionnés, en préservant l’échelle existante et via une transaction annulable (vérifié sur un clip réel; annulation lancée, retour de valeur à revalider).
- [x] Vérifier la version de Premiere utilisée pour la validation initiale (Beta 27.0.0).
- [ ] Dupliquer une séquence de manière annulable.
- [ ] Couper un rush au milieu, puis appliquer position/échelle et images clés.
- [ ] Confirmer le résultat visuel et le retour arrière dans Premiere.
- [ ] Réimporter un XML de secours et comparer le résultat.

## B — fondations communes

- [x] Importer les sources réutilisables des dépôts du brief avec versions, licences et inventaire (six dépôts; auto-zoom-premiere exclu faute de licence).
- [x] Repérer les points d’entrée amont correspondant aux 17 modules.
- [ ] Brancher progressivement ces modules au service et au panneau UXP, en respectant leurs licences et dépendances.

- Service local authentifié sur loopback, gestion des tâches, progression, annulation et reprise.
- Plan de montage versionné, temps source/temps séquence, cache partagé, validation avant application.
- Révision réversible, duplication, préservation des médias et corrections manuelles.

## C — nettoyage et texte

Première tranche Silences implémentée avec auto-editor 29.3.1 : analyse d’un média source, marges/durée minimale, révision et XML. Moteur réel testé; intégration UXP source/import et traitement de la timeline complète restent à valider/développer. Le module reste grisé.


- Détection de silences par seuil et VAD, marges, pistes et pauses naturelles.
- Transcription française locale modifiable; hésitations, reprises et répétitions révisables.
- Sous-titres mot à mot personnalisables, exports et chapitres.

## D — réalisation

- Association manuelle voix/cadrage A/B/large, puis assistance facultative.
- Podcast multicam, interruptions, rythme, zooms progressifs et ancres.
- Zooms : presets et animation In/Out aux cuts implémentés, validation Premiere à faire. Zoom interlocuteur à développer avec deux entrées : voix ou libellés couleur propres aux clips de timeline (tri existant d’Adam), associés à des cadrages. Voir `docs/zooms.md`.
- Recadrage vertical/carré, suivi facultatif, split-screen.

## E — couverture complète

- Shorts révisables, recherche B-roll locale, audio et musique locale, ducking, censure.
- Recettes révisables, traitement par lot et exports éditables.

## F — qualité produit

- Installateurs Mac/Windows, exécution CPU fiable, compatibilité GPU mesurée.
- Corpus de non-régression, documentation d’usage, diagnostic et inventaire licences/modèles.
- Mesures comparatives contre FireCut/AutoCut sur corpus commun avant toute revendication de parité.

## Critères de passage

Une opération ne passe à « validée dans Premiere » qu’après vérification visuelle et fonctionnelle dans Premiere. Les tests de logique locale et les objets simulés sont rapportés séparément. Les séquences imbriquées, pistes verrouillées, cadences fractionnaires, médias décalés et effets temporels sont validés ou signalés avant toute application.
