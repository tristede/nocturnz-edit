# Nocturnz/Edit

Extension open source pour le montage dans Adobe Premiere Pro. Elle rejoint la suite Nocturnz comme outil autonome : identité commune, traitement des médias sur la machine et aucun compte cloud requis pour le fonctionnement de base.

## État

L’accueil présente 17 modules SVG + titre. Les modules inachevés sont grisés et restent consultables. Tous les zooms créent désormais une copie de la séquence avant modification; ce nouveau parcours reste à valider dans Premiere et le module est grisé. L’ancien parcours direct a été exécuté sur un clip réel puis sur une mire isolée; il a été remplacé pour préserver la séquence source.

Le module **Silences** réutilise le moteur local auto-editor 29.3.1 : sélection d’un fichier ou d’une source dans Premiere, seuil sonore, piste audio, durée minimale, marges avant/après, analyse asynchrone et annulation, révision des coupes, XML révisé à enregistrer ou à importer comme nouvelle séquence source. Les tâches sont conservées sur disque; une tâche interrompue par un redémarrage est signalée et peut être relancée.

Cette tranche traite **un média source**. Elle ne nettoie pas encore toute une timeline montée, ne reporte pas ses effets et ne fait pas de détection de parole/VAD. La correspondance temps source/temps séquence est conservée dans le plan; les clips retimés, inversés, imbriqués, fusionnés et multicam sont refusés. L’export est une séquence source séparée.

Analyse et XML ont été testés avec le binaire réel et un audio de validation, y compris le parcours HTTP. Le parcours de sélection/import XML dans Premiere est implémenté mais reste à valider. Silences reste donc grisé comme module partiel.

## Installer le moteur et lancer le service

**Zoom interlocuteur / Libellés timeline** : lecture des couleurs, capture, conservation et application fixe d’un cadrage par couleur/source vérifiées dans Premiere Beta 27 sur une mire isolée avec l’ancien parcours direct. Le nouveau parcours sur copie, les animations et Annuler restent à valider dans l’hôte; ce mode demeure grisé. Le mode Voix reste à développer. Voir [Zooms](docs/zooms.md).

```sh
npm run setup:engine
npm run setup:modules
npm run setup:clipboard
npm run service
```

Le premier appel télécharge la version officielle figée et vérifie son empreinte SHA-256. Aucun binaire n’est ajouté à Git. Mac Apple Silicon a été validé; les autres binaires disposent d’une procédure de téléchargement mais n’ont pas été exécutés ici. Aucun abonnement ni API cloud n’est utilisé pour cette analyse CPU.

Le service écoute uniquement `127.0.0.1:8765`. Le panneau le joint via `http://localhost:8765`, autorisé dans le manifeste UXP et vérifié dans Premiere Beta 27. `/health` annonce les capacités du moteur effectivement présent. Les routes média exigent un en-tête client et refusent les origines web; aucun CORS universel n’est activé. Ce contrôle local ne constitue pas encore un système de pairage utilisateur.

### Utiliser Silences

1. Sélectionner un rush puis ouvrir **Silences** ; ou utiliser **Choisir**.
2. Choisir **Naturel**, **Dynamique** ou **Prudent**, puis **Nettoyer les silences**.
3. **Créer la version nettoyée** génère et importe une nouvelle séquence source. Ajustement des coupes et paramètres techniques restent accessibles dans les sections repliées.

### Sous-titres et images

**Sous-titres** : transcription locale, éditeur de mots intégré, quatre presets et rendu transparent importable ; formats texte en options avancées. La transcription d’un média déjà transcrit dans le chutier Premiere peut être reprise sans reconnaissance supplémentaire.

**Images** : sur Mac, **Coller une image** ou ⌘V importe une image externe au chutier. Le helper natif se compile avec `npm run setup:clipboard`. Les médias collés persistent dans `.runtime/clipboard` : conserver ce dossier ou collecter les médias avant de déplacer le projet.

Ces nouveaux parcours sont implémentés, mais leur validation complète dans Premiere reste à faire. Détails, limites et composants d’interface dans [docs/ux-outils.md](docs/ux-outils.md). Audit des dix projets récemment proposés dans [docs/audit-nouveaux-repos.md](docs/audit-nouveaux-repos.md).

## Charger le panneau UXP

1. Installer Adobe UXP Developer Tool.
2. Ouvrir `plugin/manifest.json` dans l’outil et charger le plugin dans Premiere Pro 25.6 ou supérieur.
3. Ouvrir le panneau **Nocturnz/Edit** depuis le menu Plugins.
4. Ouvrir un module. Les lectures de séquence et l’inspection sont accessibles dans **Réglages**.

La navigation peut s’ouvrir hors de Premiere; le choix de fichiers par UXP et l’intégration à la timeline nécessitent Premiere. Le manifeste demande uniquement l’accès aux fichiers choisis par le sélecteur natif.

## Développement

Les sources de **six dépôts du brief** sont conservées dans [vendor](vendor/README.md), avec versions, licences et empreintes. Les 15 modules supplémentaires sont maintenant reliés au panneau, aux fonctions OpenCut et à une file de tâches isolées; leurs traitements source ont été exécutés sur médias synthétiques. Ils proposent réglages, progression, annulation, révision des coupes et import des sorties. Leur parcours UXP/import reste à valider; les tuiles restent atténuées. Voir [Modules raccordés et limites](docs/modules.md). `auto-zoom-premiere` reste une référence sans code copié, faute de licence identifiable.

```sh
npm test
```

## Documentation

- [Feuille de route](ROADMAP.md)
- [Architecture](docs/architecture.md)
- [État des fonctions](docs/status.md)
- [Composants et licences](THIRD-PARTY.md)
- [Protocole de validation Premiere](docs/premiere-validation.md)
- [Zooms : modes, presets et interlocuteurs](docs/zooms.md)
- [Modules : fonctions, installation et limites](docs/modules.md)

## Licence

Le code original du projet est sous MIT. Voir [LICENSE](LICENSE). Les sources de `vendor/`, dont des composants GPL, gardent leurs propres licences et notices. Voir [THIRD-PARTY.md](THIRD-PARTY.md).
