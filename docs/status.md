# État des fonctions

| Famille | État | Validation |
|---|---|---|
| Panneau UXP Nocturnz Edit | Implémenté dans le dépôt | Manifeste JSON valide; chargement dans Premiere non testé |
| Lecture séquence/pistes/clips | Implémentée dans l’adaptateur | Appels basés sur l’API Adobe 25.6+; aucun essai dans l’hôte |
| Lecture des effets et paramètres sélectionnés | Implémentée dans le panneau | Appels basés sur l’API Adobe 25.6+; aucun essai dans l’hôte |
| Format temporel partagé | Implémenté au cœur | 7 tests Node locaux réussis, dont cadence fractionnaire et ticks longs |
| Service local | Squelette écrit | Contrat santé testé; écoute HTTP impossible dans le bac à sable qui refuse le bind loopback |
| Duplication/coupe/zoom/images clés | À faire | Aucune opération annoncée comme appliquée |
| Autres modules du périmètre final | À faire | Voir feuille de route |
