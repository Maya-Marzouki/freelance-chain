# frontend

Next.js (App Router) + TypeScript + Tailwind CSS v4 + ethers v6. Voir le README racine pour le demarrage.

```bash
npm run dev     # http://localhost:3000
npm run build
```

## Mode demo

Tant que `src/contracts/ServiceAgreement.json` contient l'adresse `0x000…000`, l'application tourne en
mode demo : les accords, jalons et transactions viennent de `src/lib/mock-data.ts` et sont simules en
memoire (perdus au rechargement complet). Les hash de transaction sont marques **Simulated**.

## Structure

- `src/app/page.tsx` : landing page.
- `src/app/(app)/` : pages du tableau de bord (`dashboard`, `agreements`, `agreements/create`,
  `agreements/[id]`, `escrow`, `activity`, `settings`) partageant la sidebar et la topbar.
- `src/components/` : `ui/` (primitives), `layout/`, `wallet/`, `agreements/`, `escrow/`, `activity/`,
  `dashboard/`, `settings/`, `providers/`.
- `src/lib/ethereum.ts` : acces MetaMask / ethers (reseau Hardhat 31337, contrat, appels prepares
  `createAgreementOnChain`, `acceptAgreementOnChain`).
- `src/lib/lifecycle.ts` : regles de transition et permissions par role (source unique de verite).
- `src/components/providers/app-store.tsx` : store demo ; c'est ici que les appels mock seront
  remplaces par les appels de `lib/ethereum.ts`.
- `src/contracts/*.json` : adresse + ABI, generes par `blockchain/scripts/deploy.js`.
- `src/lib/contract.ts` : point d'entree conserve pour compatibilite (re-exporte `lib/ethereum.ts`).
