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
   +-----cancel--------+                    +--raiseDispute----------+--> Disputed --resolve--> Completed | Cancelled
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
| `resolveDispute` | arbitre | Disputed | Completed ou Cancelled |

## Frontend : modes demo et chain

Le store (`frontend/src/components/providers/app-store.tsx`) fonctionne en deux modes :

| Mode | Condition | Donnees |
|------|-----------|---------|
| demo | contrat non deploye, ou portefeuille non connecte / pas sur le reseau 31337 | donnees fictives en memoire |
| chain | adresse du contrat renseignee (`npm run deploy:local`) et MetaMask connecte au reseau Hardhat | lues et ecrites sur `ServiceAgreement` |

- `lib/agreement-chain.ts` : lecture des accords et de l'historique (evenements `AgreementCreated` et `StatusChanged`), envoi des transactions, traduction des erreurs du contrat.
- `lib/agreement-meta.ts` : le texte des conditions et la description restent hors chaine (localStorage du navigateur, indexes par `termsHash`). En production on utiliserait IPFS ou une base de donnees.
- Le client d'un accord est le portefeuille connecte (`msg.sender`). Pour agir en freelance ou en arbitre, changer de compte dans MetaMask.
- Les jalons d'escrow (contrat B) ne sont pas sur la chaine : vides en mode chain.

## Reste a faire

- Decider si le contrat gere les fonds (escrow en ETH + `ReentrancyGuard`) ou seulement l'etat de l'accord (voir `BRIEF_BINOME.md` : l'escrow est dans le contrat B).
- Interface avec le contrat B (reference a l'`id` d'un accord).
