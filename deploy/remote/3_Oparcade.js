const { config: dotenvConfig } = require("dotenv");
const path = require("path");

dotenvConfig({ path: path.resolve(__dirname, "../.env") });

const deployOparcade = async (hre) => {
  const { deploy } = hre.deployments;
  const { deployer } = await getNamedAccounts();

  // get contracts
  const addressRegistry = await hre.deployments.get('AddressRegistry');

  await deploy("Oparcade", {
    from: deployer,
    args: [],
    log: true,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      viaAdminContract: "DefaultProxyAdmin",
      execute: {
        init: {
          methodName: "initialize",
          args: [addressRegistry.address],
        },
      },
    },
  });
};
module.exports = deployOparcade;
deployOparcade.tags = ["Oparcade"];
deployOparcade.dependencies = ["AddressRegistry"];
