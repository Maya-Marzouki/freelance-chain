const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Contrats a deployer, dans l'ordre. `args` recoit les adresses deja deployees.
// EscrowMilestones lit ServiceAgreement : il est deploye apres lui et recoit son adresse.
const CONTRACTS = [
  { name: "ServiceAgreement", args: () => [] },
  { name: "EscrowMilestones", args: (deployed) => [deployed.ServiceAgreement] },
  // ReputationToken lit A et B pour savoir si une mission est terminee et payee.
  {
    name: "ReputationToken",
    args: (deployed) => [deployed.ServiceAgreement, deployed.EscrowMilestones],
  },
];

async function main() {
  const outDir = path.join(__dirname, "..", "..", "frontend", "src", "contracts");
  fs.mkdirSync(outDir, { recursive: true });

  const deployed = {};
  for (const { name, args } of CONTRACTS) {
    const contract = await hre.ethers.deployContract(name, args(deployed));
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    deployed[name] = address;
    console.log(`${name} deploye a ${address}`);

    const artifact = await hre.artifacts.readArtifact(name);
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      JSON.stringify({ address, abi: artifact.abi }, null, 2)
    );
  }
  // A et B se connaissent : B lit A (constructeur), A appelle B (startWork exige un escrow
  // finance, la fin de l'accord solde l'escrow). Le lien A -> B est pose une seule fois.
  const agreement = await hre.ethers.getContractAt("ServiceAgreement", deployed.ServiceAgreement);
  await (await agreement.setEscrowContract(deployed.EscrowMilestones)).wait();
  console.log("ServiceAgreement relie a EscrowMilestones");

  console.log(`Adresses et ABI ecrites dans ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
