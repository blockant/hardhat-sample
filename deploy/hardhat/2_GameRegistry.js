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
          args: [addressRegistry.address, feeRecipient, process.env.PLATFORM_FEE, process.env.TOURMANET_CREATION_FEE_TOKEN_ADDRESS, process.env.TOURMANET_CREATION_FEE_TOKEN_AMOUNT],
        },
      },
    },
  });
};
module.exports = deployGameRegistry;
deployGameRegistry.tags = ["GameRegistry"];
