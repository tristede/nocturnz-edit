# Nocturnz/Edit

Extension open source pour le montage dans Adobe Premiere Pro. Elle rejoint la suite Nocturnz comme outil autonome : identité commune, traitement des médias sur la machine et aucun compte cloud requis pour le fonctionnement de base.

## État

L’accueil présente 17 modules SVG + titre. Les modules inachevés sont grisés et restent consultables. Le zoom relatif est opérationnel; son application à un clip a été vérifiée dans Premiere, mais le retour de valeur après annulation reste à confirmer.

Le module **Silences** réutilise le moteur local auto-editor 29.3.1 : sélection d’un fichier ou d’une source dans Premiere, seuil sonore, piste audio, durée minimale, marges avant/après, analyse asynchrone et annulation, révision des coupes, XML révisé à enregistrer ou à importer comme nouvelle séquence source. Les tâches sont conservées sur disque; une tâche interrompue par un redémarrage est signalée et peut être relancée.

Cette tranche traite **un média source**. Elle ne nettoie pas encore toute une timeline montée, ne reporte pas ses effets et ne fait pas de détection de parole/VAD. La correspondance temps source/temps séquence est conservée dans le plan; les clips retimés, inversés, imbriqués, fusionnés et multicam sont refusés. L’export est une séquence source séparée.

Analyse et XML ont été testés avec le binaire réel et un audio de validation, y compris le parcours HTTP. Le parcours de sélection/import XML dans Premiere est implémenté mais reste à valider. Silences reste donc grisé comme module partiel.

## Installer le moteur et lancer le service

```sh
npm run setup:engine
npm run service
```

Le premier appel télécharge la version officielle figée et vérifie son empreinte SHA-256. Aucun binaire n’est ajouté à Git. Mac Apple Silicon a été validé; les autres binaires disposent d’une procédure de téléchargement mais n’ont pas été exécutés ici. Aucun abonnement ni API cloud n’est utilisé pour cette analyse CPU.

Le service écoute uniquement `127.0.0.1:8765`. `/health` annonce les capacités du moteur effectivement présent. Les routes média exigent un en-tête client et refusent les origines web; aucun CORS universel n’est activé. Ce contrôle local ne constitue pas encore un système de pairage utilisateur.

### Utiliser Silences

1. Ouvrir **Silences**, puis **Fichier**, ou sélectionner une seule source dans la timeline et choisir **Sélection Premiere**.
2. Régler le seuil, la durée minimale et les marges, puis **Analyser la source**.
3. Cocher les plages à retirer; décocher une plage la conserve.
4. **Générer XML source**, puis l’enregistrer ou l’importer dans un projet Premiere ouvert. Les médias originaux restent intacts.

## Charger le panneau UXP

1. Installer Adobe UXP Developer Tool.
2. Ouvrir `plugin/manifest.json` dans l’outil et charger le plugin dans Premiere Pro 25.6 ou supérieur.
3. Ouvrir le panneau **Nocturnz/Edit** depuis le menu Plugins.
4. Ouvrir un module. Les lectures de séquence et l’inspection sont accessibles dans **Réglages**.

La navigation peut s’ouvrir hors de Premiere; le choix de fichiers par UXP et l’intégration à la timeline nécessitent Premiere. Le manifeste demande uniquement l’accès aux fichiers choisis par le sélecteur natif.

## Développement

Les sources de **six dépôts du brief** sont maintenant conservées dans [vendor](vendor/README.md), avec versions, licences et empreintes. Les 17 modules ont une correspondance vers les fichiers amont. Cette copie prépare leur reprise; les adaptations UXP et les dépendances ne sont pas encore branchées. `auto-zoom-premiere` reste une référence sans code copié, faute de licence identifiable.

```sh
npm test
```

## Documentation

- [Feuille de route](ROADMAP.md)
- [Architecture](docs/architecture.md)
- [État des fonctions](docs/status.md)
- [Composants et licences](THIRD-PARTY.md)
- [Protocole de validation Premiere](docs/premiere-validation.md)

## Licence

Le code original du projet est sous MIT. Voir [LICENSE](LICENSE). Les sources de `vendor/`, dont des composants GPL, gardent leurs propres licences et notices. Voir [THIRD-PARTY.md](THIRD-PARTY.md).
