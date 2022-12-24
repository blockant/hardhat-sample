const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("AddressRegistry", () => {
  let addressRegistry;

  before(async () => {
    [deployer, oparcade, gameRegistry, maintainer, timelock] = await ethers.getSigners();

    // Initialize AddressRegistry contract
    const AddressRegistry = await ethers.getContractFactory("AddressRegistry");
    addressRegistry = await upgrades.deployProxy(AddressRegistry);
  });

  it("Should be able to update Oparcade...", async () => {
    await addressRegistry.updateOparcade(oparcade.address);
    expect(await addressRegistry.oparcade()).to.equal(oparcade.address);
  });

  it("Should revert if new Oparcade address is address (0)...", async () => {
    await expect(addressRegistry.updateOparcade(ethers.constants.AddressZero)).to.be.revertedWith("!Oparcade");
  });

  it("Should be able to update GameRegistry...", async () => {
    await addressRegistry.updateGameRegistry(gameRegistry.address);
    expect(await addressRegistry.gameRegistry()).to.equal(gameRegistry.address);
  });

  it("Should revert if new GameRegistry address is address (0)...", async () => {
    await expect(addressRegistry.updateGameRegistry(ethers.constants.AddressZero)).to.be.revertedWith("!GameRegistry");
  });

  it("Should be able to update Timelock...", async () => {
    await addressRegistry.updateTimelock(timelock.address);
    expect(await addressRegistry.timelock()).to.equal(timelock.address);
  });

  it("Should revert if new Timelock address is address (0)...", async () => {
    await expect(addressRegistry.updateTimelock(ethers.constants.AddressZero)).to.be.revertedWith("!Timelock");
  });
});
