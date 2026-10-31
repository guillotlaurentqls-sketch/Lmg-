# Prototype Android

Application Android (Java, WebView) qui reprend l'interface « plateforme de streaming » de l'appli de bureau : profils, Ma liste, favoris, collections, **recherche**, **catégories**, chaînes TV, et les sites en direct dans des onglets, sans pubs ni pop-ups.

> **Prototype.** Il compile (APK de 1,2 Mo) et son interface a été testée dans un navigateur à la taille d'un téléphone, avec un faux pont Android. Il **n'a jamais été lancé sur un téléphone ni un émulateur** : le conteneur de développement n'en a pas. Attends-toi à des défauts au premier essai, et signale-les.

## Installer

1. Récupère l'APK : onglet **Actions** du dépôt → **APK Android (prototype)** → *Run workflow* → télécharge l'artefact `AdBlock-Launcher-android-debug` (un `.zip` contenant `app-debug.apk`). Ou compile-le toi-même : `gradle -p android :app:assembleDebug` (JDK 17+, SDK Android 34 ; fichier `android/app/build/outputs/apk/debug/app-debug.apk`).
2. Copie l'APK sur le téléphone, ouvre-le, autorise « Installer des applications inconnues » pour ton gestionnaire de fichiers. L'APK est signé avec une clé de test (*debug*) : Play Protect peut demander une confirmation.

## Ce que fait l'appli

- **Recherche d'un film ou d'une série** : la barre de recherche filtre ta bibliothèque, les chaînes et les catégories, et propose **« Chercher … sur : ARTE, France.tv, M6+, Lumni »** : un bouton ouvre la page de recherche officielle de la plateforme, en direct. L'appli n'a pas de catalogue à elle (voir plus bas).
- **Catégories** : Films, Séries, Documentaires, Jeunesse, Culture, Histoire et sciences, Info, Sport, Émissions. Chaque carte ouvre la page de la catégorie sur le site de la plateforme (`src/providers.json`, modifiable).
- **Profils** (jusqu'à 6) avec **Ma liste**, **favoris** et collections. Chaque profil a sa propre session de navigation (connexions séparées) quand la WebView du téléphone gère les profils (WebView 124 ou plus, mise à jour par le Play Store).
- **Sites en direct** : un onglet par site (8 au maximum), barre d'outils (précédent, suivant, actualiser, accueil, bouclier, onglets, Cast), plein écran vidéo, bouton Retour qui remonte d'abord à l'accueil.
- **Blocage des pubs et pop-ups** : voir les limites ci-dessous.
- **DRM** : la WebView d'Android embarque **Widevine** dans la plupart des téléphones, donc des lecteurs qui échouent sur le bureau peuvent fonctionner ici. L'appli interroge le téléphone (`MediaDrm`) et indique le niveau (L1 : HD, L3 : qualité standard). Rien n'est contourné.

## Caster sur une Chromecast

Le bouton **📡** de la barre d'outils ouvre le réglage système **« Caster l'écran »** (Chromecast, Google TV, téléviseurs compatibles Cast / Smart View) : l'écran du téléphone, avec le site et la vidéo, s'affiche sur la télé.

Limites à connaître :
- **Ce n'est pas le Cast « natif » d'une appli de streaming** : le Cast officiel envoie une adresse de vidéo au téléviseur, qui la lit lui-même. Les sites ne l'offrent que dans Chrome, et une WebView ne peut pas l'utiliser. L'appli ne peut pas non plus extraire l'adresse du flux d'un site.
- **Les vidéos protégées par DRM peuvent s'afficher en noir** sur la télé : la protection empêche la recopie d'écran. Ce n'est pas contournable.
- Pour caster une vidéo d'un site qui propose Cast, ouvre ce site dans **Chrome** sur le téléphone.

## « Enregistrements »

L'appli **n'enregistre ni ne télécharge** les vidéos ni les émissions : ce serait copier le contenu des sites, ce que le projet s'interdit (et les flux sont souvent protégés). À la place : **Ma liste** (à voir plus tard), **Favoris**, et **Reprendre**, qui rouvre la dernière page visitée d'un site. Si tu pensais à autre chose (des rappels de programmes, par exemple), dis-le.

## Limites du blocage sur Android

Le bureau utilise le moteur Ghostery. Sur Android, ce prototype bloque par **noms de domaine** avec des listes publiques de serveurs publicitaires (Peter Lowe, Steven Black), téléchargées au démarrage puis toutes les 12 h. C'est moins fin : pas de règles par chemin d'adresse, pas de masquage des éléments de pub dans la page, et les pubs servies depuis le domaine même du site ne sont pas bloquées. Le bouton bouclier désactive le blocage sur un site.

Autres différences avec le bureau : pas de mosaïque, pas de zoom par site (zoom par pincement), les sites en arrière-plan sont mis en pause (ils ne jouent pas en même temps).

## Ce qui n'est pas vérifié

Lancement réel, blocage sur de vrais sites, lecture vidéo et plein écran, Widevine, profils de la WebView, Cast, comportement du bouton Retour, rotation de l'écran. À tester sur ton téléphone ; les défauts sont probablement dans `MainActivity.java`.

## Organisation

- `android/app/src/main/java/fr/lmg/adblocklauncher/` : `MainActivity` (onglets, barre d'outils, plein écran, pont JavaScript), `AdBlocker` (listes de domaines), `Urls` (adresses, « même site »).
- L'interface est **celle du bureau** (`src/launcher/`), copiée à la compilation avec `src/channels.json`, `src/providers.json` et `src/sites.default.json`. `android/shim/android-shim.js` lui fournit `window.launcher` : données gardées dans le stockage local de la WebView, ouverture des sites confiée au code Java.
- Publier sur le Play Store demanderait une clé de signature, une politique de confidentialité et un compte développeur (25 $) : hors de ce prototype.
