# blockchain

```bash
npm install
npm test
npm run coverage
REPORT_GAS=true npm test
```

Pour ajouter un contrat : le placer dans `contracts/`, ecrire `test/<Nom>.test.js`, puis l'ajouter a la liste
`CONTRACTS` de `scripts/deploy.js`.
