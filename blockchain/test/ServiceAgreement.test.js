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

  it("parcours complet : creation jusqu'a la validation", async function () {
    await create();
    await contract.connect(freelancer).acceptAgreement(1);
    await contract.connect(freelancer).startWork(1);
    await contract.connect(freelancer).markDelivered(1);
    await contract.connect(client).approveDelivery(1);
    expect((await contract.getAgreement(1)).status).to.equal(4n); // Completed
  });
});
