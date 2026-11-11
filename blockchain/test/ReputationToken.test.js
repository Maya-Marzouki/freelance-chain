const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DELIVERABLE_URI = "https://example.com/livrable.zip";
const MILESTONE_URI = "https://github.com/demo/site/commit/abc123";
const DELIVERABLE_HASH = ethers.keccak256(ethers.toUtf8Bytes("contenu du livrable"));

// ReputationToken (C) lit ServiceAgreement (A) et EscrowMilestones (B) : la reputation
// n'est frappee qu'une fois l'accord Completed et le freelance paye en totalite.
describe("ReputationToken", function () {
  let agreements, escrow, token, client, freelancer, stranger, deadline;
  const termsHash = ethers.keccak256(ethers.toUtf8Bytes("conditions"));
  const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
  const total = ethers.parseEther("3");

  beforeEach(async function () {
    [client, freelancer, stranger] = await ethers.getSigners();
    agreements = await ethers.deployContract("ServiceAgreement");
    escrow = await ethers.deployContract("EscrowMilestones", [await agreements.getAddress()]);
    await agreements.setEscrowContract(await escrow.getAddress());
    token = await ethers.deployContract("ReputationToken", [
      await agreements.getAddress(),
      await escrow.getAddress(),
    ]);
    deadline = (await time.latest()) + 14 * 24 * 3600;
  });

  async function createFundAndStart() {
    await agreements.connect(client).createAgreement(freelancer.address, "Site", termsHash, total, deadline);
    await escrow
      .connect(client)
      .createEscrow(1, amounts, ["Maquettes", "Developpement"], ["Wireframes", "Code"], [deadline - 3600, deadline - 1800]);
    await agreements.connect(freelancer).acceptAgreement(1);
    await escrow.connect(client).deposit(1, { value: total });
    await agreements.connect(freelancer).startWork(1);
  }

  async function deliverAndApprove() {
    await agreements.connect(freelancer).markDelivered(1, DELIVERABLE_HASH, DELIVERABLE_URI);
    await agreements.connect(client).approveDelivery(1);
  }

  /** Accord termine : la validation solde l'escrow au freelance dans la meme transaction. */
  async function completeMission() {
    await createFundAndStart();
    await deliverAndApprove();
  }

  it("a le nom, le symbole et 18 decimales", async function () {
    expect(await token.name()).to.equal("FreeLance Reputation");
    expect(await token.symbol()).to.equal("FLR");
    expect(await token.decimals()).to.equal(18n);
    expect(await token.totalSupply()).to.equal(0n);
  });

  it("refuse des adresses de contrats nulles au deploiement", async function () {
    const factory = await ethers.getContractFactory("ReputationToken");
    await expect(factory.deploy(ethers.ZeroAddress, await escrow.getAddress())).to.be.revertedWith(
      "Invalid agreement contract"
    );
    await expect(factory.deploy(await agreements.getAddress(), ethers.ZeroAddress)).to.be.revertedWith(
      "Invalid escrow contract"
    );
  });

  it("frappe la reputation proportionnellement au montant paye", async function () {
    await completeMission();

    const freelancerReward = total * 100n; // 3 ETH -> 300 FLR
    const clientReward = total * 20n; // 3 ETH -> 60 FLR

    await expect(token.connect(stranger).claimReward(1))
      .to.emit(token, "ReputationRewarded")
      .withArgs(1, freelancer.address, client.address, freelancerReward, clientReward, true);

    expect(await token.balanceOf(freelancer.address)).to.equal(ethers.parseEther("300"));
    expect(await token.balanceOf(client.address)).to.equal(ethers.parseEther("60"));
    expect(await token.balanceOf(stranger.address)).to.equal(0n);
    expect(await token.rewardClaimed(1)).to.equal(true);
    expect(await token.missionsCompleted(freelancer.address)).to.equal(1n);
    expect(await token.missionsCompleted(client.address)).to.equal(1n);
  });

  it("fonctionne aussi quand tous les jalons ont ete liberes un par un", async function () {
    await createFundAndStart();
    for (let i = 0; i < 2; i++) {
      await escrow.connect(freelancer).submitMilestone(1, i, MILESTONE_URI);
      await escrow.connect(client).approveMilestone(1, i);
      await escrow.connect(client).releasePayment(1, i);
    }
    await deliverAndApprove();

    await token.claimReward(1);
    expect(await token.balanceOf(freelancer.address)).to.equal(ethers.parseEther("300"));
  });

  describe("condition de deadline", function () {
    it("livre a temps : le freelance recoit 100 %", async function () {
      await completeMission();
      expect(await token.isDeliveredOnTime(1)).to.equal(true);
      await token.claimReward(1);
      expect(await token.balanceOf(freelancer.address)).to.equal(ethers.parseEther("300"));
    });

    it("livre en retard : le freelance recoit 50 % (sur ce qu'il a touche), le client sa part complete", async function () {
      await createFundAndStart();
      await time.increaseTo(deadline + 1); // 1er jour de retard : 1 % retenu sur le paiement
      await deliverAndApprove();

      // paye : 2,97 ETH -> freelance 2,97 x 100 x 50 % = 148,5 FLR ; client 2,97 x 20 = 59,4 FLR
      expect(await token.isDeliveredOnTime(1)).to.equal(false);
      await expect(token.claimReward(1))
        .to.emit(token, "ReputationRewarded")
        .withArgs(1, freelancer.address, client.address, ethers.parseEther("148.5"), ethers.parseEther("59.4"), false);
      expect(await token.balanceOf(freelancer.address)).to.equal(ethers.parseEther("148.5"));
      expect(await token.balanceOf(client.address)).to.equal(ethers.parseEther("59.4"));
    });

    it("jamais livre (le client cede pendant le travail) : compte comme en retard", async function () {
      await createFundAndStart();
      await agreements.connect(client).raiseDispute(1);
      await agreements.connect(client).concede(1); // Completed sans markDelivered

      expect(await token.isDeliveredOnTime(1)).to.equal(false);
      await token.claimReward(1);
      expect(await token.balanceOf(freelancer.address)).to.equal(ethers.parseEther("150"));
    });
  });

  it("refuse une deuxieme recompense pour le meme accord", async function () {
    await completeMission();
    await token.claimReward(1);
    await expect(token.claimReward(1)).to.be.revertedWithCustomError(token, "AlreadyClaimed");
  });

  it("refuse tant que l'accord n'est pas Completed", async function () {
    await createFundAndStart();
    await expect(token.claimReward(1)).to.be.revertedWithCustomError(token, "AgreementNotCompleted");
  });

  it("refuse un accord annule", async function () {
    await agreements.connect(client).createAgreement(freelancer.address, "Site", termsHash, total, deadline);
    await agreements.connect(client).cancel(1);
    await expect(token.claimReward(1)).to.be.revertedWithCustomError(token, "AgreementNotCompleted");
  });

  it("la validation solde l'escrow : la recompense est disponible aussitot", async function () {
    await createFundAndStart();
    await deliverAndApprove(); // aucun appel a `settle`
    expect((await escrow.getEscrow(1)).status).to.equal(3n); // Completed
    await token.claimReward(1);
    expect(await token.balanceOf(freelancer.address)).to.equal(ethers.parseEther("300"));
  });

  it("refuse un accord inexistant", async function () {
    await expect(token.claimReward(42)).to.be.revertedWithCustomError(agreements, "AgreementNotFound");
  });

  it("est non transferable (soulbound)", async function () {
    await completeMission();
    await token.claimReward(1);

    await expect(
      token.connect(freelancer).transfer(stranger.address, 1n)
    ).to.be.revertedWithCustomError(token, "TransferDisabled");
    await expect(
      token.connect(freelancer).approve(stranger.address, 1n)
    ).to.be.revertedWithCustomError(token, "TransferDisabled");
    await expect(
      token.connect(stranger).transferFrom(freelancer.address, stranger.address, 1n)
    ).to.be.reverted;
  });
});
