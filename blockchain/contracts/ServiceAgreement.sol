// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IServiceAgreement.sol";

/// @dev Ce que A utilise du contrat d'escrow (B), relie une seule fois apres le deploiement.
interface IEscrowLink {
    function isFunded(uint256 agreementId) external view returns (bool);
    function settleAgreement(uint256 agreementId) external;
}

/// @title ServiceAgreement
/// @notice Contrat A : accord de prestation entre un client et un freelance.
/// @dev Aucun arbitre humain : un litige se termine soit par la cession d'une
///      partie, soit par une regle automatique appliquee apres `DISPUTE_WINDOW`.
contract ServiceAgreement is IServiceAgreement {
    /// @notice Delai laisse aux parties pour ceder avant l'application de la regle automatique.
    uint256 public constant DISPUTE_WINDOW = 3 days;
    /// @notice Penalite de retard : 1 % du montant par jour (entame) apres l'echeance.
    uint256 public constant LATE_PENALTY_PER_DAY = 1;
    /// @notice A 100 % de penalite (100e jour de retard), l'accord ne peut plus etre livre : il est annule.
    uint256 public constant MAX_PENALTY = 100;

    /// @notice Compte qui a deploye le contrat : lui seul relie l'escrow, une seule fois.
    address public immutable deployer;
    /// @notice Contrat d'escrow (B) : le travail ne demarre qu'une fois l'accord finance,
    ///         et l'escrow est solde automatiquement quand l'accord se termine.
    IEscrowLink public escrowContract;

    /// @dev Contexte d'un litige, conserve apres sa resolution.
    struct Dispute {
        address raisedBy;
        Status openedFrom; // InProgress ou Delivered
        uint256 openedAt;
    }

    uint256 public agreementCount;
    mapping(uint256 => Agreement) private agreements;
    mapping(uint256 => Dispute) private disputes;
    /// @notice Horodatage de la livraison (0 si rien n'a ete livre).
    mapping(uint256 => uint256) public deliveredAt;

    /// @dev Preuve du livrable : hash du contenu et lien pour le consulter.
    struct Deliverable {
        bytes32 hash;
        string uri;
    }
    /// @notice Livrable soumis par le freelance (hash nul si rien n'a ete livre).
    mapping(uint256 => Deliverable) public deliverables;

    event AgreementCreated(
        uint256 indexed id,
        address indexed client,
        address indexed freelancer
    );
    event StatusChanged(uint256 indexed id, Status oldStatus, Status newStatus);
    event DeliverySubmitted(uint256 indexed id, bytes32 deliverableHash, string uri);
    /// @param byDefault true si la regle automatique a tranche, false si une partie a cede.
    event DisputeResolved(uint256 indexed id, bool favorFreelancer, bool byDefault);
    event EscrowLinked(address escrow);

    error NotClient();
    error NotFreelancer();
    error InvalidStatus(Status current);
    error AgreementNotFound();
    error InvalidParameters();
    error DeadlineNotPassed();
    error NotParty();
    /// @param endsAt Horodatage a partir duquel la regle automatique peut etre appliquee.
    error DisputeWindowOpen(uint256 endsAt);
    error NotDeployer();
    error EscrowNotFunded();
    /// @notice 100 % de penalite atteints : livrer ne sert plus a rien, l'accord doit etre annule.
    error DeliveryExpired();
    error NotExpired();

    constructor() {
        deployer = msg.sender;
    }

    /// @notice Relie le contrat d'escrow (B). B lit A, donc il est deploye apres lui.
    function setEscrowContract(address escrow) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (escrow == address(0) || address(escrowContract) != address(0)) revert InvalidParameters();
        escrowContract = IEscrowLink(escrow);
        emit EscrowLinked(escrow);
    }

    function createAgreement(
        address freelancer,
        string calldata title,
        bytes32 termsHash,
        uint256 amount,
        uint256 deadline
    ) external returns (uint256 id) {
        if (freelancer == address(0) || freelancer == msg.sender) {
            revert InvalidParameters();
        }
        if (deadline <= block.timestamp) revert InvalidParameters();

        id = ++agreementCount;
        agreements[id] = Agreement({
            id: id,
            client: msg.sender,
            freelancer: freelancer,
            title: title,
            termsHash: termsHash,
            amount: amount,
            deadline: deadline,
            status: Status.Created
        });

        emit AgreementCreated(id, msg.sender, freelancer);
    }

    function acceptAgreement(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.freelancer) revert NotFreelancer();

        _transition(id, a, Status.Created, Status.Accepted);
    }

    /// @notice Le freelance ne demarre qu'une fois le paiement bloque dans l'escrow.
    function startWork(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.freelancer) revert NotFreelancer();
        if (address(escrowContract) == address(0) || !escrowContract.isFunded(id)) revert EscrowNotFunded();

        _transition(id, a, Status.Accepted, Status.InProgress);
    }

    /// @notice Le freelance livre : il fournit un lien vers le livrable et son hash keccak256.
    /// @dev Comme `termsHash`, seul le hash prouve le contenu : le fichier reste hors chaine.
    ///      Le contrat ne juge pas la qualite ; le client valide ou ouvre un litige.
    function markDelivered(uint256 id, bytes32 deliverableHash, string calldata uri) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.freelancer) revert NotFreelancer();
        if (deliverableHash == bytes32(0) || bytes(uri).length == 0) revert InvalidParameters();
        if (_penaltyAt(a.deadline, block.timestamp) >= MAX_PENALTY) revert DeliveryExpired();

        _transition(id, a, Status.InProgress, Status.Delivered);
        deliveredAt[id] = block.timestamp;
        deliverables[id] = Deliverable({hash: deliverableHash, uri: uri});

        emit DeliverySubmitted(id, deliverableHash, uri);
    }

    /// @notice Le client valide : l'escrow paie aussitot le freelance, moins la penalite de
    ///         retard (`latePenaltyPercent`), et rend cette penalite au client.
    function approveDelivery(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.client) revert NotClient();

        _transition(id, a, Status.Delivered, Status.Completed);
        _settle(id);
    }

    /// @notice Annulation libre par le client, tant que le travail n'a pas commence.
    function cancel(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.client) revert NotClient();
        if (a.status != Status.Created && a.status != Status.Accepted) {
            revert InvalidStatus(a.status);
        }

        _transition(id, a, a.status, Status.Cancelled);
        _settle(id);
    }

    /// @notice Annulation par le client apres l'echeance, si rien n'a ete livre.
    function cancelOverdue(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.client) revert NotClient();
        if (a.status != Status.Accepted && a.status != Status.InProgress) {
            revert InvalidStatus(a.status);
        }
        if (block.timestamp <= a.deadline) revert DeadlineNotPassed();

        _transition(id, a, a.status, Status.Cancelled);
        _settle(id);
    }

    /// @notice 100 jours de retard sans livraison : la penalite atteint 100 %, l'accord est
    ///         annule et l'escrow rembourse le client. Appelable par n'importe qui.
    function cancelExpired(uint256 id) external {
        Agreement storage a = _get(id);
        if (a.status != Status.Accepted && a.status != Status.InProgress) {
            revert InvalidStatus(a.status);
        }
        if (_penaltyAt(a.deadline, block.timestamp) < MAX_PENALTY) revert NotExpired();

        _transition(id, a, a.status, Status.Cancelled);
        _settle(id);
    }

    /// @notice Le client ou le freelance contestent l'accord pendant ou apres le travail.
    function raiseDispute(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.client && msg.sender != a.freelancer) revert NotParty();
        if (a.status != Status.InProgress && a.status != Status.Delivered) {
            revert InvalidStatus(a.status);
        }

        disputes[id] = Dispute({raisedBy: msg.sender, openedFrom: a.status, openedAt: block.timestamp});
        _transition(id, a, a.status, Status.Disputed);
    }

    /// @notice Une partie cede : le client qui cede paie le freelance (Completed),
    ///         le freelance qui cede rembourse le client (Cancelled).
    function concede(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.client && msg.sender != a.freelancer) revert NotParty();

        bool favorFreelancer = msg.sender == a.client;
        _transition(id, a, Status.Disputed, favorFreelancer ? Status.Completed : Status.Cancelled);
        emit DisputeResolved(id, favorFreelancer, false);
        _settle(id);
    }

    /// @notice Regle automatique, appelable par n'importe qui une fois le delai ecoule sans cession.
    function resolveDispute(uint256 id) external {
        Agreement storage a = _get(id);
        if (a.status != Status.Disputed) revert InvalidStatus(a.status);

        uint256 endsAt = disputes[id].openedAt + DISPUTE_WINDOW;
        if (block.timestamp < endsAt) revert DisputeWindowOpen(endsAt);

        bool favorFreelancer = _freelancerWinsByDefault(id, a);
        _transition(id, a, Status.Disputed, favorFreelancer ? Status.Completed : Status.Cancelled);
        emit DisputeResolved(id, favorFreelancer, true);
        _settle(id);
    }

    /// @notice Contexte du litige et issue qu'appliquerait la regle automatique.
    function getDispute(uint256 id)
        external
        view
        returns (
            address raisedBy,
            Status openedFrom,
            uint256 openedAt,
            uint256 windowEndsAt,
            bool freelancerWinsByDefault
        )
    {
        Agreement storage a = _get(id);
        Dispute storage d = disputes[id];
        return (
            d.raisedBy,
            d.openedFrom,
            d.openedAt,
            d.openedAt == 0 ? 0 : d.openedAt + DISPUTE_WINDOW,
            d.openedAt != 0 && _freelancerWinsByDefault(id, a)
        );
    }

    function getAgreement(uint256 id) external view override returns (Agreement memory) {
        return _get(id);
    }

    /// @notice Penalite de retard (en %) retenue sur le paiement du freelance : 1 % par jour
    ///         entame entre l'echeance et la livraison. 0 si livre a temps ou rien livre.
    function latePenaltyPercent(uint256 id) external view returns (uint256) {
        Agreement storage a = _get(id);
        uint256 delivered = deliveredAt[id];
        return delivered == 0 ? 0 : _penaltyAt(a.deadline, delivered);
    }

    /// @dev Jours de retard entames a `timestamp`, a 1 % par jour, plafonnes a 100 %.
    function _penaltyAt(uint256 deadline, uint256 timestamp) internal pure returns (uint256) {
        if (timestamp <= deadline) return 0;
        uint256 daysLate = (timestamp - deadline + 1 days - 1) / 1 days;
        uint256 penalty = daysLate * LATE_PENALTY_PER_DAY;
        return penalty > MAX_PENALTY ? MAX_PENALTY : penalty;
    }

    /// @dev Accord termine (Completed ou Cancelled) : B paie ou rembourse dans la meme transaction.
    ///      Appele apres la mise a jour du statut (checks-effects-interactions).
    function _settle(uint256 id) internal {
        if (address(escrowContract) != address(0)) escrowContract.settleAgreement(id);
    }

    /// @dev Verifie le statut courant, applique le nouveau statut et emet l'evenement.
    ///      Le controle de l'appelant reste dans chaque fonction publique.
    function _transition(uint256 id, Agreement storage a, Status expected, Status next) internal {
        if (a.status != expected) revert InvalidStatus(a.status);

        a.status = next;
        emit StatusChanged(id, expected, next);
    }

    /// @dev Le freelance gagne par defaut uniquement s'il avait livre et dans les delais.
    function _freelancerWinsByDefault(uint256 id, Agreement storage a) internal view returns (bool) {
        return disputes[id].openedFrom == Status.Delivered && deliveredAt[id] <= a.deadline;
    }

    function _get(uint256 id) internal view returns (Agreement storage) {
        if (id == 0 || id > agreementCount) revert AgreementNotFound();
        return agreements[id];
    }

    
}
