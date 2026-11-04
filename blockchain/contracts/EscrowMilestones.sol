
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EscrowMilestones is ReentrancyGuard {

    enum EscrowStatus {
        Created,
        Funded,
        InProgress,
        Completed,
        Disputed,
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
    }

    struct Escrow {
        uint256 id;
        uint256 agreementId;
        address payable client;
        address payable freelancer;
        address arbiter;
        uint256 totalAmount;
        uint256 depositedAmount;
        uint256 releasedAmount;
        EscrowStatus status;
        uint256 milestoneCount;
    }

    uint256 private nextEscrowId = 1;

    mapping(uint256 => Escrow) public escrows;

    mapping(uint256 => mapping(uint256 => Milestone))
        public milestones;

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
        uint256 milestoneId
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

    event DisputeRaised(
        uint256 indexed escrowId,
        address raisedBy
    );

    event DisputeResolved(
        uint256 indexed escrowId,
        bool freelancerPaid
    );

    event RefundIssued(
        uint256 indexed escrowId,
        address client,
        uint256 amount
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

    modifier onlyArbiter(uint256 escrowId) {
        require(
            msg.sender == escrows[escrowId].arbiter,
            "Only arbiter"
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
        address payable freelancer,
        address arbiter,
        uint256[] calldata amounts,
        string[] calldata titles,
        string[] calldata descriptions,
        uint256[] calldata deadlines
    ) external returns (uint256) {

        require(freelancer != address(0), "Invalid freelancer");
        require(arbiter != address(0), "Invalid arbiter");
        require(freelancer != msg.sender, "Invalid parties");

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

        uint256 escrowId = nextEscrowId++;

        Escrow storage escrow = escrows[escrowId];

        escrow.id = escrowId;
        escrow.agreementId = agreementId;
        escrow.client = payable(msg.sender);
        escrow.freelancer = freelancer;
        escrow.arbiter = arbiter;
        escrow.totalAmount = total;
        escrow.status = EscrowStatus.Created;
        escrow.milestoneCount = amounts.length;

        for (uint256 i = 0; i < amounts.length; i++) {
            milestones[escrowId][i] = Milestone({
                title: titles[i],
                description: descriptions[i],
                amount: amounts[i],
                deadline: deadlines[i],
                status: MilestoneStatus.Pending
            });
        }

        emit EscrowCreated(
            escrowId,
            agreementId,
            msg.sender,
            freelancer,
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

        escrow.depositedAmount = msg.value;
        escrow.status = EscrowStatus.Funded;

        emit FundsDeposited(escrowId, msg.value);
    }

    function submitMilestone(uint256 escrowId, uint256 milestoneId)
        external
        escrowExists(escrowId)
        onlyFreelancer(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Funded ||
            escrow.status == EscrowStatus.InProgress,
            "Invalid escrow status"
        );

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
        escrow.status = EscrowStatus.InProgress;

        emit MilestoneSubmitted(escrowId, milestoneId);
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
            escrow.status != EscrowStatus.Disputed &&
            escrow.status != EscrowStatus.Cancelled,
            "Escrow unavailable"
        );

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

    function raiseDispute(uint256 escrowId)
        external
        escrowExists(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];

        require(
            msg.sender == escrow.client ||
            msg.sender == escrow.freelancer,
            "Unauthorized"
        );

        require(
            escrow.status == EscrowStatus.Funded ||
            escrow.status == EscrowStatus.InProgress,
            "Cannot dispute"
        );

        escrow.status = EscrowStatus.Disputed;

        emit DisputeRaised(escrowId, msg.sender);
    }

    function resolveDispute(
        uint256 escrowId,
        bool freelancerPaid
    )
        external
        nonReentrant
        escrowExists(escrowId)
        onlyArbiter(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Disputed,
            "No active dispute"
        );

        uint256 remaining =
            escrow.depositedAmount - escrow.releasedAmount;

        escrow.status = freelancerPaid
            ? EscrowStatus.Completed
            : EscrowStatus.Cancelled;

        escrow.releasedAmount += freelancerPaid ? remaining : 0;

        if (freelancerPaid) {
            escrow.freelancer.transfer(remaining);
        } else {
            escrow.client.transfer(remaining);
        }

        emit DisputeResolved(escrowId, freelancerPaid);
    }

    function refund(uint256 escrowId)
        external
        nonReentrant
        escrowExists(escrowId)
        onlyClient(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];

        require(
            escrow.status == EscrowStatus.Funded ||
            escrow.status == EscrowStatus.InProgress,
            "Refund unavailable"
        );

        require(
            escrow.releasedAmount == 0,
            "Payments already released"
        );

        for (uint256 i = 0; i < escrow.milestoneCount; i++) {
            require(
                milestones[escrowId][i].status == MilestoneStatus.Pending,
                "Milestone already submitted"
            );
        }

        uint256 amount = escrow.depositedAmount;

        escrow.status = EscrowStatus.Cancelled;
        escrow.depositedAmount = 0;

        escrow.client.transfer(amount);

        emit RefundIssued(escrowId, escrow.client, amount);
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
}
