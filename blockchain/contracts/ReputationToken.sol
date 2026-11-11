// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./IServiceAgreement.sol";
import "./EscrowMilestones.sol";

/// @dev Date de livraison exposee par ServiceAgreement (getter du mapping public `deliveredAt`).
///      Interface locale : l'interface commune IServiceAgreement reste inchangee.
interface IDeliveryTimes {
    function deliveredAt(uint256 id) external view returns (uint256);
}

/// @title ReputationToken
/// @notice Contrat C : token de reputation (FLR) gagne a la fin d'une mission payee.
/// @dev Le paiement reste en ETH dans l'escrow (B). Ce contrat lit A et B sans les modifier :
///      - l'accord doit etre Completed (A) ;
///      - son escrow doit etre Completed, donc le freelance a ete paye en totalite (B) ;
///      - une seule recompense par accord.
///      Condition de deadline : le freelance recoit 100 % s'il a livre avant l'echeance de
///      l'accord, `LATE_REWARD_PERCENT` % sinon (livre en retard, ou jamais livre). Le client,
///      qui a paye en totalite, recoit toujours sa part complete.
///      Le token est non transferable ("soulbound") : la reputation ne s'achete pas.
contract ReputationToken is ERC20 {
    /// @notice FLR frappes au freelance par ETH paye (1 ETH paye -> 100 FLR).
    uint256 public constant FREELANCER_RATE = 100;
    /// @notice FLR frappes au client par ETH paye (1 ETH paye -> 20 FLR).
    uint256 public constant CLIENT_RATE = 20;
    /// @notice Part de la recompense du freelance conservee s'il n'a pas livre a temps.
    uint256 public constant LATE_REWARD_PERCENT = 50;

    IServiceAgreement public immutable agreements;
    EscrowMilestones public immutable escrow;

    /// @notice true une fois la recompense d'un accord distribuee.
    mapping(uint256 => bool) public rewardClaimed;
    /// @notice Nombre de missions terminees et recompensees par adresse (client ou freelance).
    mapping(address => uint256) public missionsCompleted;

    event ReputationRewarded(
        uint256 indexed agreementId,
        address indexed freelancer,
        address indexed client,
        uint256 freelancerReward,
        uint256 clientReward,
        bool onTime
    );

    error TransferDisabled();
    error AgreementNotCompleted();
    error EscrowNotCompleted();
    error AlreadyClaimed();

    constructor(IServiceAgreement agreementContract, EscrowMilestones escrowContract)
        ERC20("FreeLance Reputation", "FLR")
    {
        require(address(agreementContract) != address(0), "Invalid agreement contract");
        require(address(escrowContract) != address(0), "Invalid escrow contract");
        agreements = agreementContract;
        escrow = escrowContract;
    }

    /// @notice Distribue la reputation d'un accord termine. Appelable par n'importe qui :
    ///         les beneficiaires et les montants viennent des contrats A et B.
    function claimReward(uint256 agreementId) external {
        if (rewardClaimed[agreementId]) revert AlreadyClaimed();

        IServiceAgreement.Agreement memory a = agreements.getAgreement(agreementId);
        if (a.status != IServiceAgreement.Status.Completed) revert AgreementNotCompleted();

        uint256 escrowId = escrow.escrowOfAgreement(agreementId);
        if (escrowId == 0) revert EscrowNotCompleted();
        EscrowMilestones.Escrow memory e = escrow.getEscrow(escrowId);
        if (e.status != EscrowMilestones.EscrowStatus.Completed) revert EscrowNotCompleted();

        // Effets avant interactions : l'accord est marque avant de frapper.
        rewardClaimed[agreementId] = true;
        missionsCompleted[a.freelancer] += 1;
        missionsCompleted[a.client] += 1;

        // Montants en wei : 1 ETH (1e18 wei) * 100 = 100 FLR (18 decimales).
        bool onTime = isDeliveredOnTime(agreementId);
        uint256 freelancerReward = e.releasedAmount * FREELANCER_RATE;
        if (!onTime) freelancerReward = (freelancerReward * LATE_REWARD_PERCENT) / 100;
        uint256 clientReward = e.releasedAmount * CLIENT_RATE;

        _mint(a.freelancer, freelancerReward);
        _mint(a.client, clientReward);

        emit ReputationRewarded(agreementId, a.freelancer, a.client, freelancerReward, clientReward, onTime);
    }

    /// @notice true si le freelance a livre (`markDelivered`) au plus tard a l'echeance.
    ///         Un accord termine sans livraison (cession du client pendant le travail) compte comme en retard.
    function isDeliveredOnTime(uint256 agreementId) public view returns (bool) {
        uint256 delivered = IDeliveryTimes(address(agreements)).deliveredAt(agreementId);
        return delivered != 0 && delivered <= agreements.getAgreement(agreementId).deadline;
    }

    /// @dev Seule la frappe (from == 0) est autorisee : pas de transfert ni de burn.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) revert TransferDisabled();
        super._update(from, to, value);
    }

    /// @dev Sans transfert possible, une autorisation de depense n'a pas de sens.
    function approve(address, uint256) public pure override returns (bool) {
        revert TransferDisabled();
    }
}
