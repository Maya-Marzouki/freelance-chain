# Prompts de la conversation : synthèse pour validation avec l'enseignant

**Projet** : FreeLance Chain, contrats numériques freelance-client sur blockchain (projet en binôme).
**Outil d'IA générative** : Claude (Claude Code, modèle Sonnet 5.5), du 4 au 7 novembre 2026.
**Étudiant** : Mohamed Boussetta (contrat A, application). **Binôme** : contrat B.

> Ce document **résume** les demandes de l'étudiant à l'IA, dans l'ordre, avec ce que l'IA a produit et ce qui a été vérifié. Les formulations sont résumées, pas recopiées mot pour mot. Les messages de simple confirmation pendant les tests avec MetaMask (« prêt », « fait ») sont regroupés. La conversation complète peut être présentée en complément. Le journal détaillé de l'usage de l'IA est dans `AI_USAGE.md`.

---

## 1. Comment l'IA a été utilisée (en clair)

- **L'IA a écrit** la plus grande partie du code (contrats, tests, application) et la documentation, à la demande de l'étudiant.
- **L'étudiant a décidé** de la direction : choix de répartition, ajout des règles de litige à la place d'un arbitre humain, rôles et espaces, ordre des étapes ; il a **exécuté, testé et vérifié** : tests Hardhat, test réel avec MetaMask, lecture des soldes.
- **Pour le contrat A**, l'étudiant a d'abord écrit lui-même les étapes 1 et 2 (interface, arbitre) et les tests de l'étape 3, suivant une démarche « test d'abord » donnée par l'IA ; ensuite il a délégué l'écriture de plusieurs fonctions à l'IA.
- **Règle suivie** : ne conserver aucun code que l'on ne sait pas expliquer à l'oral (voir `DOCUMENTATION_COMPLETE.md`, section 12).

---

## 2. Les prompts, dans l'ordre

### Phase A : cadrage et préparation (4 novembre)

| # | Demande de l'étudiant (résumé) | Réponse / résultat de l'IA | Vérification |
|---|---|---|---|
| 1 | Colle le sujet (FreeLance Chain, Solidity/Hardhat/Next.js ou Node/MetaMask/Ganache), précise le travail en binôme avec un contrat chacun, et demande **quoi faire, quelle technologie et pourquoi** avant de coder | Plan complet : Hardhat + Next.js + ethers + MetaMask ; Ganache écarté car non maintenu ; deux contrats (A : accord et statut ; B : escrow par jalons) ; démarche en étapes | Choix validés par l'étudiant |
| 2 | Veut le contrat A « parfait et consistant » selon les critères (application blockchain, binôme, IA générative, oral) ; demande s'il y a des **contraintes entre son Mac M1 et le MSI** de son binôme | Analyse des critères ; ajouts proposés (machine à états testée, cas d'échec, hash des conditions, tests, README) ; compatibilité Mac/Windows (Node LTS, `.gitattributes`, `package-lock`) | Aucun blocage trouvé |
| 3 | Accepte le fichier `AI_USAGE.md` ; demande de **créer le socle du projet** sans faire le push lui-même (pour ne pas apparaître comme co-auteur dans git) | Socle créé : Hardhat, contrat A minimal, tests, script de déploiement, Next.js, documentation ; `git init` sans commit ni push | 5 tests Hardhat passent, build du front OK ; l'étudiant a poussé lui-même |
| 4 | A poussé ; demande la **démarche pour le contrat A** et un **fichier de synthèse à envoyer à son binôme** | `docs/BRIEF_BINOME.md` : répartition, contrat A, contrat B proposé, interface commune `IServiceAgreement`, scénario de démo, questions d'oral | À valider avec le binôme |

### Phase B : écriture du contrat A, étape par étape (4 novembre)

| # | Demande (résumé) | Résultat | Vérification |
|---|---|---|---|
| 5 | Étapes 1 et 2 : « donne-moi quoi faire » | Instructions : créer `IServiceAgreement.sol`, hériter dans `ServiceAgreement`, ajouter l'arbitre (alors une adresse) | L'étudiant a écrit le code ; 6 tests passent |
| 6 | Colle l'erreur `npm test` (dossier incorrect) puis l'erreur à la racine ; demande pourquoi et de corriger | Cause : `npm` cherche le `package.json` du dossier courant ; ajout d'un `package.json` racine avec des raccourcis | `npm test` relancé depuis la racine : OK |
| 7 | A terminé les étapes 1 et 2 ; demande de vérifier les 6 tests, d'ajouter dans `AI_USAGE.md`, puis de faire les nettoyages de style et d'écrire qu'il a **tout compris à l'oral** | Vérification, nettoyage (ordre des éléments, commentaires), journal mis à jour | 6 tests passent |
| 8 | Étape 3 (`startWork`) : demande la démarche, puis demande à l'IA d'écrire la fonction | Démarche « test d'abord » ; l'étudiant écrit les tests ; l'IA écrit la fonction | 9 tests passent |
| 9 | Étape 4 : demande d'écrire `markDelivered`, `approveDelivery` et de **factoriser** (`_transition`) | Fonctions et refactoring faits fonction par fonction, tests inchangés | 16 tests passent ; gas mesuré avant/après |
| 10 | Étape 5 : écrire `cancel` et `cancelOverdue` | Tests puis fonctions (annulation libre avant travail, après échéance ensuite) | 26 tests passent |
| 11 | Étape 6 : écrire les tests et fonctions de litige | `raiseDispute`, `resolveDispute` (arbitre à ce stade), 2 tests pour la couverture | 37 tests, couverture 100 % |

### Phase C : frontend et premiers tests avec MetaMask (4 novembre)

| # | Demande (résumé) | Résultat | Vérification |
|---|---|---|---|
| 12 | Dit que le front existe après un merge mais plante (module Tailwind introuvable) | Cause : `npm install` oublié après le merge ; ABI du front régénérée | Build OK |
| 13 | « Pourquoi lancer l'appli en local ? Comment tester le front ? » | Explication blockchain locale vs testnet ; constat que le front fusionné était en **mode démo** (données fictives) | Étudiant informé |
| 14 | Demande d'**intégrer le contrat A dans le front** pour que sa partie soit complète | Modules `agreement-chain.ts`, `agreement-meta.ts`, mode « chain », actions et historique lus sur la blockchain | Test de bout en bout sur un nœud neuf + navigateur avec portefeuille simulé |
| 15 | Plusieurs captures : bouton MetaMask invisible, comment obtenir la clé privée, ajouter le réseau Hardhat, clé invalide (adresse collée), application encore en démo, « Switch to Hardhat » | Guidage pas à pas ; correction d'un délai de détection du portefeuille ; explication clé privée vs adresse ; passage en « Live · Hardhat » | Application en mode live, 10 000 ETH visibles |
| 16 | Colle le journal du nœud : « la transaction a disparu et je ne peux plus accepter » | Lecture directe de la blockchain : accord créé ; le bouton absent car le compte freelance n'était pas connecté au site | Aide affichée dans l'interface |
| 17 | « Ma transaction n'est plus disponible ; je fais un merge pour le contrat B ; intègre tout au front et **teste pour que tout soit 100 % fonctionnel** » | Intégration du contrat B : escrow, jalons, financement ; tests d'intégration A+B ; test dans le navigateur avec portefeuille simulé | 49 tests ; parcours complet vérifié |
| 18 | Colle un journal d'erreur (nonce) et une capture : « pourquoi ça a échoué ? comment corriger ? » | Cause : compteurs MetaMask désynchronisés après redémarrage du nœud ; réglage « Supprimer les données d'activité et les données de nonce » | Corrigé par l'étudiant |

### Phase D : suppression de l'arbitre humain (5 novembre)

| # | Demande (résumé) | Résultat | Vérification |
|---|---|---|---|
| 19 | « L'arbitre ne doit plus être une personne physique mais des **règles dans le contrat** ; seuls le freelance et le client sont des personnes » | Contrat A : `concede` et `resolveDispute` (règle automatique après 3 jours) ; **contrat B réécrit** pour suivre A (`settle`, plus d'arbitre) ; script `time:skip` ; tests réécrits ; interface adaptée | 74 tests ; contrat A à 100 % ; test navigateur |

### Phase E : vérification réelle avec MetaMask (7 novembre)

| # | Demande (résumé) | Résultat | Vérification |
|---|---|---|---|
| 20 | « Toutes les fonctionnalités marchent ? Tu as tout testé ? Les transactions s'enregistrent ? Le montant est déduit dans MetaMask ? » | Réponse **honnête** : tout testé sauf avec le vrai MetaMask ; liste de ce qui n'était pas testé | Étudiant informé |
| 21 | « Tu ne peux pas le tester toi-même avec MCP ? », puis : Chrome impossible, demande de tester sur **Brave** ; ajoute l'extension Claude à Brave ; « essaie de tout tester et montre-moi ce que tu fais » | Test réel dans Brave piloté par l'IA, l'étudiant confirmant chaque transaction dans MetaMask | **Parcours complet validé** : −3 ETH au financement, +1 ETH puis +2 ETH reçus par le freelance, soldes lus sur la blockchain |
| 22 | Corriger le texte « Simulating transaction confirmation… » ; demande d'expliquer **à quoi sert le litige** | Texte rendu cohérent avec le mode réel ; explication du litige sans arbitre | OK |
| 23 | « Avant de tester le litige : fais les **espaces par rôle** dès le login/sign up » | Inscription et connexion par portefeuille avec choix du rôle ; espaces `/client` et `/freelancer` ; gardes d'accès ; tableaux de bord par rôle | Test dans Brave ; build de production ; 2 erreurs réelles trouvées et corrigées (voir section 4) |
| 24 | Questions pratiques pendant la préparation (nonce à réinitialiser ? relancer seulement `npm run dev` ? avertissement des deux lockfiles ; page `localhost:3300` inaccessible ; compte `0xf39F…` impossible à sélectionner) | Réponses ciblées ; l'IA a ramené l'onglet sur le bon serveur et inscrit les comptes | Corrigé |
| 25 | « Fais le test du litige » (messages « prêt » / « fait » pour chaque confirmation MetaMask) | Deux accords de test : **cession** puis **règle automatique** avec avance de l'horloge de 3 jours | **Validé** : client remboursé +2 ETH ; freelance payé +2 ETH ; escrow à 0 |
| 26 | « Génère un fichier qui documente tout, pour moi et mon binôme, et un fichier qui résume tous les prompts pour valider avec mon professeur » | `docs/DOCUMENTATION_COMPLETE.md` et ce document | À relire |

---

## 3. Décisions prises par l'étudiant

1. Prendre le **contrat A** ; le binôme prend le contrat B.
2. Ne pas laisser l'IA pousser sur git (pour que l'historique ne montre que les auteurs réels).
3. Écrire lui-même les premières étapes du contrat A et ses tests, pour comprendre le code.
4. Remplacer l'**arbitre humain** par des règles dans les contrats.
5. Mettre en place des **comptes par rôle** (client / freelance) avec un espace pour chacun.
6. Faire un **test réel avec MetaMask** plutôt que de se contenter de tests simulés.

---

## 4. Erreurs et limites de l'IA rencontrées (à présenter honnêtement)

| Problème | Comment il a été détecté | Correction |
|---|---|---|
| Commande de démonstration documentée `npm run time:skip -- 3` **fausse** | Test réel : Hardhat refuse l'argument | Remplacée par `DAYS=3 npm run time:skip` dans tous les documents |
| Page `/[space]` : `dynamicParams` incompatible avec le mode « Cache Components » | Erreur affichée dans le navigateur (le type-check ne la voit pas) | Ligne retirée |
| `usePathname()` dans la garde d'accès bloquait le **build de production** | `npm run build` | Lecture du chemin côté navigateur dans l'effet |
| Texte « Simulating… » affiché pendant une vraie transaction | Test réel dans Brave | Texte adapté au mode |
| Les tests automatiques n'avaient **pas** couvert la couche MetaMask | Question de l'étudiant « as-tu tout testé ? » | Test réel dans Brave |
| Le contrat B d'origine du binôme a été **réécrit** par l'IA | Demande de suppression de l'arbitre | À **valider avec le binôme** avant remise |

---

## 5. Points à valider avec l'enseignant

1. **Répartition du travail** : le contrat B (initialement écrit par le binôme) a été réécrit pour suivre le contrat A ; accord du binôme requis.
2. **Règle de litige** : issue objective (livré dans les délais ou non) sans arbitre, avec cession possible ; limite : ne juge pas la qualité du travail. Acceptable pour le sujet ?
3. **Rôle et nom hors chaîne** (navigateur) : suffisant pour la démonstration, mais pas une permission sur la blockchain.
4. **Part de l'IA** : démarche, code, tests et documentation générés avec Claude ; vérifiés par exécution (74 tests Hardhat, test réel avec MetaMask) ; limites listées en section 4.
5. **Blockchain locale** pour la démonstration (Hardhat) ; option d'un déploiement public sur Sepolia.

---

## 6. Comment retrouver chaque résultat

| Pour vérifier… | Aller voir… |
|---|---|
| Le journal détaillé de l'usage de l'IA | `AI_USAGE.md` |
| Toute l'explication technique | `docs/DOCUMENTATION_COMPLETE.md` |
| Les tests | `npm test` (74) et `npm run coverage` |
| L'historique des changements | `git log` |
