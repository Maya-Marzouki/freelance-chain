# FreeLance Chain : documentation complète

Document destiné aux deux membres du binôme : il explique **ce que fait l'application, comment elle est construite, comment la lancer, comment la démontrer et quoi répondre à l'oral**.

> Dernière mise à jour : 7 novembre 2026. Les chiffres (tests, adresses, soldes) ont été vérifiés pendant le développement.

---

## 1. Le projet en bref

**FreeLance Chain** est une application blockchain qui permet à un **client** et à un **freelance** de conclure un accord de prestation, de bloquer l'argent dans un **escrow** payé **jalon par jalon**, et de régler un désaccord **sans juge humain**, par des règles écrites dans les contrats.

Le sujet demandait : enregistrer l'accord, les parties et le statut dans un smart contract, avec une démonstration de la création, de l'acceptation et du suivi. L'application va plus loin : paiement par jalons, litiges automatiques, comptes par rôle.

### Les trois ensembles

| Ensemble | Rôle | Technologie |
|---|---|---|
| **Contrat A** `ServiceAgreement` | Enregistre l'accord, les parties, le statut ; gère le cycle de vie et les litiges | Solidity |
| **Contrat B** `EscrowMilestones` | Bloque l'argent et le libère par jalons ; suit le statut de A | Solidity |
| **Application web** | Inscription par rôle, espaces client et freelance, appels aux contrats | Next.js, TypeScript, ethers.js, MetaMask |

---

## 2. Architecture

```
 Navigateur (Next.js + ethers.js)
        │  signe avec
        ▼
    MetaMask  ──────►  Blockchain locale Hardhat (chaîne 31337, http://127.0.0.1:8545)
                              ├─ ServiceAgreement  (contrat A)  adresse 0x5FbD…0aa3
                              └─ EscrowMilestones  (contrat B)  adresse 0xe7f1…0512
                                       │ lit le statut de A (IServiceAgreement)
```

### Principe central : A est la source de vérité, B suit A
- **A** décide du statut d'un accord (créé, accepté, en cours, livré, terminé, annulé, en litige).
- **B** ne décide de rien sur le statut : il **lit** A. Quand A est « en litige », B gèle les jalons. Quand A est terminé, `settle` paie le freelance ; quand A est annulé, `settle` rembourse le client.
- Le lien entre les deux est l'identifiant de l'accord (`agreementId`).

### Ce qui est sur la blockchain et ce qui ne l'est pas
| Sur la blockchain | Hors blockchain |
|---|---|
| Parties, montant, échéance, statut, **hash** des conditions | Texte des conditions, description, nom du fichier joint (navigateur) |
| Jalons (titre, montant, échéance, statut), fonds de l'escrow | Compte de l'application : nom et rôle choisi à l'inscription (navigateur) |
| Historique : événements `StatusChanged`, `EscrowCreated`… | Données de démonstration (mode démo) |

Le **hash** (keccak256) des conditions prouve que le texte n'a pas été modifié, sans payer le stockage on-chain.

---

## 3. Structure du dépôt

```
freelance-chain/
├── blockchain/                  Hardhat : contrats, tests, scripts
│   ├── contracts/
│   │   ├── IServiceAgreement.sol    interface commune A/B (enum Status, struct Agreement, getAgreement)
│   │   ├── ServiceAgreement.sol     contrat A
│   │   └── EscrowMilestones.sol     contrat B
│   ├── test/                    ServiceAgreement (42), EscrowMilestones (24), Integration (8)
│   └── scripts/                 deploy.js (déploie A puis B), skip-time.js (avance l'horloge)
├── frontend/                    Next.js
│   └── src/
│       ├── app/                 pages : /, /login, /signup, /client/..., /freelancer/...
│       ├── components/          auth, space (espaces), agreements, escrow, dashboard, layout, ui…
│       ├── lib/                 agreement-chain.ts, escrow-chain.ts (appels aux contrats), lifecycle.ts, profile.ts…
│       └── contracts/           adresses et ABI générés par le déploiement
├── docs/                        ARCHITECTURE.md, BRIEF_BINOME.md, ce document, PROMPTS_POUR_VALIDATION.md
├── AI_USAGE.md                  journal d'utilisation de l'IA (exigé par le sujet)
└── README.md                    démarrage rapide
```

---

## 4. Technologies et pourquoi

| Besoin | Choix | Pourquoi |
|---|---|---|
| Contrats | **Solidity 0.8.28** + OpenZeppelin | Standard du marché ; protection native contre les dépassements de capacité ; `ReentrancyGuard` pour B |
| Environnement | **Hardhat 2** | Compilation, tests JS, déploiement, nœud local intégrés |
| Blockchain locale | **Hardhat Node** | Remplace Ganache (non maintenu) ; comptes de test, confirmation instantanée, erreurs lisibles |
| Frontend | **Next.js + TypeScript** | Demandé par le sujet ; routes par espace (`/client`, `/freelancer`) |
| Lien front/chaîne | **ethers.js v6** | Simple à expliquer, lecture des événements, signature via MetaMask |
| Portefeuille | **MetaMask** | Signature des transactions ; l'adresse sert d'identifiant de connexion |

---

## 5. Contrat A : `ServiceAgreement`

### 5.1 Données d'un accord
`id`, `client`, `freelancer`, `title`, `termsHash` (hash des conditions), `amount` (en wei), `deadline`, `status`.

### 5.2 Les 7 statuts (ordre de l'enum : ne jamais le changer)
`Created(0)`, `Accepted(1)`, `InProgress(2)`, `Delivered(3)`, `Completed(4)`, `Cancelled(5)`, `Disputed(6)`

### 5.3 Machine à états

```
Created ──accept──► Accepted ──start──► InProgress ──deliver──► Delivered ──approve──► Completed
   │                    │                    │                       │
   └───── cancel ───────┘                    └──── raiseDispute ─────┘──► Disputed
                        InProgress ──cancelOverdue (après l'échéance)──► Cancelled
   Disputed ──concede / règle automatique──► Completed  ou  Cancelled
```

### 5.4 Fonctions

| Fonction | Qui | Statut requis | Résultat |
|---|---|---|---|
| `createAgreement(freelancer, title, termsHash, amount, deadline)` | client (`msg.sender`) | n/a | `Created` |
| `acceptAgreement(id)` | freelance | Created | Accepted |
| `startWork(id)` | freelance | Accepted | InProgress |
| `markDelivered(id)` | freelance | InProgress | Delivered (enregistre `deliveredAt`) |
| `approveDelivery(id)` | client | Delivered | Completed |
| `cancel(id)` | client | Created ou Accepted | Cancelled |
| `cancelOverdue(id)` | client | Accepted ou InProgress, **après l'échéance** | Cancelled |
| `raiseDispute(id)` | client ou freelance | InProgress ou Delivered | Disputed |
| `concede(id)` | client ou freelance | Disputed | Completed (le client cède) ou Cancelled (le freelance cède) |
| `resolveDispute(id)` | **n'importe qui**, après 3 jours | Disputed | Completed ou Cancelled selon la règle automatique |
| `getAgreement(id)`, `getDispute(id)` | lecture | n/a | données de l'accord / du litige |

Pas d'argent dans A : A ne manipule que l'état.

### 5.5 Litiges sans arbitre : la règle du contrat
Un litige se termine de deux façons :

1. **Une partie cède** (`concede`), à tout moment. Celui qui cède reconnaît qu'il a tort.
2. **Règle automatique** (`resolveDispute`), appelable par **n'importe qui** quand `DISPUTE_WINDOW` (3 jours) est écoulé :

| Situation à l'ouverture du litige | Issue |
|---|---|
| Rien n'a été livré (InProgress) | Le client est remboursé (Cancelled) |
| Livré **dans les délais** (`deliveredAt ≤ deadline`) | Le freelance est payé (Completed) |
| Livré **en retard** | Le client est remboursé (Cancelled) |

**Limite à assumer à l'oral** : la règle est objective (elle regarde des faits vérifiables) mais ne juge pas la **qualité** du travail. Pistes d'amélioration : plusieurs jurés, vote, délai de contestation.

### 5.6 Erreurs (erreurs personnalisées, moins chères en gas que des messages)
`NotClient`, `NotFreelancer`, `NotParty`, `InvalidStatus(statut)`, `AgreementNotFound`, `InvalidParameters`, `DeadlineNotPassed`, `DisputeWindowOpen(finDuDelai)`.

### 5.7 Choix de conception à connaître
- `_transition(id, accord, statutAttendu, nouveauStatut)` : une seule fonction interne vérifie le statut, le change et émet l'événement `StatusChanged`. Elle est `internal` pour qu'on ne puisse pas changer un statut de l'extérieur. Coût mesuré : environ 73 gas de plus par appel, mais un déploiement moins cher (661 572 contre 719 485 gas).
- Le contrôle de **qui** appelle reste dans chaque fonction publique, car il change d'une fonction à l'autre.
- `block.timestamp` peut être décalé de quelques secondes par le validateur : acceptable pour des délais de plusieurs jours.

---

## 6. Contrat B : `EscrowMilestones`

### 6.1 Principe
Le client bloque le montant total de l'accord ; chaque **jalon** est ensuite libéré après deux étapes : le freelance **soumet**, le client **approuve**, puis le client **libère** le paiement.

### 6.2 Statuts
- Escrow : `Created`, `Funded`, `InProgress`, `Completed`, `Cancelled`.
- Jalon : `Pending`, `Submitted`, `Approved`, `Released`.

### 6.3 Fonctions

| Fonction | Qui | Condition |
|---|---|---|
| `createEscrow(agreementId, montants[], titres[], descriptions[], échéances[])` | client de l'accord | accord ouvert, somme des jalons = montant de l'accord, un seul escrow par accord |
| `deposit(escrowId)` (payable) | client | montant exact ; **accord accepté** par le freelance |
| `submitMilestone(escrowId, i)` | freelance | escrow financé, avant l'échéance du jalon, accord ni en litige ni annulé |
| `approveMilestone(escrowId, i)` | client | jalon soumis |
| `releasePayment(escrowId, i)` | client | jalon approuvé ; envoie l'argent au freelance |
| `settle(escrowId)` | **n'importe qui** | accord **terminé** : Completed paie le freelance du reste, Cancelled rembourse le client |

### 6.4 Règles qui lient B à A
- Les parties et le montant viennent de A : rien n'est saisi deux fois.
- **Litige sur A = jalons gelés** dans B (« Agreement frozen »).
- Pour se faire rembourser avant le début du travail : le client annule l'accord (A), puis n'importe qui appelle `settle`.
- Sécurité : `ReentrancyGuard` et mise à jour de l'état **avant** l'envoi d'argent.

> ⚠️ **À valider avec le binôme** : le contrat B d'origine avait son propre arbitre et recevait freelance et arbitre en paramètres. Il a été **réécrit** pour suivre A (constructeur avec l'adresse de A, plus d'arbitre, `settle` à la place de `refund`/`raiseDispute`/`resolveDispute`). Ses tests ont été réécrits en conséquence.

---

## 7. L'application web

### 7.1 Comptes et espaces par rôle
- **Inscription** (`/signup`) : on choisit **Client** ou **Freelancer**, un nom, on connecte MetaMask. Pas de mot de passe : le **portefeuille est l'identifiant**. Le compte (nom + rôle) est lié à l'adresse et conservé dans le navigateur.
- **Connexion** (`/login`) : connexion du portefeuille ; si l'adresse a un compte, redirection vers l'espace du rôle, sinon vers l'inscription.
- **Deux espaces** : `/client/...` et `/freelancer/...`, avec navigation, tableau de bord et données propres.
- **Gardes** : sans session, retour à `/login` ; un client qui ouvre l'espace freelance est renvoyé dans le sien, sur la même page ; « Create Agreement » est réservé au client.
- **Déconnexion** : bouton en haut à droite.

| | Client | Freelance |
|---|---|---|
| Menu | Dashboard, My Agreements, Create Agreement, Escrow & Milestones, Activity, Settings | Dashboard, My Jobs, Milestones & Earnings, Activity, Settings |
| Cartes | My Agreements, Active, To Review, Funds Locked | My Jobs, Active, To Accept or Start, Earned |

Un client ne voit que les accords dont il est le client, un freelance que ceux dont il est le freelance.

### 7.2 Deux modes
- **Chain** (réel) : MetaMask connecté au réseau Hardhat (31337) et contrats déployés. Les accords sont lus et écrits sur la blockchain. La barre latérale affiche « Live · Hardhat ».
- **Demo** : sans portefeuille, données fictives en mémoire (« Demo as client / freelancer »).

### 7.3 Où se trouve la logique
| Fichier | Rôle |
|---|---|
| `lib/agreement-chain.ts` | Lire les accords et leur historique (événements), envoyer les transactions de A, traduire les erreurs du contrat |
| `lib/escrow-chain.ts` | Idem pour B (escrows, jalons, financement, libération, `settle`) |
| `lib/lifecycle.ts` | Règles « qui peut faire quoi dans quel statut » : l'interface n'affiche jamais une action que le contrat refuserait |
| `lib/profile.ts`, `components/auth/` | Comptes et session |
| `components/space/` | Espaces, liens par rôle, gardes d'accès |
| `components/providers/app-store.tsx` | État global des deux modes, interrogation de la chaîne toutes les 5 secondes |

L'application utilise l'**horloge de la blockchain** (dernier bloc) pour les échéances et le délai de litige, pas l'heure de l'ordinateur : indispensable pour la démonstration avec avance du temps.

---

## 8. Installation et lancement

### 8.1 Prérequis
- Node.js 22 LTS (`nvm use`, voir `.nvmrc`) ; Git ; extension MetaMask.
- Mac (Apple Silicon) et Windows : mêmes commandes, avec les remarques de la section 8.5.

### 8.2 Installation (une fois)
```bash
git clone <url-du-depot> && cd freelance-chain
cd blockchain && npm install
cd ../frontend && npm install
```
Après chaque `git pull` qui modifie un `package.json`, relancer `npm install`.

### 8.3 Lancer le projet (3 terminaux, dans cet ordre)
```bash
# Terminal 1 : la blockchain locale (laisser ouvert)
npm run node

# Terminal 2 : déployer UNE SEULE FOIS par nœud neuf
npm run deploy:local

# Terminal 3 : l'application
cd frontend && npm run dev          # http://localhost:3000
```
Les adresses des contrats sont déterministes : sur un nœud neuf, le déploiement redonne `0x5FbD…` (A) puis `0xe7f1…` (B), déjà présentes dans `frontend/src/contracts/*.json`. **Ne déployez pas deux fois** sur le même nœud : les adresses changent.

### 8.4 Configurer MetaMask
1. Ajouter le réseau **Hardhat Local** : RPC `http://127.0.0.1:8545`, ID de chaîne `31337`, symbole `ETH` (ou bouton « Switch to Hardhat Local » de l'application).
2. Importer des comptes de test avec les clés affichées par `npm run node` (10 000 ETH chacun). Ces clés sont **publiques** : ne jamais y envoyer de vrais fonds.
3. Rôles utilisés dans les démonstrations (numérotation Hardhat) : compte #0 `0xf39F…` = client, compte #2 `0x3C44…` = freelance. Les deux comptes doivent être **différents** (le contrat refuse qu'une même adresse soit client et freelance).

### 8.5 Remarques Windows (MSI)
- Utiliser `nvm-windows`. Le fichier `.gitattributes` force les fins de ligne LF.
- Avancer l'horloge : `DAYS=3 npm run time:skip` est la syntaxe Mac/Linux. PowerShell : `$env:DAYS=3; npm run time:skip`. Invite de commandes : `set DAYS=3 && npm run time:skip`.

### 8.6 Après avoir redémarré le nœud
Le nœud Hardhat repart de zéro. Il faut : redéployer **une fois**, puis dans MetaMask (**pour chaque compte**) « Paramètres, Outils pour les développeurs, Supprimer les données d'activité et les données de nonce ». Sinon : erreur « Nonce too high ».

---

## 9. Scénarios de démonstration

### 9.1 Parcours nominal (≈ 10 minutes)
1. **Client** : s'inscrire, créer un accord de 3 ETH (freelance = adresse `0x3C44…`), puis « Set up escrow » (2 jalons : 1 et 2 ETH).
2. **Freelance** : accepter, puis démarrer.
3. **Client** : « Fund 3 ETH » (**3 ETH déduits** du solde).
4. **Freelance** : soumettre le jalon 1. **Client** : « Approve & Release » (deux confirmations) : **le freelance reçoit exactement 1 ETH**.
5. Répéter avec le jalon 2, puis le freelance « Mark as Delivered » et le client « Approve Delivery » : accord `Completed`, escrow à 0 ETH.

### 9.2 Litige résolu par cession
Accord en cours et escrow financé → le client « Raise Dispute » → le freelance « Concede (refund client) » → accord `Cancelled` → « Settle escrow » : le client est remboursé.

### 9.3 Litige résolu par la règle automatique
Accord livré dans les délais et escrow financé → le client ouvre un litige → l'application affiche « Automatic ruling available from… » → on avance l'horloge :
```bash
DAYS=3 npm run time:skip
```
→ un des deux clique « Apply automatic ruling » → accord `Completed` → « Settle escrow » : le freelance est payé.

### 9.4 Cas d'échec à montrer
Un tiers essaie d'accepter l'accord : la transaction échoue avec « Only the freelancer of this agreement can do this ».

---

## 10. Tests et vérifications

### 10.1 Tests automatiques : 74 qui passent
```bash
npm test                 # depuis la racine
npm run coverage         # couverture (ServiceAgreement : 100 %)
```
| Fichier | Tests | Ce qu'il vérifie |
|---|---|---|
| `ServiceAgreement.test.js` | 42 | chaque fonction : cas nominal, mauvais appelant, mauvais statut ; litiges et règle automatique |
| `EscrowMilestones.test.js` | 24 | création, dépôt, jalons, gel pendant un litige, `settle` |
| `Integration.test.js` | 8 | A et B ensemble : parcours complet, deux litiges, annulation, droits d'accès, soldes exacts |

### 10.2 Test réel avec MetaMask (Brave), soldes relevés sur la blockchain
| Étape | Résultat vérifié |
|---|---|
| Création accord, escrow, acceptation | statuts corrects, seuls les frais de transaction sont payés |
| Financement | client **−3 ETH**, contrat **+3 ETH** |
| Jalon 1 libéré | freelance **+1 ETH exact** |
| Jalon 2 libéré | freelance **+2 ETH exact**, contrat à 0 |
| Litige par cession | client remboursé **+2 ETH exact** |
| Litige par règle automatique (après 3 jours) | freelance payé **+2 ETH** |

### 10.3 Non testé dans le navigateur
L'annulation par le client suivie de « Settle escrow », et `cancelOverdue` : couverts par les tests automatiques seulement.

---

## 11. Décisions et limites (à connaître pour l'oral)

| Sujet | Décision | Limite / piste |
|---|---|---|
| Litiges | Règles dans le contrat, pas d'arbitre humain | Ne juge pas la qualité ; piste : jurés, vote |
| Rôle et nom | Stockés dans le navigateur, liés à l'adresse | Pas une permission on-chain ; les données de la chaîne restent publiques ; un compte créé sur un autre site/port n'existe pas |
| Texte des conditions | Hors chaîne (hash sur la chaîne) | Visible seulement dans le navigateur qui l'a créé ; en production : IPFS |
| Blockchain | Locale (Hardhat) | Redémarrer le nœud efface tout ; option : Sepolia pour une démonstration publique |
| Gestion d'argent | Seulement dans B, A ne touche pas aux fonds | B dépend de A (adresse fixée au déploiement) |

---

## 12. Questions probables à l'oral

1. **Pourquoi stocker un hash plutôt que le texte ?** Coût du stockage ; le hash prouve l'intégrité.
2. **Qu'est-ce que la réentrance et où serait-elle possible ?** Un destinataire rappelle le contrat pendant l'envoi d'argent (`releasePayment`, `settle`). Défense : `ReentrancyGuard` + état mis à jour avant l'envoi.
3. **Pourquoi des erreurs personnalisées ?** Moins chères en gas, et transportent des données (statut courant, fin du délai).
4. **Pourquoi `_transition` est `internal` ?** Sinon n'importe qui changerait un statut sans contrôle.
5. **Que se passe-t-il si le freelance n'accepte jamais ?** Le client peut annuler (`cancel`) tant que l'accord est `Created` ou `Accepted`, puis récupérer ses fonds par `settle`.
6. **Et si le client disparaît ?** Le freelance peut ouvrir un litige ; après 3 jours, la règle automatique tranche selon la livraison.
7. **Comment fonctionne le litige sans arbitre ?** Cession d'une partie, ou règle automatique objective après 3 jours (section 5.5).
8. **Pourquoi `block.timestamp` et quelle limite ?** Seule horloge de la chaîne ; décalage possible de quelques secondes, négligeable pour des jours.
9. **Comment B sait-il qu'un accord est en litige ?** Il lit le statut de A à chaque action (interface `IServiceAgreement`).
10. **Pourquoi deux contrats ?** Séparation des responsabilités : A = état, B = fonds ; chaque contrat reste simple et testable.
11. **Qu'est-ce qu'un nonce ?** Compteur de transactions d'un compte ; MetaMask et le nœud doivent être d'accord (cause de l'erreur « Nonce too high »).
12. **Quelle part vient de l'IA ?** Voir `AI_USAGE.md` et `docs/PROMPTS_POUR_VALIDATION.md` : la démarche, le code et les tests ont été générés avec Claude, relus, exécutés et vérifiés par l'étudiant ; les erreurs détectées sont listées.

---

## 13. Dépannage (problèmes réellement rencontrés)

| Symptôme | Cause | Solution |
|---|---|---|
| `Nonce too high. Expected nonce to be 0 but got 1` | Le nœud a redémarré, MetaMask garde ses compteurs | MetaMask : « Supprimer les données d'activité et les données de nonce », pour chaque compte |
| `npm test` : `package.json` introuvable | Mauvais dossier | Lancer depuis la racine du projet |
| `Cannot find module '@tailwindcss/postcss'` | `npm install` oublié après un merge | `npm install` dans `frontend/` |
| Erreur d'hydratation, page grise | `npm run build` lancé pendant `npm run dev` (même dossier `.next`) | Arrêter, `rm -rf .next`, relancer `npm run dev` ; ne pas builder pendant que le serveur de dev tourne |
| Application en « Demo mode » | Mauvais réseau ou contrats non déployés | Passer MetaMask sur Hardhat Local ; `npm run deploy:local` |
| Bouton absent / compte non vu | Le compte n'est pas connecté au site dans MetaMask | Sélectionner le compte puis « Connecter » sur la ligne `localhost:3000` |
| `Port 8545 already in use` | Un autre nœud tourne | Garder un seul `npm run node` |

---

## 14. Glossaire

- **Wei** : plus petite unité d'ETH (1 ETH = 10¹⁸ wei). Les montants des contrats sont en wei.
- **Gas** : coût de calcul d'une transaction, payé en ETH.
- **ABI** : description des fonctions d'un contrat, utilisée par ethers.js pour l'appeler.
- **Événement** : trace écrite par le contrat (ex. `StatusChanged`), relue par l'application pour l'historique.
- **Escrow** : séquestre ; l'argent est bloqué dans un contrat jusqu'à une condition.
- **Jalon** : étape payée séparément.
- **Hash** : empreinte d'un texte ; change si le texte change.
- **Nonce** : compteur de transactions d'un compte.

---

## 15. État du projet et reste à faire

- Contrats A et B, tests (74), application, espaces par rôle : **terminés et testés**.
- À faire avant la remise : **faire valider par le binôme** la réécriture du contrat B ; préparer la présentation ; relire `AI_USAGE.md`.
- Pistes d'amélioration à citer : litige avec jurés ou vote, stockage des conditions sur IPFS, déploiement sur Sepolia, espaces et tableaux de bord encore plus spécialisés.
