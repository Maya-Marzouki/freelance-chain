# FreeLance Chain

Application blockchain de contrats numeriques entre un freelance et un client : les parties, les conditions
(sous forme de hash) et le statut de l'accord sont enregistres dans un smart contract.

Projet en binome : chaque membre developpe un smart contract (voir `docs/ARCHITECTURE.md`).

## Structure

```
blockchain/   Hardhat : contrats Solidity, tests, script de deploiement
frontend/     Next.js + TypeScript + ethers.js
docs/         Architecture et schemas
AI_USAGE.md   Journal d'utilisation de l'IA generative
```

## Prerequis

- Node.js 22 LTS (`nvm use`, voir `.nvmrc`) ; Node >= 20 minimum
- MetaMask (extension navigateur)
- Git

## Demarrage

```bash
# 1. Blockchain
cd blockchain
npm install
npm test                 # compile et lance les tests
npm run node             # terminal 1 : blockchain locale (127.0.0.1:8545, chainId 31337)
npm run deploy:local     # terminal 2 : deploie et ecrit adresses + ABI dans frontend/src/contracts/

# 2. Frontend
cd ../frontend
npm install
npm run dev              # http://localhost:3000
```

### MetaMask

1. Ajouter le reseau : RPC `http://127.0.0.1:8545`, chain ID `31337`, symbole `ETH`.
2. Importer 2 comptes de test affiches par `npm run node` (cle privee de test uniquement, jamais une vraie cle).
3. Utiliser un compte pour le client, l'autre pour le freelance. Il n'y a pas d'arbitre : les litiges suivent des regles du contrat.
4. Pour la demonstration du delai de litige (3 jours), `npm run time:skip -- 3` avance l'horloge du noeud local.

> Les adresses des contrats sont deterministes : sur un noeud neuf, `npm run deploy:local` deploie `ServiceAgreement` puis `EscrowMilestones`
> aux adresses deja presentes dans `frontend/src/contracts/*.json`. Ne lancez le deploiement qu'une seule fois par noeud neuf,
> sinon les adresses changent et le fichier JSON est reecrit.
>
> Apres chaque redemarrage de `npm run node`, relancer `npm run deploy:local` et reinitialiser les comptes MetaMask
> (Parametres > Avance > Effacer les donnees d'activite) pour eviter les erreurs de nonce.

## Workflow Git (binome)

- Une branche par fonctionnalite (`feature/service-agreement`, `feature/escrow`), merge via Pull Request.
- Ne jamais commiter `.env`, cles privees ou `node_modules`.
- Commiter `package-lock.json` pour avoir les memes versions sur macOS et Windows.
- Le fichier `frontend/src/contracts/*.json` est regenere par le script de deploiement : l'adresse committee est un
  placeholder, chacun deploie localement.
