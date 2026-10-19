# Nocturnz Edit

Extension open source pour le montage dans Adobe Premiere Pro. Elle rejoint la suite Nocturnz comme outil autonome : identité commune, traitement des médias sur la machine et aucun compte cloud requis pour le fonctionnement de base.

## État

Le dépôt commence par l’étape A de la feuille de route : prouver l’accès UXP à une séquence, établir un format temporel partagé et isoler le service local. Le panneau peut lire la séquence active dans Premiere 25.6+ et afficher ses pistes/clips. Il n’applique encore aucune modification de timeline.

Les fonctions de montage, la duplication de séquence et les images clés restent à valider dans une instance réelle de Premiere. Aucune opération simulée ne sera présentée comme une opération réussie dans Premiere.

## Lancer le service local

```sh
python3 service/server.py
```

Puis ouvrir `http://127.0.0.1:8765/health`. Le service ne traite pas encore de médias. Il expose sa version et ses capacités disponibles.

## Charger le panneau UXP

1. Installer Adobe UXP Developer Tool.
2. Ouvrir `plugin/manifest.json` dans l’outil et charger le plugin dans Premiere Pro 25.6 ou supérieur.
3. Choisir **Plugins > Nocturnz > Montage**.
4. Cliquer sur **Lire la séquence active**.

Le panneau peut aussi s’ouvrir hors de Premiere pour vérifier l’interface; dans ce cas la lecture de séquence est désactivée.

## Développement

```sh
node --test tests/*.test.mjs
```

## Documentation

- [Feuille de route](ROADMAP.md)
- [Architecture](docs/architecture.md)
- [État des fonctions](docs/status.md)
- [Composants et licences](THIRD-PARTY.md)
- [Protocole de validation Premiere](docs/premiere-validation.md)

## Licence

Le code original du projet est sous MIT. Voir [LICENSE](LICENSE). Les composants tiers, modèles et binaires éventuels gardent leurs propres licences, répertoriées avant intégration.
