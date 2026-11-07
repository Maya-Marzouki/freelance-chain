// Avance l'horloge du noeud local, pour demontrer le delai d'un litige (3 jours) ou une echeance depassee.
// Usage : npm run time:skip -- 3      (avance de 3 jours, 1 jour par defaut)
const hre = require("hardhat");

async function main() {
  const days = Number(process.env.DAYS || process.argv.find((a, i) => i > 1 && /^\d+(\.\d+)?$/.test(a)) || 1);
  if (!(days > 0)) throw new Error("Nombre de jours invalide");
  await hre.network.provider.send("evm_increaseTime", [Math.round(days * 24 * 3600)]);
  await hre.network.provider.send("evm_mine");
  const block = await hre.ethers.provider.getBlock("latest");
  console.log(`Horloge avancee de ${days} jour(s). Nouveau bloc : ${new Date(block.timestamp * 1000).toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
