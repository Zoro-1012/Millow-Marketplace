require("@nomicfoundation/hardhat-toolbox");

const { SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.17",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    ...(SEPOLIA_RPC_URL
      ? {
          sepolia: {
            url: SEPOLIA_RPC_URL,
            accounts,
          },
        }
      : {}),
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
