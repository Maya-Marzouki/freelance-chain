# Explication des contrats, fonction par fonction

Ce document explique les **trois contrats** du projet (`blockchain/contracts/`) et l'interface qui les relie. Les numéros de ligne renvoient aux fichiers `.sol` tels qu'ils sont à la date de rédaction : s'ils bougent, les noms de fonctions restent la référence.

| Contrat | Fichier | Rôle en une phrase | Manipule de l'argent ? |
|---|---|---|---|
| **A** `ServiceAgreement` | `ServiceAgreement.sol` | Source de vérité : l'accord, les parties, le statut, les litiges | Non |
| **B** `EscrowMilestones` | `EscrowMilestones.sol` | Bloque l'ETH du client et le libère par jalons | Oui (ETH) |
| **C** `ReputationToken` | `ReputationToken.sol` | Récompense en token FLR (non transférable) à la fin d'une mission payée | Non (il crée des FLR) |
| Interface | `IServiceAgreement.sol` | Le seul point de contact entre A et B/C | - |

```
        lit                    lit
  B ───────────►  A  ◄───────────  C
  (argent)     (vérité)       (réputation)
        C lit aussi B (l'escrow doit être Completed)
```

**Principe d'architecture.** A ne connaît ni B ni C. B et C **lisent** A (`getAgreement`) et ne le modifient jamais. Chaque contrat a une seule responsabilité, ce qui permet de les tester et de les expliquer séparément.

---

## 0. L'interface `IServiceAgreement.sol` (18 lignes)

| Lignes | Explication |
|---|---|
| 1-2 | Licence MIT et version du compilateur (`^0.8.28` : protection native contre les dépassements d'entiers). |
| 5 | `enum Status` : les 7 statuts d'un accord. **L'ordre est figé** : B et C lisent le statut sous forme de numéro (0 = Created ... 6 = Disputed). Changer l'ordre casserait B, C et le front. |
| 7-16 | `struct Agreement` : id, client, freelance, titre, `termsHash` (hash keccak256 des conditions, le texte reste hors chaîne), montant, échéance, statut. L'ordre des champs est aussi figé (il détermine le format de lecture). |
| 18 | `getAgreement(id)` : la seule fonction que B et C utilisent. |

---

## 1. Contrat A : `ServiceAgreement.sol`

### 1.1 Machine à états

```
Created ──accept──► Accepted ──start──► InProgress ──deliver──► Delivered ──approve──► Completed
   │                   │                    │                       │
   └────── cancel ─────┘                    │                       │
                       └─ cancelOverdue ────┘                       │
                                            └──── raiseDispute ─────┴──► Disputed ──concede / resolveDispute──► Completed | Cancelled
```

### 1.2 Déclarations (lignes 1-53)

| Lignes | Explication |
|---|---|
| 4 | Importe l'interface. |
| 10 | `contract ServiceAgreement is IServiceAgreement` : le contrat **s'engage** à respecter l'interface (le compilateur le vérifie). |
| 12 | `DISPUTE_WINDOW = 3 days` : délai laissé aux parties pour céder avant la règle automatique. `constant` : valeur fixée à la compilation, pas de stockage, pas de gas à la lecture. |
| 15-19 | `struct Dispute` : qui a ouvert le litige, depuis quel statut (`InProgress` ou `Delivered`), à quelle date. Sert à appliquer la règle automatique. |
| 21 | `agreementCount` : compteur d'accords. Sert aussi à générer les identifiants (1, 2, 3...). |
| 22 | `agreements` : `mapping(id => Agreement)`, `private`. Un **mapping** plutôt qu'un tableau : accès direct par id en coût constant, pas de boucle. `private` car on expose via `getAgreement`. |
| 23 | `disputes` : le contexte de chaque litige, conservé même après sa résolution. |
| 25 | `deliveredAt` : date de livraison (0 si jamais livré). `public` : Solidity génère automatiquement le getter, que le contrat C utilisera. |
| 28-31, 33 | `struct Deliverable` + mapping `deliverables` : la **preuve du livrable** (hash du contenu + lien). Le fichier reste hors chaîne, seul son hash prouve son contenu. |
| 35-43 | **Événements** : `AgreementCreated`, `StatusChanged` (émis à chaque transition, c'est lui qui alimente l'historique du front), `DeliverySubmitted`, `DisputeResolved` (`byDefault` distingue cession volontaire et règle automatique). `indexed` permet de filtrer les logs par id ou adresse. |
| 45-53 | **Erreurs custom** (`NotClient`, `NotFreelancer`, `InvalidStatus(current)`, ...). Moins coûteuses en gas que `require("texte")` et peuvent transporter des données (ex. `DisputeWindowOpen(endsAt)` dit quand le délai se termine). |

### 1.3 Fonctions publiques

#### `createAgreement` (lignes 55-80)
**Qui :** n'importe qui (devient le client). **Effet :** crée l'accord au statut `Created`.

| Lignes | Explication |
|---|---|
| 56-60 | Paramètres : freelance, titre, `termsHash`, montant, échéance (timestamp Unix). `calldata` pour le titre : lecture seule, moins cher que `memory` pour un argument externe. |
| 62-64 | Refuse l'adresse nulle et le cas où le client se désigne lui-même comme freelance. |
| 65 | L'échéance doit être dans le futur (`block.timestamp` = heure du bloc, **pas** l'heure de votre ordinateur). |
| 67 | `id = ++agreementCount` : incrémente puis utilise la nouvelle valeur (les ids commencent à 1, 0 reste « inexistant »). |
| 68-77 | Écrit l'accord ; `client = msg.sender` : le client est celui qui signe la transaction, il ne peut pas être usurpé. |
| 79 | Émet `AgreementCreated`. |

#### `acceptAgreement` (82-87) et `startWork` (89-94)
**Qui :** le freelance. **Effet :** `Created → Accepted`, puis `Accepted → InProgress`.
- Ligne 83/90 : `_get(id)` charge l'accord (et échoue s'il n'existe pas).
- Ligne 84/91 : seul le freelance de **cet** accord peut appeler (`NotFreelancer`).
- Ligne 86/93 : `_transition` vérifie le statut attendu puis change le statut.

#### `markDelivered` (99-109)
**Qui :** le freelance. **Effet :** `InProgress → Delivered`, avec la preuve du livrable.

| Lignes | Explication |
|---|---|
| 101 | Seul le freelance. |
| 102 | Le hash ne doit pas être nul et le lien ne doit pas être vide. |
| 104 | Transition `InProgress → Delivered`. |
| 105 | Enregistre l'**heure de livraison**. C'est elle qui décide plus tard si la livraison est « dans les délais » (litige, token). |
| 106 | Enregistre hash + lien. |
| 108 | Émet `DeliverySubmitted`. |

Le contrat **ne juge pas la qualité** du livrable : c'est le client qui valide ou ouvre un litige.

#### `approveDelivery` (111-116)
**Qui :** le client. **Effet :** `Delivered → Completed`. L'accord est terminé ; l'argent est ensuite libéré côté B.

#### `cancel` (118-127)
**Qui :** le client. **Quand :** `Created` ou `Accepted` (le travail n'a pas commencé). Ligne 122 : refuse tout autre statut. Ligne 126 : `_transition(id, a, a.status, Cancelled)` utilise le statut **courant** comme statut attendu, ce qui est valable puisqu'on vient de le contrôler.

#### `cancelOverdue` (129-139)
**Qui :** le client. **Quand :** `Accepted` ou `InProgress` **et** l'échéance est dépassée (ligne 136, sinon `DeadlineNotPassed`). Protège le client d'un freelance qui disparaît : sans livraison après l'échéance, il peut annuler et récupérer ses fonds (via `settle` côté B).

#### `raiseDispute` (141-151)
**Qui :** le client ou le freelance (`NotParty` sinon, ligne 144). **Quand :** `InProgress` ou `Delivered`.
- Ligne 149 : enregistre le contexte (qui, depuis quel statut, à quelle date). **Ce contexte est essentiel** : la règle automatique en dépend.
- Ligne 150 : passe à `Disputed`.

#### `concede` (153-162)
**Qui :** client ou freelance, sur un accord `Disputed`.
- Ligne 159 : `favorFreelancer = msg.sender == a.client`. **Le client qui cède paie le freelance** (`Completed`) ; **le freelance qui cède rembourse le client** (`Cancelled`).
- Ligne 160 : la transition exige le statut `Disputed` (sinon `InvalidStatus`).
- Ligne 161 : émet `DisputeResolved(..., byDefault=false)`.

#### `resolveDispute` (164-175)
**Qui :** **n'importe qui**, après le délai. C'est ce qui remplace l'arbitre humain.
- Ligne 167 : l'accord doit être `Disputed`.
- Lignes 169-170 : le délai de 3 jours doit être écoulé, sinon `DisputeWindowOpen(endsAt)`.
- Ligne 172 : applique la règle `_freelancerWinsByDefault`.
- Ligne 173 : `Completed` (freelance gagne) ou `Cancelled` (client remboursé).
- Ligne 174 : émet `DisputeResolved(..., byDefault=true)`.

#### `getDispute` (177-198) et `getAgreement` (200-202)
Lectures gratuites (`view`). `getDispute` renvoie aussi la date de fin du délai et **l'issue que donnerait la règle automatique** (ligne 196), pour que le front l'affiche. `getAgreement` implémente l'interface (`override`).

### 1.4 Fonctions internes

| Fonction (lignes) | Explication |
|---|---|
| `_transition` (206-211) | Cœur de la machine à états : vérifie que le statut actuel est celui attendu, applique le nouveau, émet `StatusChanged`. Une seule fonction pour toutes les transitions = un seul endroit à auditer. Le contrôle de **l'appelant** reste dans chaque fonction publique. |
| `_freelancerWinsByDefault` (214-216) | **La règle de litige** : le freelance gagne **uniquement** si le litige a été ouvert depuis `Delivered` **et** que la livraison date d'avant l'échéance. Sinon le client est remboursé. |
| `_get` (218-221) | Retourne l'accord ou revert `AgreementNotFound` (id 0 ou trop grand). `storage` : référence sur le stockage, on modifie l'original sans copie. |

### 1.5 Limites à savoir expliquer à l'oral
- La règle automatique **ne juge pas la qualité** : un freelance qui livre n'importe quoi à temps gagne par défaut si le client n'a pas cédé. Le client doit contester **dans** le délai ou valider.
- Pendant les 3 jours, rien ne force les parties à agir : si personne n'appelle `resolveDispute`, l'accord reste `Disputed` (mais n'importe qui peut l'appeler ensuite).
- L'heure vient du bloc : en local, `DAYS=3 npm run time:skip` avance l'horloge pour la démonstration.

---

## 2. Contrat B : `EscrowMilestones.sol`

**Idée :** le client dépose le montant total de l'accord ; l'argent est libéré **jalon par jalon** à la demande du client, ou en bloc selon l'issue de l'accord (`settle`).

### 2.1 Déclarations (lignes 1-129)

| Lignes | Explication |
|---|---|
| 5 | Importe `ReentrancyGuard` d'OpenZeppelin (protection contre la **réentrance**). |
| 13 | `contract EscrowMilestones is ReentrancyGuard`. |
| 15-21 | `EscrowStatus` : `Created` (créé, pas financé), `Funded` (fonds bloqués), `InProgress` (au moins un jalon soumis), `Completed` (tout payé), `Cancelled` (client remboursé). |
| 23-28 | `MilestoneStatus` : `Pending → Submitted → Approved → Released`. |
| 30-38 | `struct Milestone` : titre, description, montant, échéance, statut, lien du livrable (vide avant soumission). |
| 40-50 | `struct Escrow` : lie l'escrow à un accord (`agreementId`), client et freelance (`address payable` : peuvent recevoir de l'ETH), montant total, montant déposé, montant libéré, statut, nombre de jalons. |
| 52 | `agreements` : adresse du contrat A. `immutable` : fixée une fois au déploiement, non modifiable, moins chère à lire. |
| 54 | `nextEscrowId` : compteur d'escrows (commence à 1). |
| 56 | `escrows` : mapping `id => Escrow`. |
| 58-59 | `milestones` : mapping **imbriqué** `escrowId => milestoneId => Milestone`. |
| 62 | `escrowOfAgreement` : l'escrow d'un accord (0 si aucun). Garantit **un seul escrow par accord**. C est aussi lui qui l'utilise. |
| 64-67 | **Constructeur** : reçoit l'adresse de A, refuse l'adresse nulle. |
| 69-105 | Événements (création, dépôt, soumission, approbation, paiement, règlement). Servent de journal pour le front. |
| 107-121 | Modifiers `onlyClient` et `onlyFreelancer` : comparent l'appelant aux adresses **enregistrées dans l'escrow** (copiées de l'accord). |
| 123-129 | `escrowExists` : l'escrow doit exister (client non nul). |

### 2.2 Fonctions

#### `createEscrow` (131-209)
**Qui :** le client de l'accord. **Effet :** crée l'escrow et ses jalons (aucun ETH à ce stade).

| Lignes | Explication |
|---|---|
| 140-141 | Lit l'accord dans A : **les parties et le montant ne sont jamais ressaisis**, donc pas d'incohérence possible. |
| 143 | Seul le client de l'accord. |
| 145-150 | L'accord doit être ouvert (`Created`, `Accepted` ou `InProgress`). |
| 152-155 | Un seul escrow par accord. |
| 157-163 | Les 4 tableaux (montants, titres, descriptions, échéances) doivent avoir la même taille, non vide. |
| 165-171 | Boucle : chaque montant > 0, chaque échéance dans le futur, on additionne. |
| 173 | **La somme des jalons doit être égale au montant de l'accord.** |
| 175-187 | Crée l'escrow et mémorise `escrowOfAgreement`. |
| 189-198 | Crée chaque jalon à `Pending`. |
| 200-208 | Événement et retour de l'id. |

#### `deposit` (211-242)
**Qui :** le client. `payable` : la transaction **transporte de l'ETH**.
- 219-222 : l'escrow doit être `Created` (on ne dépose qu'une fois).
- 224-227 : `msg.value` doit être **exactement** le total (pas de dépôt partiel).
- 229-236 : l'accord doit être déjà `Accepted`, `InProgress` ou `Delivered` : **on ne bloque l'argent qu'une fois le freelance engagé**.
- 238-239 : enregistre le dépôt, passe à `Funded`. L'ETH reste dans le contrat.

#### `submitMilestone` (246-286)
**Qui :** le freelance. **Effet :** `Pending → Submitted` avec le lien du livrable.
- 251 : le lien est obligatoire.
- 255-259 : l'escrow doit être financé.
- 261 : `_requireAgreementActive` : **jalons gelés** si l'accord est en litige ou annulé.
- 263-274 : jalon valide et encore `Pending`.
- 276-279 : l'échéance du jalon ne doit pas être dépassée.
- 281-283 : met à jour le jalon et passe l'escrow à `InProgress`.

#### `approveMilestone` (288-319)
**Qui :** le client. `Submitted → Approved`. Mêmes contrôles d'escrow, accord actif, jalon valide (295-314). C'est un acte **volontaire** du client : il a vu le livrable.

#### `releasePayment` (321-367)
**Qui :** le client. `Approved → Released` et **paiement du freelance**. Fonction la plus sensible, donc `nonReentrant` (ligne 323).

| Lignes | Explication |
|---|---|
| 329-335 | Escrow disponible, accord non gelé. |
| 345-348 | Le jalon doit être `Approved`. |
| 350-353 | **Effets d'abord** : le jalon passe à `Released` et `releasedAmount` augmente **avant** tout envoi d'argent. |
| 355-357 | Si tout est libéré, l'escrow passe `Completed`. |
| 359 | **Interaction en dernier** : envoi de l'ETH au freelance. |

C'est le pattern **checks-effects-interactions** : vérifier, modifier l'état, puis seulement envoyer. Avec `nonReentrant`, une attaque par réentrance est impossible.

#### `settle` (369-416)
**Qui :** **n'importe qui**. Solde ce qui reste selon l'issue de l'accord dans A.
- 378-383 : l'escrow ne doit pas être déjà soldé.
- 385-391 : l'accord doit être **terminé** (`Completed` ou `Cancelled`).
- 393-397 : `freelancerPaid` (accord Completed) ; `remaining = déposé - libéré`.
- 399-401 : statut de l'escrow mis à jour **avant** le transfert.
- 403-405 : si le freelance est payé, `releasedAmount` inclut le reste.
- 407-413 : transfère le reste **au freelance** (accord Completed) **ou au client** (Cancelled).
- 415 : événement.

C'est ce qui permet : annulation, annulation après échéance, litige gagné par le client = **remboursement** ; accord Completed = **paiement du reste**. Aucune confiance en personne : l'issue vient de A.

#### Lectures (418-439) et internes (441-458)
`getMilestone`, `getEscrow` : lectures. `_agreementStatus` lit le statut dans A. `_requireAgreementActive` bloque toute action sur les jalons quand A est `Disputed` ou `Cancelled`.

### 2.3 Points de sécurité
- **Réentrance :** `ReentrancyGuard` + effets avant interactions (`releasePayment`, `settle`).
- **Montant exact** au dépôt, **somme des jalons = montant de l'accord**.
- **Pas d'arbitre, pas de clé admin** : aucune fonction ne permet à un tiers de déplacer les fonds.
- **Point à connaître :** les envois utilisent `transfer` (lignes 359, 409, 411), qui limite le gas à 2300. C'est suffisant pour un portefeuille MetaMask, mais échouerait vers un contrat qui consomme plus. Le brief du binôme recommandait `call` ; c'est une amélioration possible à discuter.

---

## 3. Contrat C : `ReputationToken.sol`

**Idée :** à la fin d'une mission **réellement payée**, client et freelance reçoivent des FLR. Ce token est **non transférable** (« soulbound ») : la réputation ne s'achète ni ne se vend. Le paiement reste en ETH ; le token n'est pas une monnaie.

### 3.1 Déclarations (lignes 1-61)

| Lignes | Explication |
|---|---|
| 4 | Importe `ERC20` d'OpenZeppelin : implémentation standard et auditée du token. |
| 10-12 | Mini-interface locale `IDeliveryTimes` pour lire `deliveredAt` de A **sans modifier l'interface commune**. |
| 24 | `contract ReputationToken is ERC20` : nom « FreeLance Reputation », symbole `FLR` (ligne 55). |
| 26 | `FREELANCER_RATE = 100` : 1 ETH payé = 100 FLR au freelance. |
| 28 | `CLIENT_RATE = 20` : 1 ETH payé = 20 FLR au client. |
| 30 | `LATE_REWARD_PERCENT = 50` : le freelance garde 50 % de sa récompense s'il n'a pas livré à temps. |
| 32-33 | Adresses de A et B, `immutable`. |
| 36 | `rewardClaimed` : empêche de récompenser deux fois le même accord. |
| 38 | `missionsCompleted` : compteur de missions par adresse (réputation lisible). |
| 40-47 | Événement `ReputationRewarded`. |
| 49-52 | Erreurs : `TransferDisabled`, `AgreementNotCompleted`, `EscrowNotCompleted`, `AlreadyClaimed`. |
| 54-61 | Constructeur : reçoit A et B, refuse les adresses nulles. |

### 3.2 Fonctions

#### `claimReward` (65-91)
**Qui :** n'importe qui (les bénéficiaires et montants viennent de A et B, personne ne peut les choisir).

| Lignes | Explication |
|---|---|
| 66 | Déjà récompensé : stop. |
| 68-69 | **Condition 1 :** l'accord doit être `Completed` dans A. |
| 71-74 | **Condition 2 :** l'accord doit avoir un escrow, et cet escrow doit être `Completed` dans B, c'est-à-dire que **le freelance a été payé en totalité**. Pas d'argent versé = pas de réputation. |
| 76-79 | **Effets avant interactions :** marque l'accord récompensé et incrémente les compteurs **avant** de créer les tokens. |
| 82 | Livré dans les délais ? |
| 83 | Récompense du freelance = ETH libérés (en wei) x 100. Comme 1 ETH = 10^18 wei et que le token a 18 décimales, 1 ETH payé donne bien 100 FLR. |
| 84 | Si pas à temps : réduite à 50 %. |
| 85 | Récompense du client = ETH payés x 20 (toujours complète : il a payé). |
| 87-88 | `_mint` : crée les tokens pour les deux parties. |
| 90 | Événement. |

#### `isDeliveredOnTime` (95-98)
Lit `deliveredAt` dans A. Vrai si la livraison existe **et** date d'avant l'échéance. Un accord terminé sans livraison (par exemple le client cède pendant le travail) compte comme **en retard**.

#### `_update` (101-104) et `approve` (107-109)
- `_update` est le point de passage de **tout** mouvement de tokens dans ERC-20 (frappe, transfert, destruction). Ligne 102 : si `from` n'est pas l'adresse nulle (donc ce n'est pas une frappe), **revert** : ni transfert, ni destruction.
- `approve` est bloqué aussi : sans transfert possible, autoriser un tiers à dépenser n'a pas de sens.

### 3.3 Exemple chiffré
Accord de 3 ETH, payé en totalité, livré à temps : freelance **300 FLR**, client **60 FLR**. Livré en retard : freelance **150 FLR**, client **60 FLR**.

---

## 4. Scénarios de bout en bout

| Scénario | Séquence | Résultat financier |
|---|---|---|
| **Nominal** | `createAgreement` → `acceptAgreement` → `createEscrow` → `deposit` → `startWork` → `submitMilestone` / `approveMilestone` / `releasePayment` (par jalon) → `markDelivered` → `approveDelivery` → `claimReward` | Freelance payé jalon par jalon, FLR distribués |
| **Annulation par le client** | `cancel` (Created/Accepted) → `settle` | Client remboursé |
| **Annulation après échéance** | échéance dépassée → `cancelOverdue` → `settle` | Client remboursé |
| **Litige, cession** | `raiseDispute` → `concede` → `settle` | Client qui cède : freelance payé. Freelance qui cède : client remboursé |
| **Litige, règle automatique** | `raiseDispute` → 3 jours → `resolveDispute` → `settle` | Freelance payé seulement s'il avait livré à temps, sinon client remboursé |

## 5. Questions d'oral probables

1. **Pourquoi trois contrats ?** Séparation des responsabilités : l'accord (vérité), l'argent (risque), la réputation (incitation). On teste et on audite chacun séparément, et seul B détient des fonds.
2. **Pourquoi un `mapping` plutôt qu'un tableau ?** Accès direct par id, pas de parcours, coût constant.
3. **Pourquoi un hash des conditions et pas le texte ?** Le stockage on-chain est coûteux ; le hash prouve que le texte n'a pas changé sans le publier.
4. **Qu'est-ce que la réentrance et où l'évitez-vous ?** Un contrat appelé pendant un envoi d'ETH qui rappelle la fonction avant la mise à jour de l'état. Évitée par `nonReentrant` et par l'ordre effets puis interactions dans `releasePayment` et `settle`.
5. **Comment remplacer l'arbitre humain ?** Par des règles vérifiables : cession volontaire, ou règle automatique après 3 jours fondée sur la date de livraison et l'échéance.
6. **Quelle limite ?** La règle ne juge pas la qualité du travail, seulement le respect de l'échéance.
7. **Pourquoi des erreurs custom ?** Moins de gas, et elles peuvent porter des données.
8. **Pourquoi le token est non transférable ?** Pour que la réputation reflète des missions réelles et ne soit pas achetable.
9. **Que se passe-t-il si le freelance ne répond jamais ?** Le client annule (`cancel`, ou `cancelOverdue` après l'échéance) puis `settle` le rembourse.
10. **Pourquoi `block.timestamp` et pas l'heure réelle ?** Le contrat ne connaît que l'heure du bloc ; en local on l'avance avec `time:skip`.
