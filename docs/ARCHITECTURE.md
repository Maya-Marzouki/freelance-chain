# Architecture

```
Navigateur (Next.js + ethers.js) <-> MetaMask <-> Hardhat Node (chainId 31337)
                                                    |- ServiceAgreement  (contrat A)
                                                    |- contrat B (binome)
```

Le texte complet d'un contrat reste hors chaine. Seul son hash (`termsHash`, keccak256) est enregistre : cela
prouve l'integrite sans payer le stockage on-chain.

## Machine a etats de `ServiceAgreement`

```
Created --accept--> Accepted --start--> InProgress --deliver--> Delivered --approve--> Completed
   |                   |                    |                        |
   +-----cancel--------+                    +--raiseDispute----------+--> Disputed --concede / regle automatique--> Completed | Cancelled
                       +--cancelOverdue (apres l'echeance)--> Cancelled
                       InProgress --cancelOverdue (apres l'echeance)--> Cancelled
```

| Fonction | Appelant | Statut requis | Statut resultant |
|----------|----------|---------------|------------------|
| `createAgreement` | client | - | Created |
| `acceptAgreement` | freelance | Created | Accepted |
| `startWork` | freelance | Accepted | InProgress |
| `markDelivered` | freelance | InProgress | Delivered |
| `approveDelivery` | client | Delivered | Completed |
| `cancel` | client | Created / Accepted | Cancelled |
| `cancelOverdue` | client | Accepted / InProgress, apres l'echeance | Cancelled |
| `raiseDispute` | client ou freelance | InProgress / Delivered | Disputed |
| `concede` | client ou freelance | Disputed | Completed (le client cede) ou Cancelled (le freelance cede) |
| `resolveDispute` | n'importe qui, apres 3 jours | Disputed | Completed ou Cancelled selon la regle automatique |

## Frontend : modes demo et chain

Le store (`frontend/src/components/providers/app-store.tsx`) fonctionne en deux modes :

| Mode | Condition | Donnees |
|------|-----------|---------|
| demo | contrat non deploye, ou portefeuille non connecte / pas sur le reseau 31337 | donnees fictives en memoire |
| chain | adresse du contrat renseignee (`npm run deploy:local`) et MetaMask connecte au reseau Hardhat | lues et ecrites sur `ServiceAgreement` |

- `lib/agreement-chain.ts` : lecture des accords et de l'historique (evenements `AgreementCreated` et `StatusChanged`), envoi des transactions, traduction des erreurs du contrat.
- `lib/agreement-meta.ts` : le texte des conditions et la description restent hors chaine (localStorage du navigateur, indexes par `termsHash`). En production on utiliserait IPFS ou une base de donnees.
- Le client d'un accord est le portefeuille connecte (`msg.sender`). Pour agir en freelance, changer de compte dans MetaMask.
- Les jalons et les fonds sont lus et ecrits sur `EscrowMilestones` (contrat B) : `lib/escrow-chain.ts`, `lib/escrow-contract.ts`.

### Litiges : pas d'arbitre, des regles dans le contrat

Il n'y a que deux personnes dans l'application : le client et le freelance. Un litige se termine par :

1. **La cession d'une partie** (`concede`), a tout moment : le client qui cede paie le freelance (Completed), le freelance qui cede rembourse le client (Cancelled).
2. **La regle automatique** (`resolveDispute`), appelable par n'importe qui une fois `DISPUTE_WINDOW` (3 jours) ecoule sans cession :

| Situation a l'ouverture du litige | Issue | Pourquoi |
|-----------------------------------|-------|----------|
| Rien livre (`InProgress`) | Cancelled : le client est rembourse | le freelance n'a rien a faire valoir |
| Livre dans les delais (`deliveredAt <= deadline`) | Completed : le freelance est paye | la livraison est un fait verifiable |
| Livre en retard | Cancelled : le client est rembourse | l'echeance n'a pas ete respectee |

`getDispute(id)` donne le contexte (qui, quand, fin du delai, issue par defaut) pour l'afficher dans l'interface. Limite assumee : la regle est objective mais ne juge pas la qualite du travail livre. Pour la demonstration, `DAYS=3 npm run time:skip` avance l'horloge du noeud local de 3 jours.

### Lien entre le contrat A et le contrat B

B lit A (`IServiceAgreement`) : il n'a pas d'arbitre et ne reprend ni les parties ni le montant a la saisie.

| Regle appliquee par B | Pourquoi |
|-----------------------|----------|
| Seul le client de l'accord cree l'escrow ; freelance et montant viennent de A | rien n'est saisi deux fois |
| Somme des jalons = montant de l'accord | coherence des deux contrats |
| Un seul escrow par accord | `escrowOfAgreement` |
| Depot possible seulement une fois l'accord accepte | l'argent n'est bloque que si le freelance s'est engage |
| Jalons geles si l'accord est `Disputed` ou `Cancelled` | un litige gele les fonds |
| `settle(escrowId)`, par n'importe qui, quand l'accord est `Completed` ou `Cancelled` | Completed paie le freelance du reste, Cancelled rembourse le client |

Pour se faire rembourser avant le debut du travail : le client annule l'accord (`cancel`), puis n'importe qui appelle `settle`.

Liberation d'un jalon : le contrat exige deux etapes (`approveMilestone` puis `releasePayment`). Le front les enchaine en un clic (deux confirmations MetaMask) ; si la seconde est refusee, le jalon reste `Approved` et peut etre libere plus tard.

## Comptes et espaces par role

Deux personnes seulement : le client et le freelance. Chacun s'inscrit en choisissant son role, puis accede a son espace.

| Element | Fonctionnement |
|---------|----------------|
| Inscription (`/signup`) | choix du role, nom, connexion du portefeuille MetaMask. Pas de mot de passe : le portefeuille est l'identifiant |
| Connexion (`/login`) | connexion du portefeuille ; si l'adresse a un compte, redirection vers `/<role>/dashboard`, sinon vers l'inscription |
| Deconnexion | bouton dans la barre du haut (deconnecte aussi le portefeuille de l'application) |
| Espaces | `/client/...` et `/freelancer/...` : navigation, tableau de bord et donnees propres a chaque role |
| Gardes | sans session, retour a `/login` ; un client qui ouvre l'espace freelance (et inversement) est renvoye dans le sien, sur la meme page ; `Create Agreement` est reserve au client |
| Demo | sans portefeuille, "Demo as client / freelancer" donne acces a des donnees d'exemple |

Dans un espace, chacun ne voit que ses accords : le client ceux dont il est le client, le freelance ceux dont il est le freelance (avec leurs jalons, escrows et activite).

Fichiers : `lib/profile.ts` (compte), `components/auth/` (session, pages), `components/space/` (contexte d'espace, liens, gardes), `app/[space]/` (pages des deux espaces).

Limites assumees : le role et le nom sont stockes dans le navigateur (localStorage, par adresse et par origine) ; ce n'est pas une permission sur la blockchain, ou les donnees restent publiques. Les contrats imposent qui peut faire quoi sur chaque accord. Un compte cree sur `localhost:3000` n'existe pas sur un autre port.

## Livrable : preuve de livraison

`markDelivered(id, deliverableHash, uri)` : le freelance fournit le lien vers son travail (depot, drive, IPFS). Le front calcule `deliverableHash` = keccak256 du lien. Le contrat stocke les deux dans `deliverables[id]` et emet `DeliverySubmitted`. Un hash nul ou un lien vide sont refuses (`InvalidParameters`).

Le client ouvre le lien dans la carte "Deliverable" de la page detail, puis valide (`approveDelivery`) ou ouvre un litige (`raiseDispute`).

Le contrat garantit **qui** a livre, **quand** (`deliveredAt`) et **ou** (le lien enregistre, qui ne peut plus changer). Il ne juge pas la qualite, et il ne fige pas le contenu derriere le lien : un depot peut encore evoluer. Pour figer le contenu, on peut donner un lien vers un commit ou un tag precis (ou un CID IPFS).

### Livrable par jalon

`EscrowMilestones.submitMilestone(escrowId, milestoneId, deliverableUri)` : un jalon ne peut etre soumis qu'avec le lien de son livrable (`"Deliverable required"` sinon). Le lien est stocke dans le jalon (`Milestone.deliverableUri`) et emis dans `MilestoneSubmitted`. Dans "Escrow & Milestones", le client voit le lien de chaque jalon soumis ("Review deliverable") et le rouvre depuis la fenetre "Approve & Release" : il verifie jalon par jalon avant de payer.

## Contrat C : `ReputationToken` (token FLR)

Token ERC-20 de reputation, **non transferable** (soulbound). Le paiement reste en ETH dans l'escrow (B) : FLR ne sert qu'a mesurer l'historique d'un compte.

| Element | Regle |
|---|---|
| Frappe | `claimReward(agreementId)`, appelable par n'importe qui |
| Conditions | accord `Completed` (A) **et** escrow `Completed` (B), donc freelance paye en totalite ; une seule fois par accord |
| Montants | freelance : 100 FLR par ETH paye ; client : 20 FLR par ETH paye (`FREELANCER_RATE`, `CLIENT_RATE`) |
| Compteur | `missionsCompleted(adresse)` : nombre de missions recompensees |
| Transferts | `transfer`, `transferFrom` et `approve` revertent (`TransferDisabled`) : la reputation ne s'achete pas |

C lit A et B (`getAgreement`, `escrowOfAgreement`, `getEscrow`) sans jamais les modifier : aucun role de "minter" a gerer. Il est deploye apres B (`scripts/deploy.js`). Cote front, l'onglet **Rewards** (barre laterale des deux espaces) affiche le solde FLR du portefeuille, les accords prets a etre reclames (bouton "Claim") et l'historique des recompenses. Chaque recompense apparait aussi dans **Activity History** ("Reputation Rewarded"). La carte "Reputation" de la page detail d'un accord reste disponible.

Pourquoi faut-il "claim" ? Un smart contract ne s'execute jamais tout seul : il faut qu'une transaction l'appelle. `claimReward` est cette transaction ; n'importe qui peut l'envoyer (client ou freelance), une seule fois par accord, et les deux parties recoivent leurs FLR en meme temps. L'alternative serait de frapper les FLR dans la derniere transaction de l'escrow, ce qui obligerait B a connaitre C et a lui donner un role de "minter".

Limite assumee : un client et un freelance complices peuvent se payer eux-memes pour gonfler leur reputation. Chaque FLR coute pourtant un vrai paiement en ETH et des frais de gas, et le compteur de missions reste visible publiquement.

## Reste a faire

- Decider si le contrat gere les fonds (escrow en ETH + `ReentrancyGuard`) ou seulement l'etat de l'accord (voir `BRIEF_BINOME.md` : l'escrow est dans le contrat B).
- Interface avec le contrat B (reference a l'`id` d'un accord).
