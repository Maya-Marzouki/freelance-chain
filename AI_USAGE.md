# Usage de l'IA generative

Journal de bord des usages de l'IA (Claude, etc.) dans ce projet, demande par le sujet.
Chaque membre du binome remplit ses entrees. Regle : **on ne garde aucun code que l'on ne sait pas expliquer a l'oral.**

## Entrees

| Date | Auteur | Outil | Objectif | Prompt (resume) | Resultat de l'IA | Ce que j'ai verifie / corrige / refuse |
|------|--------|-------|----------|-----------------|------------------|----------------------------------------|
| 2026-11-04 | Mohamed | Claude | Choix des technologies et plan | Comparer Hardhat/Next.js vs Ganache, plan du projet | Recommandation Hardhat + Next.js + ethers + MetaMask ; Ganache est obsolete | Verifie que Ganache n'est plus maintenu ; choix valides par le binome |
| 2026-11-04 | Mohamed | Claude | Socle du projet | Creer l'arborescence Hardhat + Next.js | Squelette `ServiceAgreement` (create + accept), tests, script de deploiement | A relire ligne par ligne avant d'etendre le contrat |
| 2026-11-04 | Mohamed | Claude | Repartition et contrat d'interface avec le binome | Repartir le travail A/B, definir ce qui est commun | `docs/BRIEF_BINOME.md` : contrat A (etat, sans fonds), contrat B (escrow qui lit A), interface `IServiceAgreement` | Points "a valider" a confirmer avec le binome (arbitre, escrow, interface) |
| 2026-11-04 | Mohamed | Claude | Erreur `npm test` (ENOENT package.json) | Coller l'erreur du terminal | Cause : commande lancee hors du dossier `blockchain/` ; ajout d'un `package.json` racine avec des raccourcis | Compris que npm cherche le `package.json` du dossier courant ; `npm test` relance depuis la racine : OK |
| 2026-11-04 | Mohamed | Claude | Etapes 1 et 2 du contrat A : interface et arbitre | Demander la demarche etape par etape (code non fourni en entier) | Instructions : creer `IServiceAgreement.sol` (enum + struct + `getAgreement`), heriter dans `ServiceAgreement`, ajouter `arbiter`, constructeur et erreur `NotArbiter`, plus un test | Code ecrit par moi-meme dans le projet ; enum et struct retires du contrat (heritage) ; `npm test` : 6 tests passent, dont celui de l'arbitre ; nettoyage de style fait (ordre variables / evenements / erreurs / constructeur). Concepts compris et pouvant etre expliques a l'oral : interface et heritage de l'enum et de la struct, `override`, constructeur et arbitre |
| 2026-11-04 | Mohamed | Claude | Etape 3 : fonction `startWork` | Demander la demarche test d'abord, puis l'ecriture de la fonction | Demarche avec 3 tests (nominal, mauvais appelant, mauvais statut) ; la fonction `startWork` a ete ecrite par Claude a ma demande en calquant `acceptAgreement` | Tests ecrits par moi ; `npm test` : 9 tests passent. Je n'ai pas vu l'etape "rouge" (tests en echec) avant la fonction, car les tests existaient deja |
| 2026-11-04 | Mohamed | Claude | Etape 4 : `markDelivered`, `approveDelivery`, erreur `NotClient`, factorisation `_transition` | Demander la demarche (tests puis fonctions puis refactoring), puis demander a Claude d'ecrire les fonctions et le refactoring | Les 2 fonctions et `NotClient` ; fonction interne `_transition(id, a, expected, next)` qui verifie le statut, l'applique et emet l'evenement ; refactoring fait fonction par fonction | Tests (3 par fonction + parcours complet) ecrits par moi avant ; `npm test` : 16 tests passent apres chaque refactoring et les tests n'ont pas ete modifies. Gas avant/apres : chaque transition coute environ 73 gas de plus (appel interne), mais le deploiement passe de 719 485 a 661 572 gas |

## Bilan (a completer avant la soutenance)

- Ou l'IA nous a fait gagner du temps :
- Ou elle s'est trompee et comment on l'a detecte :
- Ce qu'on a ecrit ou decide nous-memes :
