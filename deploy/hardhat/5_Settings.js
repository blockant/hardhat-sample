const settings = async (hre) => {
  // get contracts
  const addressRegistry = await ethers.getContract('AddressRegistry');
  const gameRegistry = await ethers.getContract('GameRegistry');
  const oparcade = await ethers.getContract('Oparcade');
  const timelock = await ethers.getContract('Timelock');

  // register GameRegistry contract address
  await addressRegistry.updateGameRegistry(gameRegistry.address);

  // register Oparcade contract address
  await addressRegistry.updateOparcade(oparcade.address);

  // register Timelock contract address
  await addressRegistry.updateTimelock(timelock.address);
};
module.exports = settings;
settings.tags = ["Settings"];
settings.dependencies = ["AddressRegistry", "GameRegistry", "Oparcade", "Timelock"];
