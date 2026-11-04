const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ServiceAgreement (A) holds the agreement and its status, EscrowMilestones (B) holds the funds.
// They are linked by `agreementId`: the front creates the escrow with the parties and the arbiter of A.
describe("ServiceAgreement + EscrowMilestones", function () {
  let agreements, escrow, arbiter, client, freelancer, stranger, deadline;
  const termsHash = ethers.keccak256(ethers.toUtf8Bytes("conditions"));
  const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
  const total = ethers.parseEther("3");

  beforeEach(async function () {
    [arbiter, client, freelancer, stranger] = await ethers.getSigners();
    agreements = await ethers.deployContract("ServiceAgreement", [], arbiter);
    escrow = await ethers.deployContract("EscrowMilestones", [], arbiter);
    deadline = (await time.latest()) + 14 * 24 * 3600;
  });

  async function createAgreementAndEscrow() {
    await agreements.connect(client).createAgreement(freelancer.address, "Site", termsHash, total, deadline);
    const a = await agreements.getAgreement(1);
    await escrow
      .connect(client)
      .createEscrow(
        a.id,
        a.freelancer,
        await agreements.arbiter(),
        amounts,
        ["Maquettes", "Developpement"],
        ["Wireframes", "Code"],
        [deadline - 3600, deadline - 1800],
      );
  }

  async function fundAndStart() {
    await createAgreementAndEscrow();
    await agreements.connect(freelancer).acceptAgreement(1);
    await escrow.connect(client).deposit(1, { value: total });
    await agreements.connect(freelancer).startWork(1);
  }

  it("lie l'escrow a l'accord et reprend ses parties et son arbitre", async function () {
    await createAgreementAndEscrow();
    const e = await escrow.getEscrow(1);
    expect(e.agreementId).to.equal(1n);
    expect(e.client).to.equal(client.address);
    expect(e.freelancer).to.equal(freelancer.address);
    expect(e.arbiter).to.equal(arbiter.address);
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
  });

  it("litige : l'arbitre rembourse le client sur les deux contrats", async function () {
    await fundAndStart();
    await escrow.connect(freelancer).submitMilestone(1, 0);
    await escrow.connect(client).approveMilestone(1, 0);
    await escrow.connect(client).releasePayment(1, 0); // 1 ETH deja paye

    await agreements.connect(client).raiseDispute(1);
    await escrow.connect(client).raiseDispute(1);

    await agreements.connect(arbiter).resolveDispute(1, false);
    await expect(escrow.connect(arbiter).resolveDispute(1, false)).to.changeEtherBalance(client, amounts[1]);

    expect((await agreements.getAgreement(1)).status).to.equal(5n); // Cancelled
    expect((await escrow.getEscrow(1)).status).to.equal(5n); // Cancelled
  });

  it("litige : l'arbitre paie le freelance du solde restant", async function () {
    await fundAndStart();
    await agreements.connect(freelancer).raiseDispute(1);
    await escrow.connect(freelancer).raiseDispute(1);

    await agreements.connect(arbiter).resolveDispute(1, true);
    await expect(escrow.connect(arbiter).resolveDispute(1, true)).to.changeEtherBalance(freelancer, total);
    expect((await agreements.getAgreement(1)).status).to.equal(4n); // Completed
    expect((await escrow.getEscrow(1)).status).to.equal(3n); // Completed
  });

  it("annulation : le client annule l'accord puis reprend ses fonds", async function () {
    await createAgreementAndEscrow();
    await escrow.connect(client).deposit(1, { value: total });
    await agreements.connect(client).cancel(1);
    await expect(escrow.connect(client).refund(1)).to.changeEtherBalance(client, total);
    expect((await agreements.getAgreement(1)).status).to.equal(5n);
    expect((await escrow.getEscrow(1)).status).to.equal(5n);
  });

  it("un tiers ne peut toucher ni a l'accord ni aux fonds", async function () {
    await fundAndStart();
    await expect(agreements.connect(stranger).cancel(1)).to.be.revertedWithCustomError(agreements, "NotClient");
    await expect(escrow.connect(stranger).submitMilestone(1, 0)).to.be.revertedWith("Only freelancer");
    await expect(escrow.connect(stranger).releasePayment(1, 0)).to.be.revertedWith("Only client");
    await expect(escrow.connect(stranger).resolveDispute(1, true)).to.be.revertedWith("Only arbiter");
  });

  it("le client ne peut pas liberer un jalon non approuve ni redeposer", async function () {
    await fundAndStart();
    await expect(escrow.connect(client).releasePayment(1, 0)).to.be.revertedWith("Milestone not approved");
    await expect(escrow.connect(client).deposit(1, { value: total })).to.be.revertedWith("Invalid escrow status");
  });
});
