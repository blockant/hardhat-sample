const { config: dotenvConfig } = require("dotenv");
const env = require("hardhat");
const path = require("path");

dotenvConfig({ path: path.resolve(__dirname, "../.env") });

const deployTimelock = async (hre) => {
  const { deploy } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  
  await deploy("Timelock", {
    from: deployer,
    args: [process.env.TIMELOCK_MIN_DELAY, process.env.TIMELOCK_ADMIN, process.env.TIMELOCK_PROPOSERS.split(","), process.env.TIMELOCK_EXECUTORS.split(",")],
    log: true,
  });
};
module.exports = deployTimelock;
deployTimelock.tags = ["Timelock"];
