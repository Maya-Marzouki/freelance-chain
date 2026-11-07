const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Contrats a deployer, dans l'ordre. `args` recoit les adresses deja deployees.
// EscrowMilestones lit ServiceAgreement : il est deploye apres lui et recoit son adresse.
const CONTRACTS = [
  { name: "ServiceAgreement", args: () => [] },
  { name: "EscrowMilestones", args: (deployed) => [deployed.ServiceAgreement] },
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
  console.log(`Adresses et ABI ecrites dans ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
