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
