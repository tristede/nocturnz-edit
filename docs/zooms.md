# Zooms

## Interface et code ajoutés

- **Presets** : Fixe (zoom relatif existant), Lent in, Lent out, Punch in, Punch out, Aller-retour.
- **Aux cuts** : animation In, Out ou alternée à chaque clip sélectionné, dans l’ordre chronologique de chaque piste. L’alternance commence par In sur chaque piste.
- Intensité relative à l’échelle existante, durée sur tout le clip ou limitée à 0,3 / 0,6 / 1,2 / 2,4 secondes, courbe linéaire ou douce.
- Les animations sont limitées aux clips vidéo sélectionnés; elles ne créent pas de nouvelles coupes. Les clips composés, retimés, inversés, désactivés, les calques d’effets et les échelles déjà animées sont écartés.
- Les images clés sont calculées en ticks source et sur des intervalles d’images de la séquence. Le dernier point reste dans le clip. In va de l’échelle existante à l’échelle augmentée; Out revient de l’échelle augmentée à l’échelle existante.
- Une transaction reçoit les actions d’animation. L’interpolation linéaire est explicitement demandée entre les points; la courbe douce est échantillonnée avec une progression smoothstep.

**Validation** : seul le zoom relatif fixe a été appliqué et lu dans Premiere auparavant. Les nouveaux presets animés et le mode Aux cuts sont implémentés mais non exécutés/validés dans Premiere. Ils sont atténués et affichent « À valider dans Premiere ». Aucun test supplémentaire n’a été lancé pour cette tranche. Retour Annuler, images clés sur rushes avec point d’entrée non nul, cadence source différente, transitions et état de verrouillage restent à vérifier dans l’hôte. L’API UXP VideoTrack documentée ne fournit pas de lecture de verrouillage; aucune protection des pistes verrouillées n’est revendiquée ici.

## Interlocuteur — demande d’Adam

Deux sources indépendantes à proposer :

1. **Libellés des clips de la timeline**, choisis comme fonctionnement habituel par Adam. Le tri couleur déjà réalisé doit être réutilisé. Chaque couleur doit pouvoir être associée à un interlocuteur et à son cadrage (position/échelle).
2. **Voix** : analyse des locuteurs puis association de chaque voix à son cadrage.

Les presets doivent pouvoir servir de mouvement pour ces cadrages. Le mode Libellés ne doit pas déclencher d’analyse vocale.

**État** : choix des sources présent dans l’interface, mode grisé en développement; aucune détection vocale, lecture de couleur ou application de cadrage interlocuteur n’est déclarée fonctionnelle. L’API UXP `ProjectItem.getColorLabelIndex()` concerne le chutier; elle ne peut pas être considérée comme la lecture du libellé propre à chaque occurrence dans la timeline. L’adaptateur des libellés de timeline reste à réaliser et à valider, notamment avec deux occurrences du même rush portant des couleurs différentes.

## Références techniques

- [Adobe — ComponentParam](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/componentparam)
- [Adobe — Keyframe](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/keyframe)
- [Adobe — TickTime](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/ticktime)
- [Adobe — VideoClipTrackItem](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videocliptrackitem)
- [Adobe — VideoTrack](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videotrack)
- [Adobe — ProjectItem et libellés du chutier](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/projectitem)

Les sources amont disponibles restent inchangées dans `vendor/`; le nouveau code du panneau est original Nocturnz.
