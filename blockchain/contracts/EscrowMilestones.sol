
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IServiceAgreement.sol";

/// @dev Penalite de retard calculee par A a partir de la date de livraison.
interface ILatePenalty {
    function latePenaltyPercent(uint256 id) external view returns (uint256);
}

/// @title EscrowMilestones
/// @notice Contrat B : fonds bloques par jalons pour un accord du contrat A.
/// @dev Aucun arbitre : l'accord (A) est la source de verite. Les jalons sont geles
///      pendant un litige, puis `settle` paie le freelance si A est Completed et
///      rembourse le client si A est Cancelled.
contract EscrowMilestones is ReentrancyGuard {

    enum EscrowStatus {
        Created,
        Funded,
        InProgress,
        Completed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved,
        Released
    }

    struct Milestone {
        string title;
        string description;
        uint256 amount;
        uint256 deadline;
        MilestoneStatus status;
        /// @dev Lien vers le livrable du jalon, fourni a la soumission (vide avant).
        string deliverableUri;
    }

    struct Escrow {
        uint256 id;
        uint256 agreementId;
        address payable client;
        address payable freelancer;
        uint256 totalAmount;
        uint256 depositedAmount;
        uint256 releasedAmount;
        EscrowStatus status;
        uint256 milestoneCount;
    }

    IServiceAgreement public immutable agreements;

    uint256 private nextEscrowId = 1;

    mapping(uint256 => Escrow) public escrows;

    mapping(uint256 => mapping(uint256 => Milestone))
        public milestones;

    /// @notice Escrow d'un accord (0 si aucun) : un seul escrow par accord.
    mapping(uint256 => uint256) public escrowOfAgreement;

    constructor(IServiceAgreement agreementContract) {
        require(address(agreementContract) != address(0), "Invalid agreement contract");
        agreements = agreementContract;
    }

    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed agreementId,
        address client,
        address freelancer,
        uint256 totalAmount
    );

    event FundsDeposited(
        uint256 indexed escrowId,
        uint256 amount
    );

    event MilestoneSubmitted(
        uint256 indexed escrowId,
        uint256 milestoneId,
        string deliverableUri
    );

    event MilestoneApproved(
        uint256 indexed escrowId,
        uint256 milestoneId
    );

    event PaymentReleased(
        uint256 indexed escrowId,
        uint256 milestoneId,
        address freelancer,
        uint256 amount
    );

    /// @param freelancerPaid true si l'accord est Completed, false s'il est Cancelled.
    /// @param toFreelancer Montant verse au freelance (reste moins la penalite de retard).
    /// @param toClient Montant rendu au client (remboursement, ou penalite de retard).
    event EscrowSettled(
        uint256 indexed escrowId,
        bool freelancerPaid,
        uint256 toFreelancer,
        uint256 toClient
    );

    modifier onlyClient(uint256 escrowId) {
        require(
            msg.sender == escrows[escrowId].client,
            "Only client"
        );
        _;
    }

    modifier onlyFreelancer(uint256 escrowId) {
        require(
            msg.sender == escrows[escrowId].freelancer,
            "Only freelancer"
        );
        _;
    }

    modifier escrowExists(uint256 escrowId) {
        require(
            escrows[escrowId].client != address(0),
            "Escrow does not exist"
        );
        _;
    }

    function createEscrow(
        uint256 agreementId,
        uint256[] calldata amounts,
        string[] calldata titles,
        string[] calldata descriptions,
        uint256[] calldata deadlines
    ) external returns (uint256) {

        // Les parties et le montant viennent de l'accord : rien n'est saisi deux fois.
        IServiceAgreement.Agreement memory agreement =
            agreements.getAgreement(agreementId);

        require(msg.sender == agreement.client, "Only client");

        require(
            agreement.status == IServiceAgreement.Status.Created ||
            agreement.status == IServiceAgreement.Status.Accepted ||
            agreement.status == IServiceAgreement.Status.InProgress,
            "Agreement not open"
        );

        require(
            escrowOfAgreement[agreementId] == 0,
            "Escrow already exists"
        );

        require(
            amounts.length > 0 &&
            amounts.length == titles.length &&
            amounts.length == descriptions.length &&
            amounts.length == deadlines.length,
            "Invalid milestones"
        );

        uint256 total;

        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Invalid amount");
            require(deadlines[i] > block.timestamp, "Invalid deadline");
            total += amounts[i];
        }

        require(total == agreement.amount, "Total must match agreement");

        uint256 escrowId = nextEscrowId++;

        Escrow storage escrow = escrows[escrowId];

        escrow.id = escrowId;
        escrow.agreementId = agreementId;
        escrow.client = payable(agreement.client);
        escrow.freelancer = payable(agreement.freelancer);
        escrow.totalAmount = total;
        escrow.status = EscrowStatus.Created;
        escrow.milestoneCount = amounts.length;

        escrowOfAgreement[agreementId] = escrowId;

        for (uint256 i = 0; i < amounts.length; i++) {
            milestones[escrowId][i] = Milestone({
                title: titles[i],
                description: descriptions[i],
                amount: amounts[i],
                deadline: deadlines[i],
                status: MilestoneStatus.Pending,
                deliverableUri: ""
            });
        }

        emit EscrowCreated(
            escrowId,
            agreementId,
            agreement.client,
            agreement.freelancer,
            total
        );

        return escrowId;
    }

    function deposit(uint256 escrowId)
        external
        payable
        onlyClient(escrowId)
        escrowExists(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Created,
            "Invalid escrow status"
        );

        require(
            msg.value == escrow.totalAmount,
            "Incorrect deposit amount"
        );

        // Les fonds ne sont bloques qu'une fois le freelance engage.
        IServiceAgreement.Status agreementStatus = _agreementStatus(escrow);
        require(
            agreementStatus == IServiceAgreement.Status.Accepted ||
            agreementStatus == IServiceAgreement.Status.InProgress ||
            agreementStatus == IServiceAgreement.Status.Delivered,
            "Agreement not accepted"
        );

        escrow.depositedAmount = msg.value;
        escrow.status = EscrowStatus.Funded;

        emit FundsDeposited(escrowId, msg.value);
    }

    /// @notice Le freelance soumet un jalon avec le lien de son livrable : le client
    ///         verifie le travail jalon par jalon avant d'approuver.
    function submitMilestone(uint256 escrowId, uint256 milestoneId, string calldata deliverableUri)
        external
        escrowExists(escrowId)
        onlyFreelancer(escrowId)
    {
        require(bytes(deliverableUri).length > 0, "Deliverable required");

        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Funded ||
            escrow.status == EscrowStatus.InProgress,
            "Invalid escrow status"
        );

        _requireAgreementActive(escrow);

        require(
            milestoneId < escrow.milestoneCount,
            "Invalid milestone"
        );

        Milestone storage milestone =
            milestones[escrowId][milestoneId];

        require(
            milestone.status == MilestoneStatus.Pending,
            "Milestone already submitted"
        );

        require(
            block.timestamp <= milestone.deadline,
            "Deadline passed"
        );

        milestone.status = MilestoneStatus.Submitted;
        milestone.deliverableUri = deliverableUri;
        escrow.status = EscrowStatus.InProgress;

        emit MilestoneSubmitted(escrowId, milestoneId, deliverableUri);
    }

    function approveMilestone(uint256 escrowId, uint256 milestoneId)
        external
        escrowExists(escrowId)
        onlyClient(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Funded ||
            escrow.status == EscrowStatus.InProgress,
            "Invalid escrow status"
        );

        _requireAgreementActive(escrow);

        require(
            milestoneId < escrow.milestoneCount,
            "Invalid milestone"
        );

        Milestone storage milestone =
            milestones[escrowId][milestoneId];

        require(
            milestone.status == MilestoneStatus.Submitted,
            "Milestone not submitted"
        );

        milestone.status = MilestoneStatus.Approved;

        emit MilestoneApproved(escrowId, milestoneId);
    }

    function releasePayment(uint256 escrowId, uint256 milestoneId)
        external
        nonReentrant
        escrowExists(escrowId)
        onlyClient(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Funded ||
            escrow.status == EscrowStatus.InProgress,
            "Escrow unavailable"
        );

        _requireAgreementActive(escrow);

        require(
            milestoneId < escrow.milestoneCount,
            "Invalid milestone"
        );

        Milestone storage milestone =
            milestones[escrowId][milestoneId];

        require(
            milestone.status == MilestoneStatus.Approved,
            "Milestone not approved"
        );

        uint256 amount = milestone.amount;

        milestone.status = MilestoneStatus.Released;
        escrow.releasedAmount += amount;

        if (escrow.releasedAmount == escrow.totalAmount) {
            escrow.status = EscrowStatus.Completed;
        }

        escrow.freelancer.transfer(amount);

        emit PaymentReleased(
            escrowId,
            milestoneId,
            escrow.freelancer,
            amount
        );
    }

    /// @notice Solde l'escrow selon l'issue de l'accord : Completed paie le freelance
    ///         du reste (moins la penalite de retard), Cancelled rembourse le client.
    ///         Appelable par n'importe qui ; A l'appelle aussi automatiquement.
    function settle(uint256 escrowId)
        external
        nonReentrant
        escrowExists(escrowId)
    {
        _settle(escrowId);
    }

    /// @notice Solde l'escrow d'un accord s'il existe et n'est pas deja solde (sinon ne fait rien).
    /// @dev Appele par A a la fin de l'accord : la validation paie le freelance dans la meme transaction.
    function settleAgreement(uint256 agreementId) external nonReentrant {
        uint256 escrowId = escrowOfAgreement[agreementId];
        if (escrowId == 0) return;
        EscrowStatus status = escrows[escrowId].status;
        if (status == EscrowStatus.Completed || status == EscrowStatus.Cancelled) return;
        _settle(escrowId);
    }

    /// @notice true si le client a depose le paiement de l'accord : condition de `startWork` dans A.
    function isFunded(uint256 agreementId) external view returns (bool) {
        uint256 escrowId = escrowOfAgreement[agreementId];
        return escrowId != 0 && escrows[escrowId].depositedAmount > 0;
    }

    /// @notice Nombre de jalons soumis que le client n'a pas encore approuves.
    /// @dev A refuse `approveDelivery` tant qu'il en reste : le client verifie chaque sprint avant de payer.
    function pendingReviews(uint256 agreementId) external view returns (uint256 count) {
        uint256 escrowId = escrowOfAgreement[agreementId];
        if (escrowId == 0) return 0;
        uint256 n = escrows[escrowId].milestoneCount;
        for (uint256 i = 0; i < n; i++) {
            if (milestones[escrowId][i].status == MilestoneStatus.Submitted) count++;
        }
    }

    function _settle(uint256 escrowId) private {
        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Created ||
            escrow.status == EscrowStatus.Funded ||
            escrow.status == EscrowStatus.InProgress,
            "Already settled"
        );

        IServiceAgreement.Status agreementStatus = _agreementStatus(escrow);

        require(
            agreementStatus == IServiceAgreement.Status.Completed ||
            agreementStatus == IServiceAgreement.Status.Cancelled,
            "Agreement not finished"
        );

        bool freelancerPaid =
            agreementStatus == IServiceAgreement.Status.Completed;

        uint256 remaining =
            escrow.depositedAmount - escrow.releasedAmount;

        // Completed : le freelance a droit au montant moins la penalite de retard. Ce qui a
        // deja ete libere par jalons compte dans ce droit ; le reste revient au client.
        uint256 toFreelancer;
        if (freelancerPaid) {
            uint256 penalty = ILatePenalty(address(agreements)).latePenaltyPercent(escrow.agreementId);
            uint256 due = (escrow.depositedAmount * (100 - penalty)) / 100;
            toFreelancer = due > escrow.releasedAmount ? due - escrow.releasedAmount : 0;
            if (toFreelancer > remaining) toFreelancer = remaining;
        }
        uint256 toClient = remaining - toFreelancer;

        escrow.status = freelancerPaid
            ? EscrowStatus.Completed
            : EscrowStatus.Cancelled;
        escrow.releasedAmount += toFreelancer;

        // Accord termine en faveur du freelance : les jalons restants sont regles par ce paiement,
        // leur statut le reflete (plus aucun jalon "en attente" deja paye).
        if (freelancerPaid) {
            for (uint256 i = 0; i < escrow.milestoneCount; i++) {
                milestones[escrowId][i].status = MilestoneStatus.Released;
            }
        }

        if (toFreelancer > 0) escrow.freelancer.transfer(toFreelancer);
        if (toClient > 0) escrow.client.transfer(toClient);

        emit EscrowSettled(escrowId, freelancerPaid, toFreelancer, toClient);
    }

    function getMilestone(uint256 escrowId, uint256 milestoneId)
        external
        view
        escrowExists(escrowId)
        returns (Milestone memory)
    {
        require(
            milestoneId < escrows[escrowId].milestoneCount,
            "Invalid milestone"
        );

        return milestones[escrowId][milestoneId];
    }

    function getEscrow(uint256 escrowId)
        external
        view
        escrowExists(escrowId)
        returns (Escrow memory)
    {
        return escrows[escrowId];
    }

    function _agreementStatus(Escrow storage escrow)
        private
        view
        returns (IServiceAgreement.Status)
    {
        return agreements.getAgreement(escrow.agreementId).status;
    }

    /// @dev Jalons geles pendant un litige et apres une annulation de l'accord.
    function _requireAgreementActive(Escrow storage escrow) private view {
        IServiceAgreement.Status agreementStatus = _agreementStatus(escrow);

        require(
            agreementStatus != IServiceAgreement.Status.Disputed &&
            agreementStatus != IServiceAgreement.Status.Cancelled,
            "Agreement frozen"
        );
    }
}
