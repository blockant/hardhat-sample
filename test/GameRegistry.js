const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("GameRegistry", () => {
  let addressRegistry, gameRegistry, tournamentCreationFeeToken, USDC, ARCD, Arcadian721, Arcadian1155;

  let game1 = "Game1",
    game2 = "Game2";

  const tournamentName = "mock tournament name";
  const paidTournamentCreationFeeAmount = 100;
  const freeTournamentCreationFeeAmount = 0;
  const platformFee = 100; // 10%
  const baseGameCreatorFee = 100; // 10%
  const proposedGameCreatorFee = 150; // 15%
  const tournamentCreatorFee = 250; // 25%

  const ZERO_ADDRESS = ethers.constants.AddressZero;

  beforeEach(async () => {
    [deployer, alice, bob, carol, feeRecipient, token1, token2, token3] = await ethers.getSigners();

    // deploy mock ERC20 tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    tournamentCreationFeeToken = await ERC20Mock.deploy("mockFeeToken", "mockFeeToken");
    USDC = await ERC20Mock.deploy("USDC", "USDC");
    ARCD = await ERC20Mock.deploy("ARCD", "ARCD");

    // deploy mock ERC721 tokens
    const mockERC721 = await ethers.getContractFactory("MockERC721");
    Arcadian721 = await mockERC721.deploy();

    // deploy mock ERC1155 tokens
    const mockERC1155 = await ethers.getContractFactory("MockERC1155");
    Arcadian1155 = await mockERC1155.deploy();

    // Initialize AddressRegistry contract
    const AddressRegistry = await ethers.getContractFactory("AddressRegistry");
    addressRegistry = await upgrades.deployProxy(AddressRegistry);

    // Initialize GameRegistry contract
    const GameRegistry = await ethers.getContractFactory("GameRegistry");
    gameRegistry = await upgrades.deployProxy(GameRegistry, [
      addressRegistry.address,
      feeRecipient.address,
      platformFee,
      tournamentCreationFeeToken.address,
      freeTournamentCreationFeeAmount,
      paidTournamentCreationFeeAmount,
    ]);

    // Initialize Oparcade contract
    const Oparcade = await ethers.getContractFactory("Oparcade");
    oparcade = await upgrades.deployProxy(Oparcade, [addressRegistry.address]);
    // Allow game registry to deposit on opArcade
    const depositorRole = await oparcade.DEPOSITOR_ROLE();
    await oparcade.grantRole(depositorRole, gameRegistry.address);

    // Register the contracts to AddressRegistry
    await addressRegistry.updateGameRegistry(gameRegistry.address);
    await addressRegistry.updateOparcade(oparcade.address);

    // transfer mock ERC20 tokens to the users
    await tournamentCreationFeeToken.transfer(alice.address, 10000000);
    await USDC.transfer(alice.address, 10000000);
    await ARCD.transfer(alice.address, 10000000);

    await tournamentCreationFeeToken.transfer(bob.address, 10000000);
    await USDC.transfer(bob.address, 10000000);
    await ARCD.transfer(bob.address, 10000000);

    // transfer mock ERC721 tokens to the users
    await Arcadian721.mint(alice.address, 0);
    await Arcadian721.mint(alice.address, 1);
    await Arcadian721.mint(alice.address, 2);

    await Arcadian721.mint(bob.address, 4);
    await Arcadian721.mint(bob.address, 5);
    await Arcadian721.mint(bob.address, 6);

    // transfer mock ERC1155 tokens to the users
    await Arcadian1155.mint(alice.address, [0, 1, 2], [10, 10, 10]);
    await Arcadian1155.mint(bob.address, [0, 1, 2], [10, 10, 10]);
  });

  describe("Initialize", () => {
    it("Should revert if feeRecipient address is zero...", async () => {
      const GameRegistry = await ethers.getContractFactory("GameRegistry");
      await expect(
        upgrades.deployProxy(GameRegistry, [
          addressRegistry.address,
          ZERO_ADDRESS,
          platformFee,
          tournamentCreationFeeToken.address,
          freeTournamentCreationFeeAmount,
          paidTournamentCreationFeeAmount,
        ]),
      ).to.be.revertedWith("Fee recipient not set");
    });

    it("Should revert if platformFee is greater than 1000 (100%)...", async () => {
      const GameRegistry = await ethers.getContractFactory("GameRegistry");
      await expect(
        upgrades.deployProxy(GameRegistry, [
          addressRegistry.address,
          feeRecipient.address,
          1001,
          tournamentCreationFeeToken.address,
          freeTournamentCreationFeeAmount,
          paidTournamentCreationFeeAmount,
        ]),
      ).to.be.revertedWith("Platform fee exceeded");
    });
  });

  describe("addGame", () => {
    it("Should be able to add a new game...", async () => {
      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);
      expect(await gameRegistry.getGameName(0)).to.equal(game1);
      expect(await gameRegistry.isGameDeprecated(0)).to.be.false;
      expect(await gameRegistry.gameCount()).to.equal(1);

      // add the second game
      await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);
      expect(await gameRegistry.getGameName(1)).to.equal(game2);
      expect(await gameRegistry.isGameDeprecated(1)).to.be.false;
      expect(await gameRegistry.gameCount()).to.equal(2);
    });

    it("Should revert if the game name is empty...", async () => {
      await expect(gameRegistry.addGame("", alice.address, baseGameCreatorFee)).to.be.revertedWith("Empty game name");
    });

    it("Should revert if the game creator address is zero address...", async () => {
      await expect(gameRegistry.addGame(game1, ZERO_ADDRESS, baseGameCreatorFee)).to.be.revertedWith(
        "Zero game creator address",
      );
    });

    it("Should revert if is missing GAME_MANAGER role...", async () => {
      await expect(gameRegistry.connect(alice).addGame(game1, ZERO_ADDRESS, baseGameCreatorFee)).to.be.revertedWith(
        "Game manager role missing",
      );
    });

    it("Should revert if the base game creator fee is exceeded...", async () => {
      await expect(gameRegistry.addGame(game1, alice.address, 1000)).to.be.revertedWith(
        "Exceeded base game creator fee",
      );
    });
  });

  describe("removeGame", () => {
    beforeEach(async () => {
      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // add the second game
      await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);
    });

    it("Should revert if trying to remove a non-existing game...", async () => {
      const gid = 2;

      // remove the game
      await expect(gameRegistry.removeGame(gid)).to.be.revertedWith("Game not active");
    });

    it("Should be able to remove the game...", async () => {
      const gid = 0;

      // remove the first game
      await gameRegistry.removeGame(gid);
      expect(await gameRegistry.isGameDeprecated(gid)).to.be.true;
      expect(await gameRegistry.getGameName(0)).to.equal(game1);
    });
  });

  describe("updateGameCreator", () => {
    beforeEach(async () => {
      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // add the second game
      await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);
    });

    it("Should be able to update the game creator address...", async () => {
      const gid = 0;

      expect(await gameRegistry.getGameCreatorAddress(gid)).to.equal(alice.address);

      // update the game creator address
      await gameRegistry.connect(alice).updateGameCreator(gid, carol.address);

      // check the game creator address updated
      expect(await gameRegistry.getGameCreatorAddress(gid)).to.equal(carol.address);
    });

    it("Should revert if trying to update the game creator address of the non-existing game...", async () => {
      const gid = 2;

      // update the game creator address
      await expect(gameRegistry.connect(alice).updateGameCreator(gid, carol.address)).to.be.revertedWith(
        "Game not active",
      );
    });

    it("Should revert if msg.sender is not the game creator...", async () => {
      const gid = 0;

      // update the game creator address
      await expect(gameRegistry.connect(bob).updateGameCreator(gid, carol.address)).to.be.revertedWith(
        "Only game creator",
      );
    });

    it("Should revert if the new game creator address is zero...", async () => {
      const gid = 0;

      // update the game creator address
      await expect(gameRegistry.connect(alice).updateGameCreator(gid, ZERO_ADDRESS)).to.be.revertedWith(
        "Zero game creator address",
      );
    });
  });

  describe("updateBaseGameCreatorFee", () => {
    beforeEach(async () => {
      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // add the second game
      await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);
    });

    it("Should be able to update the base game creator fee...", async () => {
      const gid = 0;
      const newGameCreatorFee = 200;

      expect(await gameRegistry.getGameBaseCreatorFee(gid)).to.equal(baseGameCreatorFee);

      // update the game creator address
      await gameRegistry.updateBaseGameCreatorFee(gid, newGameCreatorFee);

      // check the game creator address updated
      expect(await gameRegistry.getGameBaseCreatorFee(gid)).to.equal(newGameCreatorFee);
    });

    it("Should revert if trying to update the base game creator fee of the non-existing game...", async () => {
      const gid = 2;
      const newGameCreatorFee = 200;

      // remove the game
      await expect(gameRegistry.updateBaseGameCreatorFee(gid, newGameCreatorFee)).to.be.revertedWith("Game not active");
    });

    it("Should revert if msg.sender does not nave gama manager role...", async () => {
      const gid = 0;
      const newGameCreatorFee = 200;

      await expect(gameRegistry.connect(alice).updateBaseGameCreatorFee(gid, newGameCreatorFee)).to.be.revertedWith(
        "Game manager role missing",
      );
    });

    it("Should revert if trying to update the base game creator fee is exceeded...", async () => {
      const gid = 0;
      const newGameCreatorFee = 1000;

      // remove the game
      await expect(gameRegistry.updateBaseGameCreatorFee(gid, newGameCreatorFee)).to.be.revertedWith(
        "Exceeded game creator fee",
      );
    });
  });

  describe("createTournamentByDAOWithTokens", () => {
    beforeEach(async () => {
      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // add the second game
      await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);
    });

    it("Should be able to creator the tournament and set tokens...", async () => {
      const gid = 0;
      const depositToken = USDC;
      const depositTokenAmount = 100;
      const distributionToken = USDC;
      const depositToken2 = ARCD;
      const depositTokenAmount2 = 30;

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);
      expect((await gameRegistry.getDistributableTokenList(gid)).length).to.equal(0);
      expect(await gameRegistry.isDistributable(gid, distributionToken.address)).to.be.false;

      const depositorRole = await gameRegistry.TOURNAMENT_MANAGER_ROLE();
      await gameRegistry.grantRole(depositorRole, alice.address);

      // create the first tournament
      let tid = await gameRegistry
        .connect(alice)
        .callStatic.createTournamentByDAOWithTokens(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositToken.address, depositTokenAmount],
          distributionToken.address,
        );
      await gameRegistry.createTournamentByDAOWithTokens(
        gid,
        tournamentName,
        proposedGameCreatorFee,
        tournamentCreatorFee,
        [depositToken.address, depositTokenAmount],
        distributionToken.address,
      );

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(deployer.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);

      expect(await gameRegistry.getDepositTokenAmount(gid, tid, depositToken.address)).to.equal(depositTokenAmount);
      expect((await gameRegistry.getDepositTokenList(gid)).length).to.equal(1);
      expect((await gameRegistry.getDepositTokenList(gid))[0]).to.equal(depositToken.address);

      expect((await gameRegistry.getDistributableTokenList(gid)).length).to.equal(1);
      expect(await gameRegistry.isDistributable(gid, distributionToken.address)).to.be.true;

      // create the second tournament with the zero proposedGameCreatorFee
      const newProposedGameCreatorFee = 0;
      tid = await gameRegistry.callStatic.createTournamentByDAOWithTokens(
        gid,
        tournamentName,
        newProposedGameCreatorFee,
        tournamentCreatorFee,
        [depositToken2.address, depositTokenAmount2],
        distributionToken.address,
      );
      await gameRegistry.createTournamentByDAOWithTokens(
        gid,
        tournamentName,
        newProposedGameCreatorFee,
        tournamentCreatorFee + 1,
        [depositToken2.address, depositTokenAmount2],
        distributionToken.address,
      );

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(2);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(deployer.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(baseGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee + 1);

      expect(await gameRegistry.getDepositTokenAmount(gid, tid, depositToken2.address)).to.equal(depositTokenAmount2);
      expect((await gameRegistry.getDepositTokenList(gid)).length).to.equal(2);
      expect((await gameRegistry.getDepositTokenList(gid))[1]).to.equal(depositToken2.address);

      expect((await gameRegistry.getDistributableTokenList(gid)).length).to.equal(1);
    });
  });

  describe("createTournamentByDAO", () => {
    beforeEach(async () => {
      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // add the second game
      await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);
    });

    it("Should be able to creator the tournament...", async () => {
      const gid = 0;

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);

      // create the first tournament
      let tid = await gameRegistry.callStatic.createTournamentByDAO(
        gid,
        tournamentName,
        proposedGameCreatorFee,
        tournamentCreatorFee,
      );
      await gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee);

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(deployer.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);

      // create the second tournament with the zero proposedGameCreatorFee
      tid = await gameRegistry.callStatic.createTournamentByDAO(gid, tournamentName, 0, tournamentCreatorFee);
      await gameRegistry.createTournamentByDAO(gid, tournamentName, 0, tournamentCreatorFee + 1);

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(2);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(deployer.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(baseGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee + 1);
    });

    it("Revert if msg.sender does not have Tournament manager role...", async () => {
      const gid = 2;

      // create the tournament
      await expect(
        gameRegistry
          .connect(alice)
          .createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee),
      ).to.be.revertedWith("Tournament manager role missing");
    });

    it("Revert if the game doesn't exist...", async () => {
      const gid = 2;

      // create the tournament
      await expect(
        gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee),
      ).to.be.revertedWith("Game not active");
    });

    it("Revert if the proposed game creator fee is less than the base one...", async () => {
      const gid = 0;

      // create the tournament
      await expect(
        gameRegistry.createTournamentByDAO(gid, tournamentName, baseGameCreatorFee - 1, tournamentCreatorFee),
      ).to.be.revertedWith("Low game creator fee proposed");
    });

    it("Revert if total fee is equal to or greater than 100%...", async () => {
      const gid = 0;

      // create the tournament
      await expect(
        gameRegistry.createTournamentByDAO(gid, tournamentName, 1000, tournamentCreatorFee),
      ).to.be.revertedWith("Exceeded fees");
    });

    it("Should revert if is missing TOURNAMENT_MANAGER role...", async () => {
      await expect(
        gameRegistry.connect(alice).createTournamentByDAO(0, tournamentName, 10, tournamentCreatorFee),
      ).to.be.revertedWith("Tournament manager role missing");
    });
  });

  describe("createTournamentByUser", () => {
    beforeEach(async () => {
      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // add the second game
      await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);
    });

    it("Should be able to create the tournament with ERC20 prize pool only, non-zero deposit amount and transfer paid creation fee amount...", async () => {
      const gid = 0;
      const depositTokenAddress = USDC;
      const depositTokenAmount = 100;
      const tokenToAddPrizePool = ARCD;
      const amountToAddPrizePool = 10000;
      const nftAddressToAddPrizePool = ZERO_ADDRESS;
      const nftTypeToAddPrizePool = 0;
      const tokenIdsToAddPrizePool = [];
      const amountsToAddPrizePool = [];
      const paidTournamentCreationFeeAmount = 10;

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);

      await gameRegistry.updatePaidTournamentCreationFeeAmount(paidTournamentCreationFeeAmount);

      const depositorRole = await oparcade.DEPOSITOR_ROLE();
      await oparcade.grantRole(depositorRole, alice.address);

      // approve tournamentCreationFeeToken and prize tokens to GameRegistry
      await tournamentCreationFeeToken.connect(alice).approve(gameRegistry.address, paidTournamentCreationFeeAmount);
      await tokenToAddPrizePool.connect(alice).approve(oparcade.address, amountToAddPrizePool);

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);

      let balanceRecipient = await tournamentCreationFeeToken.balanceOf(feeRecipient.address);
      expect(balanceRecipient).to.be.equal(0);

      // create the first tournament with ERC20
      let tid = await gameRegistry
        .connect(alice)
        .callStatic.createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      await gameRegistry
        .connect(alice)
        .createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(alice.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);
    });

    it("Should be able to create the tournament with ERC20 prize pool only, zero deposit amount and and transfer free creation fee amount...", async () => {
      const gid = 0;
      const depositTokenAddress = USDC;
      const depositTokenAmount = 0;
      const tokenToAddPrizePool = ARCD;
      const amountToAddPrizePool = 10000;
      const nftAddressToAddPrizePool = ZERO_ADDRESS;
      const nftTypeToAddPrizePool = 0;
      const tokenIdsToAddPrizePool = [];
      const amountsToAddPrizePool = [];
      const freeTournamentCreationFeeAmount = 5;

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);

      let balanceRecipient = await tournamentCreationFeeToken.balanceOf(feeRecipient.address);
      expect(balanceRecipient).to.be.equal(0);

      await gameRegistry.updateFreeTournamentCreationFeeAmount(freeTournamentCreationFeeAmount);

      const depositorRole = await oparcade.DEPOSITOR_ROLE();
      await oparcade.grantRole(depositorRole, alice.address);

      // approve tournamentCreationFeeToken and prize tokens to GameRegistry
      await tournamentCreationFeeToken.connect(alice).approve(gameRegistry.address, freeTournamentCreationFeeAmount);
      await tokenToAddPrizePool.connect(alice).approve(oparcade.address, amountToAddPrizePool);

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);

      // create the first tournament with ERC20
      let tid = await gameRegistry
        .connect(alice)
        .callStatic.createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      await gameRegistry
        .connect(alice)
        .createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      balanceRecipient = await tournamentCreationFeeToken.balanceOf(feeRecipient.address);
      expect(balanceRecipient).to.be.equal(freeTournamentCreationFeeAmount);

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(alice.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);
    });

    it("Should be able to create the tournament with ERC721 prize pool only...", async () => {
      const gid = 0;
      const depositTokenAddress = USDC;
      const depositTokenAmount = 100;
      const tokenToAddPrizePool = ZERO_ADDRESS;
      const amountToAddPrizePool = 0;
      const nftAddressToAddPrizePool = Arcadian721;
      const nftTypeToAddPrizePool = 721;
      const tokenIdsToAddPrizePool = [0, 1, 2];
      const amountsToAddPrizePool = [1, 1, 1];

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[0])).to.equal(alice.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[1])).to.equal(alice.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[2])).to.equal(alice.address);

      // approve tournamentCreationFeeToken and prize tokens to GameRegistry
      await tournamentCreationFeeToken.connect(alice).approve(gameRegistry.address, paidTournamentCreationFeeAmount);
      await nftAddressToAddPrizePool.connect(alice).approve(oparcade.address, tokenIdsToAddPrizePool[0]);
      await nftAddressToAddPrizePool.connect(alice).approve(oparcade.address, tokenIdsToAddPrizePool[1]);
      await nftAddressToAddPrizePool.connect(alice).approve(oparcade.address, tokenIdsToAddPrizePool[2]);
      // // create the first tournament with ERC721
      let tid = await gameRegistry
        .connect(alice)
        .callStatic.createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool, amountToAddPrizePool],
          nftAddressToAddPrizePool.address,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );
      await gameRegistry
        .connect(alice)
        .createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool, amountToAddPrizePool],
          nftAddressToAddPrizePool.address,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(alice.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[0])).to.equal(oparcade.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[1])).to.equal(oparcade.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[2])).to.equal(oparcade.address);
    });

    it("Should be able to create the tournament with ERC20 and ERC721 prize pools...", async () => {
      const gid = 0;
      const depositTokenAddress = USDC;
      const depositTokenAmount = 100;
      const tokenToAddPrizePool = ARCD;
      const amountToAddPrizePool = 10000;
      const nftAddressToAddPrizePool = Arcadian721;
      const nftTypeToAddPrizePool = 721;
      const tokenIdsToAddPrizePool = [0, 1, 2];
      const amountsToAddPrizePool = [1, 1, 1];

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[0])).to.equal(alice.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[1])).to.equal(alice.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[2])).to.equal(alice.address);

      // approve tournamentCreationFeeToken and prize tokens to GameRegistry
      await tournamentCreationFeeToken.connect(alice).approve(gameRegistry.address, paidTournamentCreationFeeAmount);
      await tokenToAddPrizePool.connect(alice).approve(oparcade.address, amountToAddPrizePool);
      await nftAddressToAddPrizePool.connect(alice).approve(oparcade.address, tokenIdsToAddPrizePool[0]);
      await nftAddressToAddPrizePool.connect(alice).approve(oparcade.address, tokenIdsToAddPrizePool[1]);
      await nftAddressToAddPrizePool.connect(alice).approve(oparcade.address, tokenIdsToAddPrizePool[2]);

      // create the first tournament with ERC20 and ERC721
      let tid = await gameRegistry
        .connect(alice)
        .callStatic.createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool.address,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );
      await gameRegistry
        .connect(alice)
        .createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool.address,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(alice.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[0])).to.equal(oparcade.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[1])).to.equal(oparcade.address);
      expect(await Arcadian721.ownerOf(tokenIdsToAddPrizePool[2])).to.equal(oparcade.address);
    });

    it("Should be able to create the tournament with ERC20 and ERC1155 prize pools...", async () => {
      const gid = 0;
      const depositTokenAddress = ARCD;
      const depositTokenAmount = 100;
      const tokenToAddPrizePool = ARCD;
      const amountToAddPrizePool = 10000;
      const nftAddressToAddPrizePool = Arcadian1155;
      const nftTypeToAddPrizePool = 1155;
      const tokenIdsToAddPrizePool = [0, 1, 2];
      const amountsToAddPrizePool = [3, 3, 3];

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);
      expect(await Arcadian1155.balanceOf(alice.address, tokenIdsToAddPrizePool[0])).to.equal(10);
      expect(await Arcadian1155.balanceOf(alice.address, tokenIdsToAddPrizePool[1])).to.equal(10);
      expect(await Arcadian1155.balanceOf(alice.address, tokenIdsToAddPrizePool[2])).to.equal(10);

      // approve tournamentCreationFeeToken and prize tokens to GameRegistry
      await tournamentCreationFeeToken.connect(alice).approve(gameRegistry.address, paidTournamentCreationFeeAmount);
      await tokenToAddPrizePool.connect(alice).approve(oparcade.address, amountToAddPrizePool);
      await nftAddressToAddPrizePool.connect(alice).setApprovalForAll(oparcade.address, true);

      // create the first tournament with ERC20 and ERC1155
      let tid = await gameRegistry
        .connect(alice)
        .callStatic.createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool.address,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );
      await gameRegistry
        .connect(alice)
        .createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool.address,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      // check the created tournament info
      const initialNFTBalance = 10;

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(alice.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);
      expect(await Arcadian1155.balanceOf(alice.address, tokenIdsToAddPrizePool[0])).to.equal(
        initialNFTBalance - amountsToAddPrizePool[0],
      );
      expect(await Arcadian1155.balanceOf(alice.address, tokenIdsToAddPrizePool[1])).to.equal(
        initialNFTBalance - amountsToAddPrizePool[1],
      );
      expect(await Arcadian1155.balanceOf(alice.address, tokenIdsToAddPrizePool[2])).to.equal(
        initialNFTBalance - amountsToAddPrizePool[2],
      );
      expect(await Arcadian1155.balanceOf(oparcade.address, tokenIdsToAddPrizePool[0])).to.equal(
        amountsToAddPrizePool[0],
      );
      expect(await Arcadian1155.balanceOf(oparcade.address, tokenIdsToAddPrizePool[1])).to.equal(
        amountsToAddPrizePool[1],
      );
      expect(await Arcadian1155.balanceOf(oparcade.address, tokenIdsToAddPrizePool[2])).to.equal(
        amountsToAddPrizePool[2],
      );
    });

    it("Should not update the deposit token if the deposit token to be used was already registered...", async () => {
      const gid = 0;
      const depositTokenAddress = USDC;
      const depositTokenAmount = 100;
      const tokenToAddPrizePool = ARCD;
      const amountToAddPrizePool = 10000;
      const nftAddressToAddPrizePool = ZERO_ADDRESS;
      const nftTypeToAddPrizePool = 0;
      const tokenIdsToAddPrizePool = [];
      const amountsToAddPrizePool = [];

      expect(await gameRegistry.getTournamentCount(gid)).to.equal(0);

      // register deposit token as a distributable one
      await gameRegistry.updateDistributableTokenAddress(gid, depositTokenAddress.address, true);

      // approve tournamentCreationFeeToken and prize tokens to GameRegistry
      await tournamentCreationFeeToken.connect(alice).approve(gameRegistry.address, paidTournamentCreationFeeAmount);
      await tokenToAddPrizePool.connect(alice).approve(oparcade.address, amountToAddPrizePool);

      // create the first tournament with ERC20
      let tid = await gameRegistry
        .connect(alice)
        .callStatic.createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );
      await gameRegistry
        .connect(alice)
        .createTournamentByUser(
          gid,
          tournamentName,
          proposedGameCreatorFee,
          tournamentCreatorFee,
          [depositTokenAddress.address, depositTokenAmount],
          [tokenToAddPrizePool.address, amountToAddPrizePool],
          nftAddressToAddPrizePool,
          nftTypeToAddPrizePool,
          tokenIdsToAddPrizePool,
          amountsToAddPrizePool,
        );

      // check the created tournament info
      expect(await gameRegistry.getTournamentCount(gid)).to.equal(1);
      expect(await gameRegistry.getTournamentName(gid, tid)).to.equal(tournamentName);
      expect(await gameRegistry.getTournamentCreator(gid, tid)).to.equal(alice.address);
      expect(await gameRegistry.getAppliedGameCreatorFee(gid, tid)).to.equal(proposedGameCreatorFee);
      expect(await gameRegistry.getTournamentCreatorFee(gid, tid)).to.equal(tournamentCreatorFee);
    });
  });

  describe("updateDepositTokenAmount", () => {
    beforeEach(async () => {
      const gid = 0;

      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // create the 2 tournaments
      await gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee);
      await gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee);
    });

    it("Should be able to update the deposit token...", async () => {
      const gid = 0;
      const tid0 = 0;
      const tid1 = 1;
      let getDepositTokenList = [];
      const token1_amount = 100;
      const token2_amount = 200;

      // add token1
      await gameRegistry.updateDepositTokenAmount(gid, tid0, token1.address, token1_amount);

      expect(await gameRegistry.getDepositTokenAmount(gid, tid0, token1.address)).to.equal(token1_amount);
      expect((await gameRegistry.getDepositTokenList(gid)).length).to.equal(1);
      expect((await gameRegistry.getDepositTokenList(gid))[0]).to.equal(token1.address);

      // update token1
      const new_token1_amount = 300;
      await gameRegistry.updateDepositTokenAmount(gid, tid0, token1.address, new_token1_amount);

      expect(await gameRegistry.getDepositTokenAmount(gid, tid0, token1.address)).to.equal(new_token1_amount);
      expect((await gameRegistry.getDepositTokenList(gid)).length).to.equal(1);
      expect((await gameRegistry.getDepositTokenList(gid))[0]).to.equal(token1.address);

      // add token2
      await gameRegistry.updateDepositTokenAmount(gid, tid1, token2.address, token2_amount);

      expect(await gameRegistry.getDepositTokenAmount(gid, tid1, token2.address)).to.equal(token2_amount);
      expect((await gameRegistry.getDepositTokenList(gid)).length).to.equal(2);
      expect((await gameRegistry.getDepositTokenList(gid))[1]).to.equal(token2.address);

      // remove token1
      await gameRegistry.updateDepositTokenAmount(gid, tid1, token1.address, 0);

      expect(await gameRegistry.getDepositTokenAmount(gid, tid1, token1.address)).to.equal(0);
      expect((await gameRegistry.getDepositTokenList(gid)).length).to.equal(1);
      expect((await gameRegistry.getDepositTokenList(gid))[0]).to.equal(token2.address);

      // remove token3 (unavailable token)
      await gameRegistry.updateDepositTokenAmount(gid, tid1, token3.address, 0);

      expect(await gameRegistry.getDepositTokenAmount(gid, tid1, token3.address)).to.equal(0);
      expect((await gameRegistry.getDepositTokenList(gid)).length).to.equal(1);
      expect((await gameRegistry.getDepositTokenList(gid))[0]).to.equal(token2.address);
    });

    it("Should revert if tournament ID is invalid...", async () => {
      const gid = 0;
      const tid0 = 3;
      const token1_amount = 100;

      // add token1
      await expect(gameRegistry.updateDepositTokenAmount(gid, tid0, token1.address, token1_amount)).to.be.revertedWith(
        "Invalid tournament index",
      );
    });
  });

  describe("updateDistributableTokenAddress", () => {
    beforeEach(async () => {
      const gid = 0;

      // add the first game
      await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);

      // create the 2 tournaments
      await gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee);
      await gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee);
    });

    it("Should be able to update the distributable token...", async () => {
      const gid = 0;

      // add token1
      await gameRegistry.updateDistributableTokenAddress(gid, token1.address, true);

      expect((await gameRegistry.getDistributableTokenList(gid)).length).to.equal(1);
      expect(await gameRegistry.isDistributable(gid, token1.address)).to.be.true;

      // update token1
      await gameRegistry.updateDistributableTokenAddress(gid, token1.address, true);

      expect((await gameRegistry.getDistributableTokenList(gid)).length).to.equal(1);
      expect(await gameRegistry.isDistributable(gid, token1.address)).to.be.true;

      // add token2
      await gameRegistry.updateDistributableTokenAddress(gid, token2.address, true);

      expect((await gameRegistry.getDistributableTokenList(gid)).length).to.equal(2);
      expect(await gameRegistry.isDistributable(gid, token2.address)).to.be.true;

      // remove token2
      await gameRegistry.updateDistributableTokenAddress(gid, token2.address, false);

      expect((await gameRegistry.getDistributableTokenList(gid)).length).to.equal(1);
      expect(await gameRegistry.isDistributable(gid, token2.address)).to.be.false;
    });
  });

  describe("updatePlatformFee", () => {
    it("Should be able to update platform fee and recipient...", async () => {
      // new fee recipient
      const newFeeRecipient = bob.address;

      // new platform fee
      const newPlatformFee = 100;

      // change platform fee and recipient
      await gameRegistry.updatePlatformFee(newFeeRecipient, newPlatformFee);

      // check new platform fee
      expect(await gameRegistry.platformFee()).to.equal(newPlatformFee);

      // check new fee recipient
      expect(await gameRegistry.feeRecipient()).to.equal(newFeeRecipient);
    });

    it("Should revert if platformFee > 1000 (100%)...", async () => {
      // New platform fee
      const newPlatformFee = 1001;

      // Should revert with "platform fee exceeded"
      await expect(gameRegistry.updatePlatformFee(feeRecipient.address, newPlatformFee)).to.be.revertedWith(
        "Platform fee exceeded",
      );
    });

    it("Fail to initialize, platformFee > 0 , feeRecipient == address (0), should revert...", async () => {
      // change platform fee and recipient
      await expect(gameRegistry.updatePlatformFee(ethers.constants.AddressZero, platformFee)).to.be.revertedWith(
        "Fee recipient not set",
      );
    });

    it("Fail to initialize, platformFee > 1000 (100%), should revert...", async () => {
      // new platform fee
      const newPlatformFee = 1001;

      // change platform fee and recipient
      await expect(gameRegistry.updatePlatformFee(feeRecipient.address, newPlatformFee)).to.be.revertedWith(
        "Platform fee exceeded",
      );
    });
  });

  describe("updateTournamentCreationFee", () => {
    it("Should be able to update tournamentCreationFeeToken fee and paidTournamentCreationFeeAmount...", async () => {
      // new tournament creation fee token
      const newTournamentCreationFeeToken = USDC.address;

      // new tournament creation fee amount
      const newFreeTournamentCreationFeeAmount = 10;
      const newPaidTournamentCreationFeeAmount = 80;

      expect(await gameRegistry.tournamentCreationFeeToken()).to.equal(tournamentCreationFeeToken.address);
      expect(await gameRegistry.paidTournamentCreationFeeAmount()).to.equal(paidTournamentCreationFeeAmount);
      expect(await gameRegistry.freeTournamentCreationFeeAmount()).to.equal(freeTournamentCreationFeeAmount);

      // update tournament creation fee token and amount
      await gameRegistry.updateTournamentCreationFeeToken(newTournamentCreationFeeToken);
      await gameRegistry.updateFreeTournamentCreationFeeAmount(newFreeTournamentCreationFeeAmount);
      await gameRegistry.updatePaidTournamentCreationFeeAmount(newPaidTournamentCreationFeeAmount);

      // check tournament creation fee token and amount
      expect(await gameRegistry.paidTournamentCreationFeeAmount()).to.equal(newPaidTournamentCreationFeeAmount);
      expect(await gameRegistry.freeTournamentCreationFeeAmount()).to.equal(newFreeTournamentCreationFeeAmount);
    });

    it("Should revert if tournamentCreationToken address is 0...", async () => {
      // new tournament creation fee token
      const newTournamentCreationFeeToken = ZERO_ADDRESS;

      // update tournament creation fee token and amount
      await expect(gameRegistry.updateTournamentCreationFeeToken(newTournamentCreationFeeToken)).to.be.revertedWith(
        "Zero tournament creation fee token",
      );
    });
  });
});
