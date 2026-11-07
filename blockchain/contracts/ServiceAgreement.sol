// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IServiceAgreement.sol";

/// @title ServiceAgreement
/// @notice Contrat A : accord de prestation entre un client et un freelance.
/// @dev Aucun arbitre humain : un litige se termine soit par la cession d'une
///      partie, soit par une regle automatique appliquee apres `DISPUTE_WINDOW`.
contract ServiceAgreement is IServiceAgreement {
    /// @notice Delai laisse aux parties pour ceder avant l'application de la regle automatique.
    uint256 public constant DISPUTE_WINDOW = 3 days;

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

    event AgreementCreated(
        uint256 indexed id,
        address indexed client,
        address indexed freelancer
    );
    event StatusChanged(uint256 indexed id, Status oldStatus, Status newStatus);
    /// @param byDefault true si la regle automatique a tranche, false si une partie a cede.
    event DisputeResolved(uint256 indexed id, bool favorFreelancer, bool byDefault);

    error NotClient();
    error NotFreelancer();
    error InvalidStatus(Status current);
    error AgreementNotFound();
    error InvalidParameters();
    error DeadlineNotPassed();
    error NotParty();
    /// @param endsAt Horodatage a partir duquel la regle automatique peut etre appliquee.
    error DisputeWindowOpen(uint256 endsAt);

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

    function startWork(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.freelancer) revert NotFreelancer();

        _transition(id, a, Status.Accepted, Status.InProgress);
    }

    function markDelivered(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.freelancer) revert NotFreelancer();

        _transition(id, a, Status.InProgress, Status.Delivered);
        deliveredAt[id] = block.timestamp;
    }

    function approveDelivery(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.client) revert NotClient();

        _transition(id, a, Status.Delivered, Status.Completed);
    }

    /// @notice Annulation libre par le client, tant que le travail n'a pas commence.
    function cancel(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.client) revert NotClient();
        if (a.status != Status.Created && a.status != Status.Accepted) {
            revert InvalidStatus(a.status);
        }

        _transition(id, a, a.status, Status.Cancelled);
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
