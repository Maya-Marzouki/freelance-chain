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

`getDispute(id)` donne le contexte (qui, quand, fin du delai, issue par defaut) pour l'afficher dans l'interface. Limite assumee : la regle est objective mais ne juge pas la qualite du travail livre. Pour la demonstration, `npm run time:skip -- 3` avance l'horloge du noeud local de 3 jours.

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

## Reste a faire

- Decider si le contrat gere les fonds (escrow en ETH + `ReentrancyGuard`) ou seulement l'etat de l'accord (voir `BRIEF_BINOME.md` : l'escrow est dans le contrat B).
- Interface avec le contrat B (reference a l'`id` d'un accord).
