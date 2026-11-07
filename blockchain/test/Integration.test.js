const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ServiceAgreement (A) holds the agreement and its status, EscrowMilestones (B) holds the funds.
// No arbiter: a dispute ends by a party conceding or by the automatic rule of A, and B follows
// the final status of A (`settle`).
describe("ServiceAgreement + EscrowMilestones", function () {
  let agreements, escrow, client, freelancer, stranger, deadline;
  const WINDOW = 3 * 24 * 3600;
  const termsHash = ethers.keccak256(ethers.toUtf8Bytes("conditions"));
  const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
  const total = ethers.parseEther("3");

  beforeEach(async function () {
    [client, freelancer, stranger] = await ethers.getSigners();
    agreements = await ethers.deployContract("ServiceAgreement");
    escrow = await ethers.deployContract("EscrowMilestones", [await agreements.getAddress()]);
    deadline = (await time.latest()) + 14 * 24 * 3600;
  });

  async function createAgreementAndEscrow() {
    await agreements.connect(client).createAgreement(freelancer.address, "Site", termsHash, total, deadline);
    await escrow
      .connect(client)
      .createEscrow(1, amounts, ["Maquettes", "Developpement"], ["Wireframes", "Code"], [deadline - 3600, deadline - 1800]);
  }

  async function fundAndStart() {
    await createAgreementAndEscrow();
    await agreements.connect(freelancer).acceptAgreement(1);
    await escrow.connect(client).deposit(1, { value: total });
    await agreements.connect(freelancer).startWork(1);
  }

  it("l'escrow reprend les parties et le montant de l'accord", async function () {
    await createAgreementAndEscrow();
    const e = await escrow.getEscrow(1);
    expect(e.agreementId).to.equal(1n);
    expect(e.client).to.equal(client.address);
    expect(e.freelancer).to.equal(freelancer.address);
    expect(e.totalAmount).to.equal((await agreements.getAgreement(1)).amount);
  });

  it("parcours nominal : jalons payes un par un puis accord valide", async function () {
    await fundAndStart();

    for (let i = 0; i < 2; i++) {
      await escrow.connect(freelancer).submitMilestone(1, i);
      await escrow.connect(client).approveMilestone(1, i);
      await expect(escrow.connect(client).releasePayment(1, i)).to.changeEtherBalance(freelancer, amounts[i]);
    }
    const e = await escrow.getEscrow(1);
    expect(e.status).to.equal(3n); // Completed
    expect(e.releasedAmount).to.equal(total);

    await agreements.connect(freelancer).markDelivered(1);
    await agreements.connect(client).approveDelivery(1);
    expect((await agreements.getAgreement(1)).status).to.equal(4n); // Completed
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    await expect(escrow.settle(1)).to.be.revertedWith("Already settled");
  });

  it("litige : le client cede, le freelance recoit le solde", async function () {
    await fundAndStart();
    await escrow.connect(freelancer).submitMilestone(1, 0);
    await escrow.connect(client).approveMilestone(1, 0);
    await escrow.connect(client).releasePayment(1, 0); // 1 ETH deja paye

    await agreements.connect(client).raiseDispute(1);
    await expect(escrow.connect(freelancer).submitMilestone(1, 1)).to.be.revertedWith("Agreement frozen");
    await expect(escrow.settle(1)).to.be.revertedWith("Agreement not finished");

    await agreements.connect(client).concede(1); // le client reconnait sa faute
    await expect(escrow.connect(stranger).settle(1)).to.changeEtherBalance(freelancer, amounts[1]);
    expect((await agreements.getAgreement(1)).status).to.equal(4n); // Completed
    expect((await escrow.getEscrow(1)).status).to.equal(3n); // Completed
  });

  it("litige : le freelance cede, le client est rembourse du solde", async function () {
    await fundAndStart();
    await escrow.connect(freelancer).submitMilestone(1, 0);
    await escrow.connect(client).approveMilestone(1, 0);
    await escrow.connect(client).releasePayment(1, 0);

    await agreements.connect(freelancer).raiseDispute(1);
    await agreements.connect(freelancer).concede(1);
    await expect(escrow.settle(1)).to.changeEtherBalance(client, amounts[1]);
    expect((await agreements.getAgreement(1)).status).to.equal(5n); // Cancelled
    expect((await escrow.getEscrow(1)).status).to.equal(4n); // Cancelled
  });

  it("litige sans cession : la regle automatique donne gain au freelance livre a temps", async function () {
    await fundAndStart();
    await agreements.connect(freelancer).markDelivered(1);
    await agreements.connect(client).raiseDispute(1);

    await expect(agreements.connect(stranger).resolveDispute(1)).to.be.revertedWithCustomError(agreements, "DisputeWindowOpen");
    await time.increase(WINDOW);
    await agreements.connect(stranger).resolveDispute(1);
    await expect(escrow.connect(stranger).settle(1)).to.changeEtherBalance(freelancer, total);
  });

  it("litige sans cession : rien livre, le client est rembourse automatiquement", async function () {
    await fundAndStart();
    await agreements.connect(freelancer).raiseDispute(1);
    await time.increase(WINDOW);
    await agreements.connect(stranger).resolveDispute(1);
    await expect(escrow.connect(stranger).settle(1)).to.changeEtherBalance(client, total);
  });

  it("annulation : le client annule l'accord puis reprend ses fonds", async function () {
    await createAgreementAndEscrow();
    await agreements.connect(freelancer).acceptAgreement(1);
    await escrow.connect(client).deposit(1, { value: total });
    await agreements.connect(client).cancel(1);
    await expect(escrow.settle(1)).to.changeEtherBalance(client, total);
    expect((await agreements.getAgreement(1)).status).to.equal(5n);
    expect((await escrow.getEscrow(1)).status).to.equal(4n);
  });

  it("un tiers ne peut toucher ni a l'accord ni aux fonds", async function () {
    await fundAndStart();
    await expect(agreements.connect(stranger).cancel(1)).to.be.revertedWithCustomError(agreements, "NotClient");
    await expect(agreements.connect(stranger).concede(1)).to.be.revertedWithCustomError(agreements, "NotParty");
    await expect(escrow.connect(stranger).submitMilestone(1, 0)).to.be.revertedWith("Only freelancer");
    await expect(escrow.connect(stranger).releasePayment(1, 0)).to.be.revertedWith("Only client");
  });
});
