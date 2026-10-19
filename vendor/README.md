# Sources amont

Les sources de six dépôts du brief sont copiées ici, sans modification de leur contenu. Elles constituent une base de reprise : leur présence ne rend pas leurs fonctions disponibles dans le panneau Nocturnz/Edit.

| Dossier | Dépôt | Licence principale |
|---|---|---|
| `sources/opencut` | [SysAdminDoc/OpenCut](https://github.com/SysAdminDoc/OpenCut) | MIT |
| `sources/auto-editor` | [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor), 29.3.1 | Unlicense |
| `sources/openpodcut` | [YoYoZ/OpenPodCut](https://github.com/YoYoZ/OpenPodCut) | GPL-3.0-or-later |
| `sources/podclip` | [treydoe1/podclip-public-release](https://github.com/treydoe1/podclip-public-release) | MIT + notices tierces |
| `sources/premiere-director` | [Macadaisical/premiere-director](https://github.com/Macadaisical/premiere-director) | MIT + notices des bibliothèques |
| `sources/jumpcut` | [cameron-astor/jumpcut](https://github.com/cameron-astor/jumpcut) | GPL-3.0 |

`auto-zoom-premiere` reste une référence : aucune licence n’a été trouvée au commit examiné, donc son code n’est pas redistribué. Son URL et sa version sont conservées dans `upstreams.json`.

## Inventaire et intégrité

- `upstreams.json` fixe les URL, commits et licences principales.
- `manifest.json` consigne chaque fichier copié, sa taille et son SHA-256, ainsi que chaque exclusion et son motif.
- `module-map.json` relie les 17 tuiles du panneau à des points d’entrée existants. Il s’agit d’un repérage, pas d’une certification du fonctionnement de ces modules.
- Les licences, notices tierces, sources, configurations, scripts et tests disponibles sont conservés. Les médias, modèles, binaires, archives, certificats, sorties de compilation et automatisations GitHub sont exclus. Certaines démonstrations et procédures d’installation amont ne peuvent donc pas être lancées telles quelles depuis cette copie.
- Les scripts amont n’ont pas été exécutés lors de l’import. Les sources ne sont pas ajoutées au chargement du panneau ni aux tests Nocturnz.
- Les attributs Git amont sont exclus; ceux du projet empêchent les conversions de fins de ligne dans les snapshots.

Vérification hors ligne des copies :

```sh
python3 scripts/vendor-upstreams.py --verify
```

Pour reproduire l’import, cloner les URL dans `.runtime/upstreams/<id>`, disposer des commits indiqués, puis lancer `python3 scripts/vendor-upstreams.py` sur un dépôt sans snapshot existant. Le script ne télécharge ni dépendance ni modèle et refuse d’écraser un snapshot.

## Reprise dans Nocturnz/Edit

Les interfaces CEP/ExtendScript de plusieurs dépôts nécessitent un adaptateur vers notre panneau UXP. Les dépendances Python, Node, FFmpeg et modèles restent à sélectionner et installer par module. Des modules amont sont partiels ou dépendants de services/modèles externes : leur import ne garantit ni gratuité de toutes les fonctions ni disponibilité hors ligne.

Les sources GPL restent sous GPL dans leurs dossiers. Le texte complet GPL v3 est également conservé dans `third_party/GPL-3.0.txt`. La licence MIT du code original Nocturnz ne remplace aucune licence amont. Toute adaptation ou distribution intégrant du code GPL doit respecter les obligations GPL correspondantes; cette copie ne déclare pas une telle intégration au panneau.
