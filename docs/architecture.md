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
