# Composants, licences et modèles

## Code du projet

Code original Nocturnz/Edit et icônes SVG : MIT.

## auto-editor — moteur intégré par CLI

- Auteur et dépôt : [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor).
- Version figée : **29.3.1**, commit `43d47dc5157f0c84dd0b01a43d9406d35e0c4b4e`.
- Licence du code source : **Unlicense**, vérifiée sur ce tag et conservée dans [third_party/auto-editor-29.3.1.LICENSE](third_party/auto-editor-29.3.1.LICENSE).
- Code examiné : `src/exports/json.nim` (V2, effets `cut`/`nil` et plages source), export Premiere FCP7, aide CLI effective du binaire 29.3.1, licence du tag. Le lanceur PyPI 29.3.1 a également été examiné : il télécharge le binaire officiel. Son code n’est pas copié.
- Adaptation : `service/auto_editor.py` appelle le CLI sans shell; analyse sonore → V2 → propositions Nocturnz → V2 révisé → XML Premiere. Seules les coupes acceptées sont reprises.
- Le binaire Mac ARM64 utilisé localement provient de la release officielle; SHA-256 vérifié : `50e7a86f7566389313a07f991dcb7a8c4d1a4dbae7d37bc00f17f59d969877d1`.
- L’installateur `scripts/install-engine.py` fixe les versions et empreintes officielles Mac ARM64/x86_64, Linux x86_64 et Windows AMD64. Seul Mac ARM64 a été exécuté ici.

Le moteur est téléchargé séparément dans `.runtime/bin/`, ignoré par Git. Il n’est pas redistribué dans le dépôt. **La licence Unlicense du code auto-editor ne couvre pas automatiquement les bibliothèques embarquées dans ses binaires.** L’amont signale des licences open source distinctes pour les artefacts; FFmpeg et ses codecs figurent dans les scripts de compilation. Leur inventaire complet et les obligations de redistribution doivent être vérifiés avant de livrer un installateur qui embarquerait le binaire. Cette étape n’est pas déclarée terminée.

## Sources reprises du brief

Six dépôts sont copiés dans [vendor/sources](vendor/sources), avec leurs licences et notices originales : OpenCut (MIT), auto-editor 29.3.1 (Unlicense), OpenPodCut (GPL-3.0-or-later), podclip-public-release (MIT et notices tierces), premiere-director (MIT et bibliothèques tierces) et jumpcut (GPL-3.0). Les commits exacts et empreintes de chaque fichier figurent dans [vendor/manifest.json](vendor/manifest.json).

Il s’agit de sources conservées, sans branchement automatique au panneau ni exécution des installateurs amont. Les sources GPL gardent leur licence; une copie complète du texte est disponible dans [third_party/GPL-3.0.txt](third_party/GPL-3.0.txt). La licence MIT de Nocturnz ne s’applique pas à ces copies. Les notices imbriquées restent applicables.

Les binaires FFmpeg de Podclip et leur archive source, le binaire de signature OpenPodCut, les distributions Jumpcut, les médias et modèles ne sont pas redistribués ici. Les instructions et notices correspondantes restent conservées; cette sélection est détaillée fichier par fichier dans le manifeste.

**auto-zoom-premiere** : aucune licence trouvée au commit `a5c6fb38206fc01df5c1ca9d4558a56a7ff2c83f`; référence consignée dans [vendor/upstreams.json](vendor/upstreams.json), code exclu du dépôt public.

Voir [l’inventaire et les conditions de reprise](vendor/README.md) et [la correspondance des modules](vendor/module-map.json). Le PDF initial n’est pas présent à son chemin annoncé dans cet environnement; l’import suit les dépôts du brief collé.

## Hôte et environnements

### Lecture des libellés de timeline

Le lecteur original `service/timeline_labels.py` reprend les chemins du graphe de projet documentés dans le code [Pouf/py-premiere](https://github.com/Pouf/py-premiere) au commit `38e72ef5d389f472183fb23c471f9c9eb79394f8` (MIT, copyright 2026 Aurore Delaunay). Licence et attribution conservées dans [third_party/py-premiere.LICENSE](third_party/py-premiere.LICENSE). La bibliothèque n’est pas installée ni importée; aucun de ses scripts n’a été exécuté. Aucun média ni projet de démonstration amont n’est redistribué.

### Adobe et environnements

Adobe Premiere et UXP Developer Tool sont propriétaires et ne sont pas redistribués. Node.js et Python sont des environnements externes. Aucune dépendance Python tierce n’est requise par le service Nocturnz.

## Modèles et médias

Aucun modèle d’IA ni média tiers n’est fourni. L’analyse des silences utilise le niveau sonore, pas un modèle de reconnaissance vocale. Les fichiers de test générés sont locaux et ignorés par Git.
