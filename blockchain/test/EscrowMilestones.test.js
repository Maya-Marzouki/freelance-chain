
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EscrowMilestones", function () {
  let escrow;
  let client;
  let freelancer;
  let arbiter;
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

  let deadlines;

  async function createTestEscrow() {
    await escrow.createEscrow(
      1,
      freelancer.address,
      arbiter.address,
      amounts,
      titles,
      descriptions,
      deadlines
    );
  }

  beforeEach(async function () {
    [client, freelancer, arbiter, other] =
      await ethers.getSigners();

    const EscrowMilestones =
      await ethers.getContractFactory("EscrowMilestones");

    escrow = await EscrowMilestones.deploy();
    await escrow.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const futureDeadline = latestBlock.timestamp + 7 * 24 * 60 * 60;

    deadlines = [
      futureDeadline,
      futureDeadline,
    ];
  });

  describe("Escrow Creation", function () {
    it("Should create an escrow successfully", async function () {
      await createTestEscrow();

      const result = await escrow.getEscrow(1);

      expect(result.client).to.equal(client.address);
      expect(result.freelancer).to.equal(freelancer.address);
      expect(result.arbiter).to.equal(arbiter.address);
      expect(result.totalAmount).to.equal(totalAmount);
      expect(result.status).to.equal(0); // Created
    });
  });

  describe("Deposit", function () {
    it("Should allow the client to deposit the exact amount", async function () {
      await createTestEscrow();

      await escrow.connect(client).deposit(1, {
        value: totalAmount,
      });

      const result = await escrow.getEscrow(1);

      expect(result.depositedAmount).to.equal(totalAmount);
      expect(result.status).to.equal(1); // Funded
    });

    it("Should reject a deposit with an incorrect amount", async function () {
      await createTestEscrow();

      await expect(
        escrow.connect(client).deposit(1, {
          value: ethers.parseEther("1"),
        })
      ).to.be.reverted;
    });
  });

  describe("Milestone Workflow", function () {
    it("Should submit, approve and release a milestone", async function () {
      await createTestEscrow();

      // 1. Client deposits the funds
      await escrow.connect(client).deposit(1, {
        value: totalAmount,
      });

      // 2. Freelancer submits the first milestone
      await escrow.connect(freelancer).submitMilestone(1, 0);

      let milestone = await escrow.getMilestone(1, 0);
      expect(milestone.status).to.equal(1); // Submitted

      // 3. Client approves the milestone
      await escrow.connect(client).approveMilestone(1, 0);

      milestone = await escrow.getMilestone(1, 0);
      expect(milestone.status).to.equal(2); // Approved

      // 4. Client releases the payment
      await escrow.connect(client).releasePayment(1, 0);

      milestone = await escrow.getMilestone(1, 0);
      expect(milestone.status).to.equal(3); // Released

      const result = await escrow.getEscrow(1);

      expect(result.releasedAmount).to.equal(amounts[0]);
    });

    it("Should prevent an unauthorized user from submitting a milestone", async function () {
      await createTestEscrow();

      await escrow.connect(client).deposit(1, {
        value: totalAmount,
      });

      await expect(
        escrow.connect(other).submitMilestone(1, 0)
      ).to.be.reverted;
    });
  });
});
