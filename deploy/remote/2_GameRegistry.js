const { config: dotenvConfig } = require("dotenv");
const { getNamedAccounts } = require("hardhat");
const path = require("path");

dotenvConfig({ path: path.resolve(__dirname, "../.env") });

const deployGameRegistry = async (hre) => {
  const { deploy } = hre.deployments;
  const { deployer, feeRecipient } = await getNamedAccounts();

  // get contracts
  const addressRegistry = await hre.deployments.get('AddressRegistry');

  await deploy("GameRegistry", {
    from: deployer,
    args: [],
    log: true,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      viaAdminContract: "DefaultProxyAdmin",
      execute: {
        init: {
          methodName: "initialize",
          args: [addressRegistry.address, process.env.MUMBAI_FEE_RECIPIENT_ADDRESS, process.env.PLATFORM_FEE, process.env.TOURMANET_CREATION_FEE_TOKEN_ADDRESS, process.env.FREE_TOURMANET_CREATION_FEE_TOKEN_AMOUNT, process.env.PAID_TOURMANET_CREATION_FEE_TOKEN_AMOUNT],
        },
      },
    },
  });
};
module.exports = deployGameRegistry;
deployGameRegistry.tags = ["GameRegistry"];
