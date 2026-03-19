const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), "ether");
};

async function main() {
  console.log("\n🚀 Starting Deployment...\n");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const network = await ethers.provider.getNetwork();

  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`🌐 Network: ${network.name} (${network.chainId})\n`);

  const seller = deployer;
  const buyer = signers[1] ? signers[1] : deployer;

  const inspectorAddress =
    process.env.INSPECTOR_ADDRESS || deployer.address;
  const lenderAddress =
    process.env.LENDER_ADDRESS || deployer.address;

  // Deploy RealEstate
  console.log("🏠 Deploying RealEstate contract...");
  const RealEstate = await ethers.getContractFactory("RealEstate");
  const realEstate = await RealEstate.deploy();
  await realEstate.deployed();

  console.log(`✅ RealEstate deployed at: ${realEstate.address}\n`);

  // Mint NFTs
  console.log("🎨 Minting properties...\n");

  for (let i = 0; i < 3; i++) {
    const metadataPath = path.join(__dirname, "..", "metadata", `${i + 1}.json`);

    if (!fs.existsSync(metadataPath)) {
      throw new Error(`❌ Missing metadata file: ${metadataPath}`);
    }

    const metadata = fs.readFileSync(metadataPath, "utf8");
    const tokenURI = `data:application/json;charset=utf-8,${encodeURIComponent(metadata)}`;

    const tx = await realEstate.connect(seller).mint(tokenURI);
    await tx.wait();

    console.log(`✅ Minted Property #${i + 1}`);
  }

  // Deploy Escrow
  console.log("\n💰 Deploying Escrow contract...");
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(
    realEstate.address,
    inspectorAddress,
    lenderAddress
  );
  await escrow.deployed();

  console.log(`✅ Escrow deployed at: ${escrow.address}\n`);

  // Approve & List
  console.log("📜 Approving & Listing properties...\n");

  for (let i = 0; i < 3; i++) {
    let tx = await realEstate.connect(seller).approve(escrow.address, i + 1);
    await tx.wait();
  }

  let tx = await escrow.connect(seller).list(1, tokens(20), tokens(10));
  await tx.wait();

  tx = await escrow.connect(seller).list(2, tokens(15), tokens(5));
  await tx.wait();

  tx = await escrow.connect(seller).list(3, tokens(10), tokens(5));
  await tx.wait();

  console.log("✅ Properties listed successfully");

  // Optional Earnest Deposit
  if (signers[1]) {
    console.log("\n💳 Depositing earnest...");
    tx = await escrow.connect(buyer).depositEarnest(1, { value: tokens(10) });
    await tx.wait();
  }

  // Update Frontend Config
  const configPath = path.join(__dirname, "..", "src", "config.json");

  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  config[network.chainId] = {
    realEstate: { address: realEstate.address },
    escrow: { address: escrow.address },
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

  console.log(`\n🧩 Frontend config updated`);
  console.log(`🕵️ Inspector: ${inspectorAddress}`);
  console.log(`🏦 Lender: ${lenderAddress}`);

  console.log("\n🎉 Deployment Finished Successfully!\n");
}

main().catch((error) => {
  console.error("❌ Deployment Failed:");
  console.error(error);
  process.exitCode = 1;
});