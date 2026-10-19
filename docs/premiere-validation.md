# Protocole de validation dans Premiere

## Préparation

- Noter la version et le numéro de build Premiere, le système et la cadence de séquence.
- Créer une copie de projet et un petit média de test dont la source reste intacte.
- Charger le manifeste via UXP Developer Tool; ouvrir le panneau Montage.

## Lecture

- Comparer le nom de la séquence, la cadence, la taille d’image, le nombre de pistes vidéo et les noms/durées des clips avec la timeline.
- Sélectionner un clip déjà recadré et comparer les noms d’effets/paramètres affichés par le panneau à ceux de Premiere.
- Tester une cadence fractionnaire (par ex. 30000/1001), un clip commençant après zéro et un clip déjà recadré.

## Modifications à valider avant activation

- Dupliquer la séquence; confirmer que le projet original et ses médias restent intacts.
- Razor un clip au milieu d’un rush, en gardant l’audio synchronisé.
- Appliquer position/échelle et deux images clés sans écraser les réglages existants.
- Annuler en un geste et confirmer que seul le changement de l’extension est retiré.
- Répéter avec piste verrouillée, séquence imbriquée et clip ralenti; afficher un refus clair si non pris en charge.

Inscrire les résultats réels dans `docs/status.md`; les tests simulés ne remplacent pas cette validation.

## Mire isolée pour les zooms

`python3 scripts/make-zoom-validation.py` génère une mire PNG et `validation-local/validation.xml` (FCP7). Importer ce XML dans un projet séparé, puis enregistrer ce projet sous `validation-local/Nocturnz_Zooms_validation.prproj`. Ouvrir la séquence `Nocturnz — Validation Zooms` : trois occurrences de quatre secondes du même média, à 25 i/s, avec les libellés Rose / Mango / Rose à l’import (Mangue dans la palette française).

Dans la console de débogage UXP, `var zv = require('./dev-validation.cjs')` donne accès à `zv.inspect()`, `zv.select([0])` et `zv.frame(0, 125, 0.35, 0.5)`. Cet assistant manuel vérifie le nom et le chemin du projet, la séquence, le nombre de clips et le chemin de chaque média avant toute action. Il n’est jamais chargé par le panneau. Les projets et médias générés sont ignorés par Git.

1. Préparer le cadrage du premier clip, le sélectionner et le capturer sous Rose dans le panneau.
2. Recharger le panneau, relire les libellés et vérifier que le cadrage est conservé.
3. Sélectionner le troisième clip, appliquer le cadrage Fixe, puis comparer position/échelle/ancrage/rotation via `zv.inspect()`.
4. Utiliser Annuler dans Premiere et relire les trois clips : seul le troisième doit revenir à son cadrage précédent.
5. Répéter avec un preset animé puis Aux cuts sur les deux derniers clips. Relever les ticks et valeurs des images clés, vérifier le rendu et Annuler.

Le client UXP utilise `http://localhost:8765`; le serveur reste lié à `127.0.0.1`. Après modification des permissions réseau du manifeste, décharger puis recharger le plugin dans UXP Developer Tools.
