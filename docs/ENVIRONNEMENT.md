# Environnement Claude Code pour tester l'appli

Guide pour créer un environnement où Claude peut lancer l'appli et la tester sur de vrais sites (ARTE, France.tv, Pluto TV).

## 1. Créer l'environnement

Dans claude.ai/code : menu de l'environnement (barre de titre de la session) → créer / **Edit**.

| Réglage | Valeur |
|---|---|
| Repository | `guillotlaurentqls-sketch/Lmg-` (à sélectionner au démarrage de la session) |
| Network access | **Full** pendant les essais (le plus simple). Sinon « Limited » avec la liste ci-dessous. |
| Setup script | `bash scripts/setup-env.sh` |

### Domaines à autoriser si le niveau est « Limited »

La case des gestionnaires de paquets doit rester **cochée** (npm, téléchargement d'Electron et d'electron-builder).

- ARTE : `arte.tv`, `www.arte.tv`, `api.arte.tv`, `player.arte.tv`
- France.tv : `france.tv`, `www.france.tv`, `francetelevisions.fr`
- Pluto TV : `pluto.tv`, `service-stitcher.clusters.pluto.tv`
- Filtres anti-pub : `cdn.ghostery.com`

Ces sites chargent aussi leurs images et vidéos depuis des domaines de CDN qu'on ne peut pas tous deviner : si une page s'affiche sans images ou si la vidéo ne démarre pas, Claude relève les refus dans les erreurs de connexion et vous les ajoutez à la liste. Le niveau **Full** évite ce va-et-vient.

## 2. Ce que Claude peut ensuite faire

```bash
npm test                                           # tests unitaires des adresses
npm run e2e:server &                               # site de test local (port 8080)
npm run e2e                                        # blocage, pop-ups, fiche du site (site local)
npm run e2e:real -- https://www.arte.tv/fr/        # vrai site : captures + état dans test/e2e/out/
```

`e2e:real` enregistre `1-page.png` (le site), `2-barre.png` (barre d'outils et compteur) et `3-accueil.png` (la fiche créée dans la bibliothèque), et affiche le titre, les erreurs éventuelles, le nombre de requêtes bloquées, les vidéos et iframes détectées.

Écran : les conteneurs n'en ont pas, les tests passent par `xvfb-run` (installé par le script d'installation). L'option `--no-sandbox` n'est utilisée que dans ces tests, car le conteneur tourne en root.

## 3. Ce qui reste hors de portée d'un conteneur

- **Widevine (DRM)** : absent d'Electron standard, aucun réglage d'environnement ne change cela. Voir le README.
- **Installateurs Windows et macOS** : à produire avec le workflow GitHub *Installateurs* (onglet Actions du dépôt), pas dans le conteneur Linux.
