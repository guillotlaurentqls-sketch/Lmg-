# Android et iOS : ce qui est fait, et le chemin pour une vraie appli

## Ce qui est fait

L'interface (accueil, profils, Ma liste, recherche, chaînes) est **adaptative** : en dessous de 700 px de large elle passe en mise en page téléphone (navigation en barre du bas, champ de recherche pleine largeur, affiches en défilement tactile, cibles de 40 px, marges « encoche » `safe-area`), avec une mise en page tablette intermédiaire, et le thème clair ou sombre. Elle a été vérifiée en émulation à 390×844 (téléphone) et 820×1180 (tablette). C'est aussi ce que voit une fenêtre de l'appli de bureau réduite à 360 px.

## Ce qui ne peut pas être fait avec Electron

**Electron ne fonctionne ni sur Android ni sur iOS.** L'appli actuelle ne peut donc pas être installée sur un téléphone : il faut une seconde application, qui réutilise le dossier `src/launcher/` (HTML, CSS, JS) et remplace la partie `src/main.js`.

## Les trois chemins

| Chemin | Blocage des pubs | Vidéo / DRM | Effort |
|---|---|---|---|
| **Navigateur mobile + extension** (Firefox Android + uBlock Origin ; Safari iOS + un bloqueur de contenu) | oui | celui du navigateur (Widevine sur Android) | aucun |
| **PWA** (le lanceur installé depuis le navigateur) | **non** : une page web ne peut ni filtrer le réseau d'un autre site ni l'afficher dans un cadre (la plupart des sites l'interdisent) | — | faible, mais sans l'intérêt de l'appli |
| **Application native avec WebView** (Capacitor, ou Kotlin + Swift) | oui, avec du code propre à chaque système | Android : Widevine natif dans la WebView ; iOS : lecteur Safari | plusieurs semaines |

### Application native : comment

- **Android** : une `WebView` par onglet, blocage dans `shouldInterceptRequest` avec les mêmes listes que Ghostery. Un onglet à la fois est simple ; la mosaïque est possible sur tablette. Publication Google Play : compte développeur (25 $).
- **iOS** : `WKWebView` obligatoire (règle d'Apple) ; le blocage passe par des `WKContentRuleList`, en convertissant les listes de filtres au format JSON de Safari. Mosaïque limitée par la mémoire. Publication App Store : compte Apple Developer (99 $/an), et revue d'Apple sur un navigateur « lanceur ».
- **Partagé** : le dossier `src/launcher/`, `src/url.js` (adresses, « même site »), `src/channels.json` et `src/sites.default.json`. Les profils demandent un stockage séparé par profil : sur Android `WebView` via un `ProfileStore`, sur iOS un `WKWebsiteDataStore(forIdentifier:)`.
- **Pas testable ici** : le conteneur n'a ni SDK Android, ni Xcode, ni appareil.

Si tu veux ce chemin, la meilleure première étape est un prototype Android (APK pour tes amis, sans passer par le Play Store).
