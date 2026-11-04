# AdBlock Launcher

Une petite application de bureau (Windows, macOS, Linux) : tu colles l’adresse d’un site, il s’ouvre **en direct** dans une fenêtre, avec sa mise en page d’origine, **sans publicités, traqueurs ni pop-ups**. L’appli ne télécharge ni ne copie rien : elle affiche le vrai site, comme un navigateur, avec un bloqueur ([Ghostery adblocker](https://github.com/ghostery/adblocker)) branché dessus.

## Utilisation

1. Lance **AdBlock Launcher** depuis l’icône du bureau.
2. Colle une adresse dans le champ en haut (avec ou sans `https://`, espaces ou liens avec paramètres acceptés), puis **Entrée**. Rien à ajouter avant.
3. Dans un site, la barre du haut donne : précédent/suivant, actualiser, accueil, zoom, l’interrupteur de blocage du site et l’étoile des favoris.

### Ta bibliothèque, façon streaming

Chaque site que tu ouvres est **ajouté tout seul** à l’accueil, regroupé par site : plusieurs pages d’un même site (`arte.tv/fr/…`, `player.arte.tv/…`) ne font qu’une affiche. L’accueil est présenté comme une plateforme de streaming :

- un grand bandeau avec le dernier site ouvert : **Reprendre** rouvre la dernière page visitée, l’autre bouton la page d’accueil du site ;
- des rangées d’affiches : **Reprendre** (récents), **Favoris**, une rangée **par groupe** que tu crées, et **Mes sites** pour ceux sans groupe ;
- au survol d’une affiche : ★ favori, ✎ renommer et classer dans un groupe (« Séries », « Sport », « Documentaires »…), ✕ retirer de la bibliothèque.

**Le site s’adapte tout seul** : à l’ouverture, l’appli lit le nom de marque dans le titre de la page, l’icône du site et sa couleur de thème, et les range avec la fiche. L’affiche prend ainsi les couleurs du site. Tout reste sur ton ordinateur, comme un marque-page de navigateur ; renommer un site à la main fige son nom. L’appli ne va pas chercher le catalogue ni les images de programmes des sites : pour les voir, ouvre le site.

| Raccourci | Action |
|---|---|
| `Ctrl/Cmd + L` | saisir une adresse |
| `Ctrl/Cmd + H` | accueil (les onglets restent ouverts) |
| `Ctrl/Cmd + T` / `W` | nouvel onglet (accueil) / fermer l’onglet |
| `Ctrl/Cmd + M` | mosaïque |
| `Alt + ←` / `Alt + →` (`Cmd + [` / `]` sur Mac) | précédent / suivant |
| `Ctrl/Cmd + R` | actualiser |
| `Ctrl/Cmd + +` / `-` / `0` | zoom (mémorisé par site) |
| `F11` | plein écran de la fenêtre (le bouton plein écran du lecteur vidéo fonctionne aussi) |

### Profils, Ma liste et favoris (comme une plateforme de streaming)

- **Profils** : au démarrage, « Qui regarde ? » propose les profils (jusqu’à 6, avec avatar et couleur). Chaque profil a sa **propre bibliothèque, ses favoris, sa liste et ses propres connexions aux sites** : deux personnes qui partagent l’ordinateur ne se voient pas l’une l’autre. Menu de l’avatar en haut à droite : modifier le profil, changer de profil, réglages. Supprimer un profil efface aussi ses connexions.
- **Ma liste** (＋) : les sites à garder sous la main. **Favoris** (★) : tes préférés. **Collections** (✎) : un nom libre (« Séries », « Sport »…) qui crée une rangée sur l’accueil. Les pages **Ma liste** et **Favoris** sont dans le menu du haut.
- **Recherche** : le champ du haut filtre ta bibliothèque, les chaînes et les catégories pendant la frappe et propose de lancer la recherche sur ARTE, France.tv, M6+ ou Lumni (page de recherche officielle, en direct) ; une adresse (`arte.tv`, `https://…`) s’ouvre avec Entrée. Les flèches du clavier passent d’une affiche à l’autre.
- **Thème** sombre (par défaut), clair ou automatique : Réglages.
- **Petits écrans** : l’interface s’adapte aux fenêtres étroites et au tactile (voir `docs/MOBILE.md` ; une vraie appli Android/iOS est un autre projet).

### Plusieurs sites en même temps

Chaque site s’ouvre dans un **onglet** (jusqu’à 8), avec son propre compteur de blocage. Les sites restent des pages **en direct** : rien n’est copié, tu vois l’aspect réel du site, mis à jour en temps réel.

- **＋** (ou `Ctrl+T`) revient à l’accueil pour ouvrir un autre site ; les onglets restent ouverts et apparaissent dans la rangée **En cours**.
- **▦ Mosaïque** (`Ctrl+M`) affiche jusqu’à 4 sites côte à côte (2 en colonnes, 3 ou 4 en grille). Cliquer dans un site le rend actif : **le son suit le site actif**, les autres sont coupés.
- `Ctrl+Tab` change d’onglet, `Ctrl+W` ferme l’onglet. Le plein écran d’une vidéo agrandit ce site seul, puis la mosaïque revient.

### Chaînes TV

Sous ta bibliothèque, la section **Chaînes TV** propose les pages officielles en direct d’une vingtaine de chaînes (TF1, France 2 à 5, M6, ARTE, TMC, W9, franceinfo, BFM TV, LCI, France 24, Euronews, TV5Monde…), classées par catégorie, et un rang **Guide TV** (programme-tv.net, Télé-Loisirs, programmes ARTE). Le programme est celui du site de la chaîne, affiché tel quel. « ＋ » sur une chaîne l’ajoute sans quitter l’accueil : ajoutes-en plusieurs, puis **Tout voir en mosaïque**.

La liste est dans `src/channels.json` (titre, groupe, adresse) : ajoute ou retire des lignes à volonté. Ce n’est pas « toutes les chaînes » : seules celles dont la page directe est publique y figurent. Beaucoup de chaînes privées protègent leur direct par DRM (voir plus bas) : si l’image ne démarre pas, c’est probablement la cause.

### Ce que fait l’appli

- **Site complet** : pages, sous-domaines, iframes et lecteur vidéo (plein écran compris). La connexion est conservée entre deux lancements.
- **Pop-ups refusés.** Les liens du même site (sous-domaines compris) restent dans la fenêtre ; les liens vers un autre site s’ouvrent dans ton navigateur par défaut (au plus un toutes les 2 secondes, pour éviter les rafales de publicités). Seules les fenêtres de connexion de Google, Microsoft, Apple, Facebook, etc. sont autorisées.
- **Filtres mis à jour automatiquement** au démarrage puis toutes les 6 heures ; la dernière liste reste utilisée hors ligne. Le pied de l’accueil indique leur état.
- **Désactiver le blocage sur un site** (bouton bouclier) si un site ne s’affiche pas correctement ; le choix est mémorisé.
- Caméra, micro, position et notifications sont toujours refusés. Seules les adresses `http` et `https` sont acceptées.

## Android (prototype)

Une version Android existe (`android/`, voir **`docs/ANDROID.md`**) : même interface, recherche par plateforme, catégories, profils, Ma liste, sites en direct sans pubs, DRM Widevine du téléphone, et un bouton pour **caster l’écran** sur une Chromecast. C’est un prototype jamais lancé sur un vrai téléphone : l’APK se télécharge dans l’onglet **Actions → APK Android (prototype)** du dépôt.

## Version web

`npm run web:build` assemble la même interface en une seule page (`web/dist/index.html`, installable sur l’écran d’accueil d’un téléphone, avec `manifest.webmanifest` et icônes). On y retrouve profils, Ma liste, favoris, recherche, catégories et chaînes. **Limites** : une page web ne peut ni afficher les autres sites à l’intérieur de l’appli ni bloquer leurs pubs ; chaque site s’ouvre donc dans un nouvel onglet du navigateur, qui n’a pas le blocage de l’appli (utilise un bloqueur dans ton navigateur, par exemple Firefox avec uBlock Origin). Les données restent dans le navigateur de l’appareil.

Pour l’héberger : GitHub Pages (**Settings → Pages**) sert un dépôt public, ou un dépôt privé avec certains abonnements GitHub ; publie le contenu de `web/dist/`. Le fichier `web/dist/artifact.html` est la même page sans l’enveloppe `<html>`.

## Installer

Les installateurs se trouvent dans l’onglet **Actions → Installateurs** du dépôt GitHub (lancer « Run workflow », puis télécharger les fichiers en bas de l’exécution), ou se construisent soi-même (voir plus bas).

- **Windows** : `AdBlock-Launcher-Setup-x.y.z.exe` crée un raccourci sur le bureau et dans le menu Démarrer.
- **macOS** : `AdBlock-Launcher-x.y.z-universal.dmg` ; glisse l’application dans *Applications*, puis ajoute-la au Dock ou crée un alias sur le bureau.
- **Linux** : `AdBlock-Launcher-x.y.z.AppImage` (rendre exécutable, double-clic) ou le paquet `.deb` (`sudo apt install ./AdBlock-Launcher-x.y.z.deb`), qui ajoute l’appli au menu. Un `.deb` ne peut pas poser de raccourci sur le bureau : glisse l’entrée du menu sur le bureau.

### Avertissements à l’installation (appli non signée)

L’application n’est **pas signée** (une signature coûte un certificat payant). Windows et macOS affichent donc un avertissement. C’est attendu pour une appli partagée entre amis ; n’installe que le fichier fourni par la personne qui te l’a envoyé.

**Windows SmartScreen** : « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires**, puis **Exécuter quand même**.

**macOS Gatekeeper** : « impossible d’ouvrir, développeur non identifié » ou « endommagé ». Fais un clic droit sur l’app dans *Applications* → **Ouvrir** → **Ouvrir**. Sur macOS 15 et plus : *Réglages Système → Confidentialité et sécurité → Ouvrir quand même*. Si macOS dit que l’app est « endommagée », lance une seule fois dans le Terminal : `xattr -dr com.apple.quarantine "/Applications/AdBlock Launcher.app"`.

## Vidéos protégées (DRM / Widevine) : limite connue

Cette version d’Electron **n’embarque pas Widevine**. Les vidéos ordinaires fonctionnent (lecture, plein écran), mais les flux **chiffrés par DRM** (typiquement les replays ou films de plateformes qui exigent Widevine) ne se lanceront pas. L’appli le détecte au démarrage : un bandeau « Widevine (DRM) absent » s’affiche sur l’accueil et une pastille « DRM indisponible » dans la barre d’un site.

Rien n’est contourné. Options possibles si tu en as besoin :

1. **Utiliser le navigateur** (Chrome, Firefox, Edge) pour ces contenus protégés ; la pub y sera bloquée par une extension.
2. **Un build d’Electron compatible Widevine**, comme [castLabs « Electron for Content Security »](https://github.com/castlabs/electron-releases) : un fork d’Electron qui intègre Widevine. Il faut remplacer la dépendance `electron`, faire signer l’application via leur service VMP (Verified Media Path) et accepter leurs conditions. C’est un vrai chantier, pas un simple réglage.

Pour voir le statut : au démarrage, la sonde appelle `navigator.requestMediaKeySystemAccess('com.widevine.alpha')`.

## Développer et construire

Prérequis : Node.js 22 ou plus.

```bash
npm install
npm start             # lance l'appli (sous Linux en root/conteneur : ajouter -- --no-sandbox)
npm test              # tests de la normalisation des adresses
npm run e2e           # test de bout en bout sur un site local (voir docs/ENVIRONNEMENT.md)
npm run e2e:profiles  # profils et isolation des connexions (nécessite npm run e2e:server)
npm run e2e:real -- https://www.arte.tv/fr/   # essai sur un vrai site, avec captures
npm run icons         # régénère build/icon.png
npm run dist:linux    # AppImage + deb  → dist/
npm run dist:win      # installateur NSIS (à lancer sous Windows)
npm run dist:mac      # .dmg universel (à lancer sous macOS)
```

Chaque `dist:*` doit être lancé sur son système : `dist:win` exige `wine` depuis Linux et `dist:mac` n’existe que sous macOS. Le workflow GitHub *Installateurs* construit les trois d’un coup.

### Organisation du code

- `src/main.js` : fenêtre, onglets et mosaïque (une vue par site), blocage Ghostery (compteur et interrupteur par site), listes de filtres, pop-ups, liens, plein écran, permissions.
- `src/preload.js` : petite API exposée au lanceur (`contextIsolation`, aucun accès Node).
- `src/launcher/` : interface (accueil façon streaming et barre d’outils), avec une CSP stricte.
- `src/url.js` : normalisation des adresses, notion de « même site ».
- `src/store.js` : bibliothèque de sites et réglages dans le dossier utilisateur (les anciens favoris/historique sont convertis automatiquement).
- `android/` et `docs/ANDROID.md` : prototype Android. `docs/MOBILE.md` : Android et iOS en général.
- `src/providers.json` : plateformes (recherche et catégories) affichées sur l’accueil.
- `src/channels.json` : chaînes TV et guides affichés sur l’accueil.
- `src/sites.default.json` : sites du premier lancement (groupe « TV et replay »).

Sécurité : `contextIsolation`, `sandbox` et pas de `nodeIntegration` partout, CSP sur le lanceur, `webview` interdit, navigation limitée à `http(s)`, canaux IPC acceptés uniquement depuis le lanceur. Le site est affiché dans une session persistante séparée (`persist:sites`) ; l’appli lui présente un user-agent de Chrome classique (sans « Electron »).

## Usage

Pour un usage personnel, sur des sites légaux financés par la publicité. Le blocage prive ces sites de revenus : désactive-le avec le bouclier sur ceux que tu veux soutenir. L’appli ne contourne ni DRM, ni abonnements, ni connexions.
