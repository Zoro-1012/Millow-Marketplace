const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
}

async function main() {
  const [buyer, seller, inspector, lender] = await ethers.getSigners()
  const network = await ethers.provider.getNetwork()

  const RealEstate = await ethers.getContractFactory('RealEstate')
  const realEstate = await RealEstate.deploy()
  await realEstate.deployed()

  console.log(`Deployed Real Estate Contract at: ${realEstate.address}`)
  console.log(`Minting 3 properties...\n`)

  for (let i = 0; i < 3; i++) {
    const metadataPath = path.join(__dirname, '..', 'metadata', `${i + 1}.json`)
    const metadata = fs.readFileSync(metadataPath, 'utf8')
    const tokenURI = `data:application/json;charset=utf-8,${encodeURIComponent(metadata)}`
    const transaction = await realEstate.connect(seller).mint(tokenURI)
    await transaction.wait()
  }

  const Escrow = await ethers.getContractFactory('Escrow')
  const escrow = await Escrow.deploy(
    realEstate.address,
    inspector.address,
    lender.address
  )
  await escrow.deployed()

  console.log(`Deployed Escrow Contract at: ${escrow.address}`)
  console.log(`Listing 3 properties...\n`)

  for (let i = 0; i < 3; i++) {
    let transaction = await realEstate.connect(seller).approve(escrow.address, i + 1)
    await transaction.wait()
  }

  let transaction = await escrow.connect(seller).list(1, tokens(20), tokens(10))
  await transaction.wait()

  transaction = await escrow.connect(seller).list(2, tokens(15), tokens(5))
  await transaction.wait()

  transaction = await escrow.connect(seller).list(3, tokens(10), tokens(5))
  await transaction.wait()

  transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(10) })
  await transaction.wait()

  const configPath = path.join(__dirname, '..', 'src', 'config.json')
  const config = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : {}

  config[network.chainId] = {
    realEstate: { address: realEstate.address },
    escrow: { address: escrow.address }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
  console.log(`Updated frontend config for chain ${network.chainId}`)

  console.log(`Finished.`)
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
