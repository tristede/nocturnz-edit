# Architecture

```text
Panneau UXP Premiere
  ├── adaptateur Premiere : lecture et opérations supportées par l’API documentée
  ├── cœur pur : temps, plan de montage, validation, conversions
  └── client loopback explicite
        └── service local Python : tâches et moteurs branchables
```

Le panneau est l’interface et l’adaptateur d’hôte. Le service local est indépendant de Premiere : il recevra les analyses coûteuses et exposera une API versionnée sur `127.0.0.1`. Aucun basculement cloud automatique n’est prévu.

Chaque module partagera le plan JSON versionné et distinguera analyse, proposition, validation et application. Les temps sont exprimés en ticks Premiere et accompagnés de la base de temps de la séquence; les conversions vers secondes restent exactes sous forme rationnelle. Temps source et temps de séquence sont deux champs distincts.

L’API UXP documentée est la voie principale. Une éventuelle couche CEP/QE sera isolée dans un adaptateur séparé, avec capacités testées et sans masquer ses limites. La duplication, le razor, la position/échelle et les images clés ne seront activés qu’après essai dans Premiere.

## Adaptateur Silences

`service/auto_editor.py` appelle le binaire auto-editor 29.3.1 par liste d’arguments sans shell. L’entrée est exclusivement un chemin local existant; aucun URL ou repli cloud n’est autorisé. Le JSON V2 du moteur sert à construire des propositions avec plages source et séquence en ticks exacts. Le XML est régénéré depuis les seules coupes acceptées et importé comme séquence source séparée. Il ne remplace pas une timeline existante.

`service/jobs.py` conserve les tâches dans `.runtime/jobs/`, utilise un seul processus média à la fois et gère leur annulation. Les résultats terminés survivent au redémarrage; les tâches interrompues sont signalées comme échouées et relançables. Un cache mutualisé et une reprise de calcul ne sont pas encore implémentés.

Les routes privées vérifient le Host loopback, l’origine et `X-Nocturnz-Client`. Il n’y a pas de CORS universel. Un mécanisme de pairage utilisateur reste prévu; l’en-tête client n’est pas un secret d’authentification.
