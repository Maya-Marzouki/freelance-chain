// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IServiceAgreement.sol";

/// @title ServiceAgreement
/// @notice Contrat A : accord de prestation entre un client et un freelance.
/// @dev Socle minimal (creation + acceptation). A completer : livraison,
///      validation, annulation, litige, paiement (voir docs/ARCHITECTURE.md).
contract ServiceAgreement is IServiceAgreement {
    uint256 public agreementCount;
    address public arbiter;
    mapping(uint256 => Agreement) private agreements;

    event AgreementCreated(
        uint256 indexed id,
        address indexed client,
        address indexed freelancer
    );
    event StatusChanged(uint256 indexed id, Status oldStatus, Status newStatus);

    error NotFreelancer();
    error InvalidStatus(Status current);
    error AgreementNotFound();
    error InvalidParameters();
    error NotArbiter();

    constructor() {
        arbiter = msg.sender;
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
        if (a.status != Status.Created) revert InvalidStatus(a.status);

        a.status = Status.Accepted;
        emit StatusChanged(id, Status.Created, Status.Accepted);
    }

    function startWork(uint256 id) external {
        Agreement storage a = _get(id);
        if (msg.sender != a.freelancer) revert NotFreelancer();
        if (a.status != Status.Accepted) revert InvalidStatus(a.status);

        a.status = Status.InProgress;
        emit StatusChanged(id, Status.Accepted, Status.InProgress);
    }

    function getAgreement(uint256 id) external view override returns (Agreement memory) {
        return _get(id);
    }

    function _get(uint256 id) internal view returns (Agreement storage) {
        if (id == 0 || id > agreementCount) revert AgreementNotFound();
        return agreements[id];
    }

    
}
