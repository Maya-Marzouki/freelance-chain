const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ServiceAgreement", function () {
  let contract, client, freelancer, stranger, deadline;
  const termsHash = ethers.keccak256(ethers.toUtf8Bytes("conditions du contrat"));

  beforeEach(async function () {
    [client, freelancer, stranger] = await ethers.getSigners();
    contract = await ethers.deployContract("ServiceAgreement");
    deadline = (await time.latest()) + 7 * 24 * 3600;
  });

  async function create() {
    return contract
      .connect(client)
      .createAgreement(freelancer.address, "Site vitrine", termsHash, ethers.parseEther("1"), deadline);
  }

  it("cree un accord avec le statut Created", async function () {
    await expect(create()).to.emit(contract, "AgreementCreated").withArgs(1, client.address, freelancer.address);
    const a = await contract.getAgreement(1);
    expect(a.client).to.equal(client.address);
    expect(a.freelancer).to.equal(freelancer.address);
    expect(a.status).to.equal(0n);
  });

  it("refuse un freelance invalide ou une echeance passee", async function () {
    await expect(
      contract.createAgreement(client.address, "x", termsHash, 1, deadline)
    ).to.be.revertedWithCustomError(contract, "InvalidParameters");
    await expect(
      contract.createAgreement(freelancer.address, "x", termsHash, 1, 1)
    ).to.be.revertedWithCustomError(contract, "InvalidParameters");
  });

  it("le freelance accepte l'accord", async function () {
    await create();
    await expect(contract.connect(freelancer).acceptAgreement(1)).to.emit(contract, "StatusChanged");
    expect((await contract.getAgreement(1)).status).to.equal(1n);
  });

  it("refuse l'acceptation par un tiers ou une seconde fois", async function () {
    await create();
    await expect(contract.connect(stranger).acceptAgreement(1)).to.be.revertedWithCustomError(contract, "NotFreelancer");
    await contract.connect(freelancer).acceptAgreement(1);
    await expect(contract.connect(freelancer).acceptAgreement(1)).to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("refuse un accord inexistant", async function () {
    await expect(contract.getAgreement(42)).to.be.revertedWithCustomError(contract, "AgreementNotFound");
  });

  it("refuse l'adresse zero comme freelance", async function () {
    await expect(
      contract.createAgreement(ethers.ZeroAddress, "x", termsHash, 1, deadline)
    ).to.be.revertedWithCustomError(contract, "InvalidParameters");
  });

  it("refuse l'identifiant 0", async function () {
    await expect(contract.getAgreement(0)).to.be.revertedWithCustomError(contract, "AgreementNotFound");
  });

  it("definit l'arbitre comme le deployeur", async function () {
    expect(await contract.arbiter()).to.equal(client.address);
  });

  async function createAndAccept() {
    await create();
    await contract.connect(freelancer).acceptAgreement(1);
  }
  
  describe("startWork", function () {
  it("le freelance demarre le travail", async function () {
    await createAndAccept();
    await expect(contract.connect(freelancer).startWork(1))
      .to.emit(contract, "StatusChanged")
      .withArgs(1, 1, 2); // Accepted (1) -> InProgress (2)
    expect((await contract.getAgreement(1)).status).to.equal(2n);
  });

  it("refuse un appelant autre que le freelance", async function () {
    await createAndAccept();
    await expect(contract.connect(client).startWork(1))
      .to.be.revertedWithCustomError(contract, "NotFreelancer");
    await expect(contract.connect(stranger).startWork(1))
      .to.be.revertedWithCustomError(contract, "NotFreelancer");
  });

  it("refuse si l'accord n'est pas Accepted", async function () {
    await create(); // statut Created : pas encore accepte
    await expect(contract.connect(freelancer).startWork(1))
      .to.be.revertedWithCustomError(contract, "InvalidStatus");
  });
  });
  async function createAcceptAndStart() {
    await createAndAccept();
    await contract.connect(freelancer).startWork(1);
  }

  async function createAcceptStartAndDeliver() {
    await createAcceptAndStart();
    await contract.connect(freelancer).markDelivered(1);
  }
  describe("markDelivered", function () {
    it("le freelance marque la livraison", async function () {
      await createAcceptAndStart();
      await expect(contract.connect(freelancer).markDelivered(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 2, 3); // InProgress -> Delivered
      expect((await contract.getAgreement(1)).status).to.equal(3n);
    });

    it("refuse un appelant autre que le freelance", async function () {
      await createAcceptAndStart();
      await expect(contract.connect(client).markDelivered(1))
        .to.be.revertedWithCustomError(contract, "NotFreelancer");
    });

    it("refuse si le travail n'a pas demarre", async function () {
      await createAndAccept(); // statut Accepted, pas InProgress
      await expect(contract.connect(freelancer).markDelivered(1))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });
  });

  describe("approveDelivery", function () {
    it("le client valide la livraison", async function () {
      await createAcceptStartAndDeliver();
      await expect(contract.connect(client).approveDelivery(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 3, 4); // Delivered -> Completed
      expect((await contract.getAgreement(1)).status).to.equal(4n);
    });

    it("refuse un appelant autre que le client", async function () {
      await createAcceptStartAndDeliver();
      await expect(contract.connect(freelancer).approveDelivery(1))
        .to.be.revertedWithCustomError(contract, "NotClient");
    });

    it("refuse si rien n'a ete livre", async function () {
      await createAcceptAndStart(); // InProgress, pas Delivered
      await expect(contract.connect(client).approveDelivery(1))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });
  });

  describe("cancel", function () {
    it("le client annule un accord Created", async function () {
      await create();
      await expect(contract.connect(client).cancel(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 0, 5); // Created -> Cancelled
      expect((await contract.getAgreement(1)).status).to.equal(5n);
    });

    it("le client annule un accord Accepted", async function () {
      await createAndAccept();
      await expect(contract.connect(client).cancel(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 1, 5); // Accepted -> Cancelled
      expect((await contract.getAgreement(1)).status).to.equal(5n);
    });

    it("refuse un appelant autre que le client", async function () {
      await create();
      await expect(contract.connect(freelancer).cancel(1))
        .to.be.revertedWithCustomError(contract, "NotClient");
      await expect(contract.connect(stranger).cancel(1))
        .to.be.revertedWithCustomError(contract, "NotClient");
    });

    it("refuse une fois le travail commence", async function () {
      await createAcceptAndStart(); // InProgress
      await expect(contract.connect(client).cancel(1))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });

    it("refuse un accord deja annule", async function () {
      await create();
      await contract.connect(client).cancel(1);
      await expect(contract.connect(client).cancel(1))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });
  });

  describe("cancelOverdue", function () {
    it("le client annule un accord InProgress apres l'echeance", async function () {
      await createAcceptAndStart();
      await time.increaseTo(deadline + 1);
      await expect(contract.connect(client).cancelOverdue(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 2, 5); // InProgress -> Cancelled
      expect((await contract.getAgreement(1)).status).to.equal(5n);
    });

    it("le client annule un accord Accepted jamais demarre apres l'echeance", async function () {
      await createAndAccept();
      await time.increaseTo(deadline + 1);
      await expect(contract.connect(client).cancelOverdue(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 1, 5); // Accepted -> Cancelled
    });

    it("refuse un appelant autre que le client", async function () {
      await createAcceptAndStart();
      await time.increaseTo(deadline + 1);
      await expect(contract.connect(freelancer).cancelOverdue(1))
        .to.be.revertedWithCustomError(contract, "NotClient");
    });

    it("refuse tant que l'echeance n'est pas depassee", async function () {
      await createAcceptAndStart();
      await expect(contract.connect(client).cancelOverdue(1))
        .to.be.revertedWithCustomError(contract, "DeadlineNotPassed");
    });

    it("refuse si le freelance a deja livre", async function () {
      await createAcceptStartAndDeliver(); // Delivered : le client doit valider ou contester
      await time.increaseTo(deadline + 1);
      await expect(contract.connect(client).cancelOverdue(1))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });
  });

  describe("raiseDispute", function () {
    it("le client ouvre un litige pendant le travail", async function () {
      await createAcceptAndStart();
      await expect(contract.connect(client).raiseDispute(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 2, 6); // InProgress -> Disputed
      expect((await contract.getAgreement(1)).status).to.equal(6n);
    });

    it("le freelance ouvre un litige apres la livraison", async function () {
      await createAcceptStartAndDeliver();
      await expect(contract.connect(freelancer).raiseDispute(1))
        .to.emit(contract, "StatusChanged").withArgs(1, 3, 6); // Delivered -> Disputed
    });

    it("refuse un tiers", async function () {
      await createAcceptAndStart();
      await expect(contract.connect(stranger).raiseDispute(1))
        .to.be.revertedWithCustomError(contract, "NotParty");
    });

    it("refuse avant le debut du travail", async function () {
      await create(); // Created
      await expect(contract.connect(client).raiseDispute(1))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });

    it("refuse apres la validation", async function () {
      await createAcceptStartAndDeliver();
      await contract.connect(client).approveDelivery(1); // Completed
      await expect(contract.connect(freelancer).raiseDispute(1))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });
  });

  describe("resolveDispute", function () {
    let arbiter;

    beforeEach(async function () {
      // L'arbitre est celui qui deploie : on redeploie avec un compte distinct des parties
      [, , , arbiter] = await ethers.getSigners();
      contract = await ethers.deployContract("ServiceAgreement", [], arbiter);
      await createAcceptAndStart();
      await contract.connect(client).raiseDispute(1);
    });

    it("l'arbitre tranche en faveur du freelance : Completed", async function () {
      await expect(contract.connect(arbiter).resolveDispute(1, true))
        .to.emit(contract, "StatusChanged").withArgs(1, 6, 4); // Disputed -> Completed
      expect((await contract.getAgreement(1)).status).to.equal(4n);
    });

    it("l'arbitre tranche en faveur du client : Cancelled", async function () {
      await expect(contract.connect(arbiter).resolveDispute(1, false))
        .to.emit(contract, "StatusChanged").withArgs(1, 6, 5); // Disputed -> Cancelled
      expect((await contract.getAgreement(1)).status).to.equal(5n);
    });

    it("refuse les parties et les tiers", async function () {
      await expect(contract.connect(client).resolveDispute(1, false))
        .to.be.revertedWithCustomError(contract, "NotArbiter");
      await expect(contract.connect(freelancer).resolveDispute(1, true))
        .to.be.revertedWithCustomError(contract, "NotArbiter");
      await expect(contract.connect(stranger).resolveDispute(1, true))
        .to.be.revertedWithCustomError(contract, "NotArbiter");
    });

    it("refuse si l'accord n'est pas en litige", async function () {
      await contract.connect(arbiter).resolveDispute(1, true); // deja tranche
      await expect(contract.connect(arbiter).resolveDispute(1, false))
        .to.be.revertedWithCustomError(contract, "InvalidStatus");
    });
  });

  it("parcours complet : creation jusqu'a la validation", async function () {
    await create();
    await contract.connect(freelancer).acceptAgreement(1);
    await contract.connect(freelancer).startWork(1);
    await contract.connect(freelancer).markDelivered(1);
    await contract.connect(client).approveDelivery(1);
    expect((await contract.getAgreement(1)).status).to.equal(4n); // Completed
  });
});
