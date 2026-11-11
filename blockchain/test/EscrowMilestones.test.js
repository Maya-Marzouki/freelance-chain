const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DELIVERABLE_URI = "https://example.com/livrable.zip";
const MILESTONE_URI = "https://github.com/demo/site/commit/abc123";
const DELIVERABLE_HASH = ethers.keccak256(ethers.toUtf8Bytes("contenu du livrable"));

describe("EscrowMilestones", function () {
  let agreements;
  let escrow;
  let client;
  let freelancer;
  let other;

  const amounts = [
    ethers.parseEther("1"),
    ethers.parseEther("2"),
  ];

  const totalAmount = ethers.parseEther("3");

  const titles = [
    "Frontend development",
    "Backend development",
  ];

  const descriptions = [
    "Complete the frontend",
    "Complete the backend",
  ];

  const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms"));

  let deadlines;

  // The escrow is always created for an agreement of the ServiceAgreement contract.
  async function createAgreement(amount = totalAmount) {
    await agreements
      .connect(client)
      .createAgreement(freelancer.address, "Site", termsHash, amount, deadlines[0] + 3600);
    return agreements.agreementCount();
  }

  async function createTestEscrow(agreementId = 1) {
    await escrow
      .connect(client)
      .createEscrow(agreementId, amounts, titles, descriptions, deadlines);
  }

  async function createAcceptedEscrow() {
    await createAgreement();
    await agreements.connect(freelancer).acceptAgreement(1);
    await createTestEscrow();
  }

  async function createFundedEscrow() {
    await createAcceptedEscrow();
    await escrow.connect(client).deposit(1, { value: totalAmount });
  }

  beforeEach(async function () {
    [client, freelancer, other] = await ethers.getSigners();

    agreements = await ethers.deployContract("ServiceAgreement");
    escrow = await ethers.deployContract("EscrowMilestones", [
      await agreements.getAddress(),
    ]);

    const latestBlock = await ethers.provider.getBlock("latest");
    const futureDeadline = latestBlock.timestamp + 7 * 24 * 60 * 60;

    deadlines = [
      futureDeadline,
      futureDeadline,
    ];
  });

  describe("Escrow Creation", function () {
    it("Should create an escrow successfully", async function () {
      await createAgreement();
      await createTestEscrow();

      const result = await escrow.getEscrow(1);

      expect(result.agreementId).to.equal(1n);
      expect(result.client).to.equal(client.address);
      expect(result.freelancer).to.equal(freelancer.address);
      expect(result.totalAmount).to.equal(totalAmount);
      expect(result.status).to.equal(0); // Created
      expect(await escrow.escrowOfAgreement(1)).to.equal(1n);
    });

    it("Should reject anyone but the client of the agreement", async function () {
      await createAgreement();

      await expect(
        escrow.connect(other).createEscrow(1, amounts, titles, descriptions, deadlines)
      ).to.be.revertedWith("Only client");
    });

    it("Should reject milestones that do not add up to the agreement amount", async function () {
      await createAgreement(ethers.parseEther("5"));

      await expect(
        escrow.connect(client).createEscrow(1, amounts, titles, descriptions, deadlines)
      ).to.be.revertedWith("Total must match agreement");
    });

    it("Should reject a second escrow for the same agreement", async function () {
      await createAgreement();
      await createTestEscrow();

      await expect(
        escrow.connect(client).createEscrow(1, amounts, titles, descriptions, deadlines)
      ).to.be.revertedWith("Escrow already exists");
    });

    it("Should reject an agreement that is no longer open", async function () {
      await createAgreement();
      await agreements.connect(client).cancel(1);

      await expect(
        escrow.connect(client).createEscrow(1, amounts, titles, descriptions, deadlines)
      ).to.be.revertedWith("Agreement not open");
    });

    it("Should reject invalid milestones", async function () {
      await createAgreement();

      await expect(
        escrow.connect(client).createEscrow(1, [], [], [], [])
      ).to.be.revertedWith("Invalid milestones");

      await expect(
        escrow.connect(client).createEscrow(1, [0, totalAmount], titles, descriptions, deadlines)
      ).to.be.revertedWith("Invalid amount");

      await expect(
        escrow.connect(client).createEscrow(1, amounts, titles, descriptions, [1, deadlines[1]])
      ).to.be.revertedWith("Invalid deadline");
    });

    it("Should reject an unknown agreement", async function () {
      await expect(
        escrow.connect(client).createEscrow(99, amounts, titles, descriptions, deadlines)
      ).to.be.revertedWithCustomError(agreements, "AgreementNotFound");
    });
  });

  describe("Deposit", function () {
    it("Should allow the client to deposit the exact amount", async function () {
      await createAcceptedEscrow();

      await escrow.connect(client).deposit(1, {
        value: totalAmount,
      });

      const result = await escrow.getEscrow(1);

      expect(result.depositedAmount).to.equal(totalAmount);
      expect(result.status).to.equal(1); // Funded
    });

    it("Should reject a deposit with an incorrect amount", async function () {
      await createAcceptedEscrow();

      await expect(
        escrow.connect(client).deposit(1, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("Incorrect deposit amount");
    });

    it("Should reject a deposit before the freelancer accepts the agreement", async function () {
      await createAgreement();
      await createTestEscrow();

      await expect(
        escrow.connect(client).deposit(1, { value: totalAmount })
      ).to.be.revertedWith("Agreement not accepted");
    });

    it("Should reject a deposit from someone else, or twice", async function () {
      await createAcceptedEscrow();

      await expect(
        escrow.connect(other).deposit(1, { value: totalAmount })
      ).to.be.revertedWith("Only client");

      await escrow.connect(client).deposit(1, { value: totalAmount });

      await expect(
        escrow.connect(client).deposit(1, { value: totalAmount })
      ).to.be.revertedWith("Invalid escrow status");
    });
  });

  describe("Milestone Workflow", function () {
    it("Should submit, approve and release a milestone", async function () {
      await createFundedEscrow();

      // 1. Freelancer submits the first milestone
      await escrow.connect(freelancer).submitMilestone(1, 0, MILESTONE_URI);

      let milestone = await escrow.getMilestone(1, 0);
      expect(milestone.status).to.equal(1); // Submitted

      // 2. Client approves the milestone
      await escrow.connect(client).approveMilestone(1, 0);

      milestone = await escrow.getMilestone(1, 0);
      expect(milestone.status).to.equal(2); // Approved

      // 3. Client releases the payment
      await expect(
        escrow.connect(client).releasePayment(1, 0)
      ).to.changeEtherBalance(freelancer, amounts[0]);

      milestone = await escrow.getMilestone(1, 0);
      expect(milestone.status).to.equal(3); // Released

      const result = await escrow.getEscrow(1);

      expect(result.releasedAmount).to.equal(amounts[0]);
      expect(result.status).to.equal(2); // InProgress
    });

    it("Should complete the escrow once every milestone is released", async function () {
      await createFundedEscrow();

      for (let i = 0; i < 2; i++) {
        await escrow.connect(freelancer).submitMilestone(1, i, MILESTONE_URI);
        await escrow.connect(client).approveMilestone(1, i);
        await escrow.connect(client).releasePayment(1, i);
      }

      expect((await escrow.getEscrow(1)).status).to.equal(3); // Completed
    });

    it("Should record the deliverable link of a submitted milestone", async function () {
      await createFundedEscrow();

      await expect(escrow.connect(freelancer).submitMilestone(1, 0, MILESTONE_URI))
        .to.emit(escrow, "MilestoneSubmitted")
        .withArgs(1, 0, MILESTONE_URI);
      expect((await escrow.getMilestone(1, 0)).deliverableUri).to.equal(MILESTONE_URI);
      expect((await escrow.getMilestone(1, 1)).deliverableUri).to.equal("");
    });

    it("Should refuse a milestone submitted without a deliverable", async function () {
      await createFundedEscrow();

      await expect(
        escrow.connect(freelancer).submitMilestone(1, 0, "")
      ).to.be.revertedWith("Deliverable required");
    });

    it("Should prevent an unauthorized user from submitting a milestone", async function () {
      await createFundedEscrow();

      await expect(
        escrow.connect(other).submitMilestone(1, 0, MILESTONE_URI)
      ).to.be.revertedWith("Only freelancer");
    });

    it("Should enforce the order submit, approve, release", async function () {
      await createFundedEscrow();

      await expect(
        escrow.connect(client).approveMilestone(1, 0)
      ).to.be.revertedWith("Milestone not submitted");

      await escrow.connect(freelancer).submitMilestone(1, 0, MILESTONE_URI);

      await expect(
        escrow.connect(freelancer).submitMilestone(1, 0, MILESTONE_URI)
      ).to.be.revertedWith("Milestone already submitted");

      await expect(
        escrow.connect(client).releasePayment(1, 0)
      ).to.be.revertedWith("Milestone not approved");

      await expect(
        escrow.connect(freelancer).submitMilestone(1, 9, MILESTONE_URI)
      ).to.be.revertedWith("Invalid milestone");
    });

    it("Should reject a submission after the milestone deadline", async function () {
      await createFundedEscrow();
      await time.increaseTo(deadlines[0] + 1);

      await expect(
        escrow.connect(freelancer).submitMilestone(1, 0, MILESTONE_URI)
      ).to.be.revertedWith("Deadline passed");
    });

    it("Should freeze milestones while the agreement is disputed", async function () {
      await createFundedEscrow();
      await agreements.connect(freelancer).startWork(1);
      await escrow.connect(freelancer).submitMilestone(1, 0, MILESTONE_URI);
      await escrow.connect(client).approveMilestone(1, 0);
      await agreements.connect(client).raiseDispute(1);

      await expect(
        escrow.connect(client).releasePayment(1, 0)
      ).to.be.revertedWith("Agreement frozen");
      await expect(
        escrow.connect(freelancer).submitMilestone(1, 1, MILESTONE_URI)
      ).to.be.revertedWith("Agreement frozen");
      await expect(
        escrow.connect(client).approveMilestone(1, 1)
      ).to.be.revertedWith("Agreement frozen");
    });
  });

  describe("Settlement", function () {
    it("Should pay the freelancer the remaining funds once the agreement is completed", async function () {
      await createFundedEscrow();
      await agreements.connect(freelancer).startWork(1);
      await agreements.connect(freelancer).markDelivered(1, DELIVERABLE_HASH, DELIVERABLE_URI);
      await agreements.connect(client).approveDelivery(1);

      await expect(
        escrow.connect(other).settle(1)
      ).to.changeEtherBalance(freelancer, totalAmount);

      const result = await escrow.getEscrow(1);
      expect(result.status).to.equal(3); // Completed
      expect(result.releasedAmount).to.equal(totalAmount);
    });

    it("Should refund the client the remaining funds once the agreement is cancelled", async function () {
      await createFundedEscrow();
      await agreements.connect(client).cancel(1);

      await expect(
        escrow.connect(other).settle(1)
      ).to.changeEtherBalance(client, totalAmount);

      expect((await escrow.getEscrow(1)).status).to.equal(4); // Cancelled
    });

    it("Should only refund what was not released yet", async function () {
      await createFundedEscrow();
      await agreements.connect(freelancer).startWork(1);
      await escrow.connect(freelancer).submitMilestone(1, 0, MILESTONE_URI);
      await escrow.connect(client).approveMilestone(1, 0);
      await escrow.connect(client).releasePayment(1, 0);
      await agreements.connect(client).raiseDispute(1);
      await agreements.connect(freelancer).concede(1);

      await expect(
        escrow.settle(1)
      ).to.changeEtherBalance(client, amounts[1]);
    });

    it("Should close an escrow that was never funded", async function () {
      await createAcceptedEscrow();
      await agreements.connect(client).cancel(1);

      await expect(escrow.settle(1)).to.changeEtherBalances([client, freelancer], [0, 0]);
      expect((await escrow.getEscrow(1)).status).to.equal(4); // Cancelled
    });

    it("Should reject settlement while the agreement is not finished", async function () {
      await createFundedEscrow();

      await expect(escrow.settle(1)).to.be.revertedWith("Agreement not finished");

      await agreements.connect(freelancer).startWork(1);
      await agreements.connect(client).raiseDispute(1);

      await expect(escrow.settle(1)).to.be.revertedWith("Agreement not finished");
    });

    it("Should reject a second settlement and unknown escrows", async function () {
      await createFundedEscrow();
      await agreements.connect(client).cancel(1);
      await escrow.settle(1);

      await expect(escrow.settle(1)).to.be.revertedWith("Already settled");
      await expect(escrow.settle(9)).to.be.revertedWith("Escrow does not exist");
    });
  });

  describe("Constructor", function () {
    it("Should reject an empty agreement contract address", async function () {
      await expect(
        ethers.deployContract("EscrowMilestones", [ethers.ZeroAddress])
      ).to.be.revertedWith("Invalid agreement contract");
    });
  });
});
