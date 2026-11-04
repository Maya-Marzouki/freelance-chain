# FreeLance Chain : document de référence du binôme

Ce document résume le projet, la répartition du travail entre les deux membres du binôme, et le **contrat d'interface** qui permet de développer chacun de son côté sans se bloquer. Les points marqués **(à valider)** sont des propositions à confirmer ensemble avant de coder.

---

## 1. Le projet en bref

**FreeLance Chain** est une application blockchain qui permet à un client et à un freelance de conclure un accord de prestation. Les parties, les conditions et le statut de l'accord sont enregistrés dans un smart contract. La démonstration montre : création, acceptation et suivi de l'accord.

Critères d'évaluation : application blockchain avec un ou plusieurs smart contracts, réalisée en binôme avec des outils d'IA générative, suivie d'un échange technique sur les concepts et les choix d'implémentation.

## 2. Stack technique

| Besoin | Choix | Pourquoi |
|---|---|---|
| Smart contracts | Solidity 0.8.28 + OpenZeppelin | Standard du marché, protection native contre les overflows |
| Dev et tests | Hardhat 2 | Compilation, tests JS, déploiement, réseau local intégrés |
| Blockchain locale | Hardhat Node (chainId 31337) | Remplace Ganache, qui n'est plus maintenu |
| Frontend | Next.js + TypeScript | Demandé dans le sujet |
| Lien front et chaîne | ethers.js v6 | Simple à expliquer à l'oral |
| Wallet | MetaMask | Signature des transactions, bascule entre 2 comptes pour la démo |
| Node.js | 22 LTS (`.nvmrc`) | Même version sur macOS et Windows |

## 3. Mise en route

Tout est dans le `README.md` à la racine du dépôt. En résumé :

```bash
git clone <url-du-depot> && cd freelance-chain
nvm use                       # Node 22 (nvm-windows sur Windows)
cd blockchain && npm install && npm test
cd ../frontend && npm install
```

Chacun lance **sa propre** blockchain locale (`npm run node`) puis `npm run deploy:local`. Les deux machines ne partagent pas la même chaîne en développement.

## 4. Répartition du travail

| | Membre A | Membre B |
|---|---|---|
| **Contrat** | `ServiceAgreement` : l'accord, les parties, le statut | `EscrowMilestones` **(à valider)** : fonds bloqués, libération, remboursement |
| **Fichiers** | `contracts/ServiceAgreement.sol`, `test/ServiceAgreement.test.js` | `contracts/EscrowMilestones.sol`, `test/EscrowMilestones.test.js` |
| **Frontend** | Pages création, liste, détail d'un accord, boutons selon rôle et statut | Bloc « Paiement » dans la page détail (dépôt, libération, remboursement) |
| **Branche git** | `feature/service-agreement` | `feature/escrow` |

Alternative si l'escrow ne convient pas au membre B : un autre type d'accord (location, NDA, partenariat) avec le même cycle création / acceptation / suivi. Dans ce cas l'interface de la section 7 n'est plus nécessaire.

## 5. Contrat A : `ServiceAgreement`

**Rôle** : source de vérité sur l'accord et son statut. Il ne manipule **aucun fonds**.

### Données
`Agreement { id, client, freelancer, title, termsHash, amount, deadline, status }`. Le texte complet du contrat reste hors chaîne, seul son hash (`termsHash`, keccak256) est stocké : cela prouve l'intégrité sans payer le stockage.

### Machine à états

```
Created --accept--> Accepted --start--> InProgress --deliver--> Delivered --approve--> Completed
   |                   |                    |                       |
   +-----cancel--------+                    +------raiseDispute-----+--> Disputed --resolve--> Completed | Cancelled
```

| Fonction | Appelant | Statut requis | Résultat |
|---|---|---|---|
| `createAgreement` | client | - | Created (fait) |
| `acceptAgreement` | freelance | Created | Accepted (fait) |
| `startWork` | freelance | Accepted | InProgress |
| `markDelivered` | freelance | InProgress | Delivered |
| `approveDelivery` | client | Delivered | Completed |
| `cancel` | client | Created ou Accepted | Cancelled |
| `raiseDispute` | client ou freelance | InProgress ou Delivered | Disputed |
| `resolveDispute(id, favorFreelancer)` | arbitre | Disputed | Completed si le freelance a gain de cause, sinon Cancelled |

**(à valider)** L'arbitre est l'adresse qui déploie le contrat (`arbiter = msg.sender` dans le constructeur). Simple à défendre à l'oral ; on peut le remplacer plus tard par un vote ou un multisig.

### Événements et erreurs
Un événement `StatusChanged(id, ancien, nouveau)` à chaque transition (c'est lui qui alimente le suivi côté front). Erreurs custom (`NotClient`, `NotFreelancer`, `InvalidStatus`, `NotArbiter`...), moins coûteuses en gas que les `require` avec message.

### Tests attendus
Pour **chaque** fonction : le cas nominal, le mauvais appelant, le mauvais statut. Plus : un parcours complet de bout en bout, et le rapport `npm run coverage`.

## 6. Contrat B : `EscrowMilestones` **(à valider)**

**Rôle** : bloquer l'argent du client et le libérer selon l'état de l'accord de A. Il **lit** A mais ne modifie jamais A.

| Fonction | Appelant | Condition (lue sur A) | Effet |
|---|---|---|---|
| `deposit(agreementId)` | client | statut `Accepted`, `msg.value == amount` | Fonds bloqués dans B |
| `release(agreementId)` | n'importe qui | statut `Completed`, fonds déposés | Paiement au freelance |
| `refund(agreementId)` | n'importe qui | statut `Cancelled`, fonds déposés | Remboursement au client |

Points de sécurité à implémenter et à savoir expliquer : `ReentrancyGuard`, pattern checks-effects-interactions (mettre l'état à jour **avant** d'envoyer l'ETH), `call` plutôt que `transfer`, un seul paiement possible par accord.

Extension possible si le temps le permet : plusieurs jalons par accord (paiement partiel par étape).

## 7. Interface commune (à ne pas modifier sans prévenir)

C'est le seul point de contact entre les deux contrats. B l'importe, A s'engage à ne pas casser ce format.

```solidity
// contracts/IServiceAgreement.sol
interface IServiceAgreement {
    enum Status { Created, Accepted, InProgress, Delivered, Completed, Cancelled, Disputed }

    struct Agreement {
        uint256 id;
        address client;
        address freelancer;
        string title;
        bytes32 termsHash;
        uint256 amount;
        uint256 deadline;
        Status status;
    }

    function getAgreement(uint256 id) external view returns (Agreement memory);
}
```

Règles :
- L'**ordre des statuts** de l'enum et l'**ordre des champs** de la struct ne changent pas. Toute modification se discute avant.
- A garde `ServiceAgreement.sol` fidèle à cette interface (`contract ServiceAgreement is IServiceAgreement` est recommandé).
- Pour tester B sans attendre A, B peut écrire un `MockServiceAgreement.sol` qui renvoie un statut choisi par le test.
- Le script `blockchain/scripts/deploy.js` a une liste `CONTRACTS`. B déploie son contrat avec l'adresse de A en argument ; la modification du script se fait en petit commit séparé pour éviter les conflits.

## 8. Démarche de travail

1. **Valider ensemble** les points « à valider » (arbitre, escrow, interface) et committer ce document.
2. **Chacun sa branche**, une Pull Request vers `main`, relue par l'autre avant merge.
3. **Contrats** : écrire d'abord les tests d'une fonction, puis la fonction. Petits commits fréquents.
4. **Frontend** : seulement après que les contrats compilent et sont testés. Les ABI sont générées automatiquement dans `frontend/src/contracts/`.
5. **Intégration** : déployer A puis B en local, rejouer le scénario de démo avec 2 comptes MetaMask.
6. **Finalisation** : README à jour, schéma d'architecture, `AI_USAGE.md` complété, répétition de l'oral.

## 9. Scénario de démonstration

1. Le client crée l'accord (montant, délai, hash des conditions) : `Created`.
2. Le freelance l'accepte : `Accepted`.
3. Le client dépose les fonds dans l'escrow.
4. Le freelance démarre puis livre : `InProgress`, `Delivered`.
5. Le client valide : `Completed`. Les fonds sont libérés au freelance.
6. Cas d'échec montré : un tiers tente d'accepter l'accord et la transaction échoue. Variante : litige tranché par l'arbitre.

## 10. Usage de l'IA

Le sujet exige le recours à l'IA générative. Chacun remplit `AI_USAGE.md` : date, outil, prompt, résultat, et surtout **ce qui a été vérifié, corrigé ou refusé**. Règle commune : on ne garde aucun code qu'on ne sait pas expliquer à l'oral.

## 11. Préparer l'échange technique

Chacun doit savoir répondre, sans l'IA, sur son propre contrat **et** sur celui de l'autre :

- Pourquoi un `mapping` plutôt qu'un tableau ? Pourquoi `calldata` et `memory` ici ?
- Pourquoi stocker un hash plutôt que le texte complet ?
- Qu'est-ce qu'une attaque de réentrance ? Où serait-elle possible, et comment l'évitez-vous ?
- Que se passe-t-il si le freelance n'accepte jamais, ou si le client disparaît ?
- Quel est le coût en gas de chaque fonction ? (`REPORT_GAS=true npm test`)
- Pourquoi des erreurs custom plutôt que des `require` avec message ?
- Quelles sont les limites de votre arbitre, et comment les dépasser ?
