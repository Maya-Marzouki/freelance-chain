const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Les contrats a deployer. Le binome ajoute ici son contrat (ex: "EscrowMilestones").
const CONTRACTS = ["ServiceAgreement", "EscrowMilestones"];
async function main() {
  const outDir = path.join(__dirname, "..", "..", "frontend", "src", "contracts");
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of CONTRACTS) {
    const contract = await hre.ethers.deployContract(name);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
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
