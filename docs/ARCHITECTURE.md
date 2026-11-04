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
Created --accept (freelance)--> Accepted --start--> InProgress --deliver (freelance)--> Delivered
   |                               |                    |                                  |
   +--cancel--> Cancelled <--------+                    +--dispute--> Disputed <--dispute--+
                                                                                          |
Delivered --approve (client)--> Completed                                                 +--> resolution
```

| Fonction | Appelant | Statut requis | Statut resultant |
|----------|----------|---------------|------------------|
| `createAgreement` | client | - | Created |
| `acceptAgreement` | freelance | Created | Accepted |
| `startWork` | freelance | Accepted | InProgress |
| `markDelivered` | freelance | InProgress | Delivered |
| `approveDelivery` | client | Delivered | Completed |
| `cancel` | client | Created / Accepted | Cancelled |
| `raiseDispute` | client ou freelance | InProgress / Delivered | Disputed |

## Reste a faire

- Fonctions du tableau ci-dessus (sauf `createAgreement` et `acceptAgreement`, deja faites), avec un test par transition valide ET par transition interdite.
- Decider si le contrat gere les fonds (escrow en ETH + `ReentrancyGuard`) ou seulement l'etat de l'accord.
- Pages frontend : creation, liste, detail avec boutons selon le role et le statut.
- Interface avec le contrat B (reference a l'`id` d'un accord).
