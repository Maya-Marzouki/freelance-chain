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

});
