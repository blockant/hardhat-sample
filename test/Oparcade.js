const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Oparcade", () => {
  let addressRegistry, gameRegistry, oparcade, mockUSDT, mockOPC;

  let game1 = "Game1",
    game2 = "Game2";

  const tournamentName = "mock tournament name";
  const freeTournamentCreationFeeAmount = 0;
  const paidTournamentCreationFeeAmount = 100;
  const platformFee = 100; // 10%
  const baseGameCreatorFee = 100; // 10%
  const proposedGameCreatorFee = 150; // 15%
  const tournamentCreatorFee = 250; // 25%

  const MockUSDTDepositAmount = 10000,
    mockOPCDepositAmount = 50000;

  const ZERO_ADDRESS = ethers.constants.AddressZero;

  beforeEach(async () => {
    [deployer, alice, bob, distributor, feeRecipient] = await ethers.getSigners();

    // deploy mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const MockERC1155 = await ethers.getContractFactory("MockERC1155");
    mockUSDT = await ERC20Mock.deploy("mockUSDT", "mockUSDT");
    mockOPC = await ERC20Mock.deploy("mockOPC", "mockOPC");
    mockERC721 = await MockERC721.deploy();
    mockERC1155 = await MockERC1155.deploy();

    // Initialize AddressRegistry contract
    const AddressRegistry = await ethers.getContractFactory("AddressRegistry");
    addressRegistry = await upgrades.deployProxy(AddressRegistry);

    // Initialize GameRegistry contract
    const GameRegistry = await ethers.getContractFactory("GameRegistry");
    gameRegistry = await upgrades.deployProxy(GameRegistry, [
      addressRegistry.address,
      feeRecipient.address,
      platformFee,
      mockOPC.address,
      freeTournamentCreationFeeAmount,
      paidTournamentCreationFeeAmount,
    ]);

    // Initialize Oparcade contract
    const Oparcade = await ethers.getContractFactory("Oparcade");
    oparcade = await upgrades.deployProxy(Oparcade, [addressRegistry.address]);
    // Allow game registry to deposit on opArcade
    const distributorRole = await oparcade.DISTRIBUTOR_ROLE();
    await oparcade.grantRole(distributorRole, distributor.address);

    // register the contract addresses and distributor to the AddressRegistery
    await addressRegistry.updateOparcade(oparcade.address);
    await addressRegistry.updateGameRegistry(gameRegistry.address);

    // add games
    await gameRegistry.addGame(game1, alice.address, baseGameCreatorFee);
    await gameRegistry.addGame(game2, bob.address, baseGameCreatorFee);

    // create tournaments, Set deposit token amount and distributable tokens for games/tournaments
    let gid = 0;
    let tid = await gameRegistry.callStatic.createTournamentByDAO(
      gid,
      tournamentName,
      proposedGameCreatorFee,
      tournamentCreatorFee,
    );
    await gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee); // tid = 0
    await gameRegistry.updateDepositTokenAmount(gid, tid, mockUSDT.address, MockUSDTDepositAmount);
    await gameRegistry.updateDistributableTokenAddress(gid, mockUSDT.address, true);
    gid = 1;
    tid = await gameRegistry.callStatic.createTournamentByDAO(
      gid,
      tournamentName,
      proposedGameCreatorFee,
      tournamentCreatorFee,
    ); // tid = 0
    await gameRegistry.createTournamentByDAO(gid, tournamentName, proposedGameCreatorFee, tournamentCreatorFee);
    await gameRegistry.updateDepositTokenAmount(gid, tid, mockOPC.address, mockOPCDepositAmount);
    await gameRegistry.updateDistributableTokenAddress(gid, mockOPC.address, true);

    // Initial mock token distribution
    const initAmount = 10000000;
    await mockUSDT.transfer(alice.address, initAmount);
    await mockUSDT.transfer(bob.address, initAmount);
    await mockOPC.transfer(alice.address, initAmount);
    await mockOPC.transfer(bob.address, initAmount);
    await mockERC721.mint(deployer.address, 1);
    await mockERC721.mint(deployer.address, 2);
    await mockERC721.mint(deployer.address, 3);
    await mockERC1155.mint(deployer.address, [1, 2, 3], [3, 3, 3]);
  });

  describe("Initialize", () => {
    it("Fail to initialize, addressRegistry == address (0), should revert...", async () => {
      // Initialize Oparcade contract
      const Oparcade = await ethers.getContractFactory("Oparcade");
      await expect(upgrades.deployProxy(Oparcade, [ZERO_ADDRESS])).to.be.revertedWith("Invalid AddressRegistry");
    });
  });

  describe("deposit", () => {
    it("Should be able to deposit tokens...", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // check initial mockUSDT balance
      expect(await mockUSDT.balanceOf(oparcade.address)).to.equal(0);

      // deposit mockUSDT tokens
      await mockUSDT.connect(alice).approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.connect(alice).deposit(gid, tid, mockUSDT.address);

      // check balances
      expect(await mockUSDT.balanceOf(oparcade.address)).to.equal(MockUSDTDepositAmount);

      // set new gid
      gid = 1;

      // check initial mockOPC balance
      expect(await mockOPC.balanceOf(oparcade.address)).to.equal(0);

      // deposit mockOPC tokens
      await mockOPC.connect(alice).approve(oparcade.address, mockOPCDepositAmount);
      await oparcade.connect(alice).deposit(gid, tid, mockOPC.address);

      // check balances
      expect(await mockOPC.balanceOf(oparcade.address)).to.equal(mockOPCDepositAmount);
    });

    it("Should be ablt to deposit correct amounts even though approving more tokens", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // check initial mockUSDT balance
      expect(await mockUSDT.balanceOf(oparcade.address)).to.equal(0);

      // deposit mockUSDT tokens
      await mockUSDT.connect(alice).approve(oparcade.address, MockUSDTDepositAmount + 1);
      await oparcade.connect(alice).deposit(gid, tid, mockUSDT.address);

      // check balances
      expect(await mockUSDT.balanceOf(oparcade.address)).to.equal(MockUSDTDepositAmount);
    });

    it("Should revert if users deposit the invalid token...", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit mockUSDT tokens
      await mockOPC.connect(alice).approve(oparcade.address, mockOPCDepositAmount);
      await expect(oparcade.connect(alice).deposit(gid, tid, mockOPC.address)).to.be.revertedWith(
        "Invalid deposit token",
      );
    });
  });

  describe("distributePrize", () => {
    beforeEach(async () => {
      // deposit tokens
      let gid = 0;
      let tid = 0;

      await mockUSDT.connect(alice).approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.connect(alice).deposit(gid, tid, mockUSDT.address);

      await mockUSDT.connect(bob).approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.connect(bob).deposit(gid, tid, mockUSDT.address);

      // deposit prize
      gid = 0;
      await mockUSDT.approve(oparcade.address, 2 * MockUSDTDepositAmount);
      await oparcade.depositPrize(deployer.address, gid, tid, mockUSDT.address, 2 * MockUSDTDepositAmount);
    });

    it("Should be able to distribute tokens...", async () => {
      // set total distributable amount
      const totalMockUSDTDistributableAmount = 4 * MockUSDTDepositAmount;

      // check old balances
      expect(await mockUSDT.balanceOf(oparcade.address)).to.equal(totalMockUSDTDistributableAmount);
      expect(await mockUSDT.balanceOf(feeRecipient.address)).to.equal(0);

      // set prize amount
      const aliceMockUSDTAmount = totalMockUSDTDistributableAmount * 0.7;
      const bobMockUSDTAmount = totalMockUSDTDistributableAmount * 0.3;

      const mockUSDTDistributableAmount = [aliceMockUSDTAmount, bobMockUSDTAmount];

      // check old balances
      const beforeAliceMockUSDTAmount = await mockUSDT.balanceOf(alice.address);
      const beforeBobMockUSDTAmount = await mockUSDT.balanceOf(bob.address);
      const beforeTournamentCreator0USDTAmount = await mockUSDT.balanceOf(deployer.address);
      const beforePlatformFeetMockUSDTAmount = await mockUSDT.balanceOf(feeRecipient.address);

      // distribute tokens
      let gid = 0;
      let tid = 0;
      await oparcade
        .connect(distributor)
        .distributePrize(gid, tid, [alice.address, bob.address], mockUSDT.address, mockUSDTDistributableAmount);

      // calculate total fees
      let MockUSDTAlicePrizeAmount =
        (aliceMockUSDTAmount * (1000 - platformFee - proposedGameCreatorFee - tournamentCreatorFee)) / 1000;
      let MockUSDTBobPrizeAmount =
        (bobMockUSDTAmount * (1000 - platformFee - proposedGameCreatorFee - tournamentCreatorFee)) / 1000;
      let MockUSDTTournamentCreatorFeeAmount = (totalMockUSDTDistributableAmount * tournamentCreatorFee) / 1000;
      let MockUSDTGameCreator0FeeAmount = (totalMockUSDTDistributableAmount * proposedGameCreatorFee) / 1000;
      let MockUSDTPlatformFeeAmount = (totalMockUSDTDistributableAmount * platformFee) / 1000;

      // check new balances
      expect(await mockUSDT.balanceOf(alice.address)).to.equal(
        beforeAliceMockUSDTAmount.add(MockUSDTAlicePrizeAmount).add(MockUSDTGameCreator0FeeAmount),
      );
      expect(await mockUSDT.balanceOf(bob.address)).to.equal(beforeBobMockUSDTAmount.add(MockUSDTBobPrizeAmount));
      expect(await mockUSDT.balanceOf(deployer.address)).to.equal(
        beforeTournamentCreator0USDTAmount.add(MockUSDTTournamentCreatorFeeAmount),
      );
      expect(await mockUSDT.balanceOf(feeRecipient.address)).to.equal(
        beforePlatformFeetMockUSDTAmount.add(MockUSDTPlatformFeeAmount),
      );
    });

    it("Should revert if the distributor does not have the distributor role...", async () => {
      // set distributable amount
      let gid = 0;
      let tid = 0;

      const totalMockUSDTDistributableAmount = 4 * MockUSDTDepositAmount;

      // set prize amount
      const aliceMockUSDTAmount = totalMockUSDTDistributableAmount * 0.7;
      const bobMockUSDTAmount = totalMockUSDTDistributableAmount * 0.3;

      const mockUSDTDistributableAmount = [aliceMockUSDTAmount, bobMockUSDTAmount];

      // distribute tokens
      await expect(
        oparcade
          .connect(alice)
          .distributePrize(gid, tid, [alice.address, bob.address], mockUSDT.address, mockUSDTDistributableAmount),
      ).to.be.revertedWith("Distributor role missing");
    });

    it("Should revert if winners are not matched with the payments...", async () => {
      // set distributable amount
      let gid = 0;
      let tid = 0;

      const totalMockUSDTDistributableAmount = 4 * MockUSDTDepositAmount;

      const aliceMockUSDTAmount = totalMockUSDTDistributableAmount * 0.7;
      const bobMockUSDTAmount = totalMockUSDTDistributableAmount * 0.5;

      const mockUSDTDistributableAmount = [aliceMockUSDTAmount, bobMockUSDTAmount];

      // distribute tokens
      await expect(
        oparcade
          .connect(distributor)
          .distributePrize(gid, tid, [alice.address], mockUSDT.address, mockUSDTDistributableAmount),
      ).to.be.revertedWith("Mismatched winners and amounts");
    });

    it("Should revert if the token is not allowed to distribute...", async () => {
      // set distributable amount
      let gid = 0;
      let tid = 0;

      const totalMockUSDTDistributableAmount = 4 * MockUSDTDepositAmount;

      const aliceMockUSDTAmount = totalMockUSDTDistributableAmount * 0.7;
      const bobMockUSDTAmount = totalMockUSDTDistributableAmount * 0.3;

      const mockUSDTDistributableAmount = [aliceMockUSDTAmount, bobMockUSDTAmount];

      // distribute tokens
      await expect(
        oparcade
          .connect(distributor)
          .distributePrize(gid, tid, [alice.address, bob.address], mockOPC.address, mockUSDTDistributableAmount),
      ).to.be.revertedWith("Disallowed distribution token");
    });

    it("Should revert if total payment amount is exceeded...", async () => {
      // lock more tokens
      await mockUSDT.transfer(oparcade.address, 10 * MockUSDTDepositAmount);

      // set exceeded distributable amount
      let gid = 0;
      let tid = 0;

      const totalMockUSDTDistributableAmount = 4 * MockUSDTDepositAmount;

      const aliceMockUSDTAmount = totalMockUSDTDistributableAmount * 0.7;
      const bobMockUSDTAmount = totalMockUSDTDistributableAmount * 0.3;

      const mockUSDTDistributableAmount = [aliceMockUSDTAmount, bobMockUSDTAmount + 1];

      // distribute tokens
      await expect(
        oparcade
          .connect(distributor)
          .distributePrize(gid, tid, [alice.address, bob.address], mockUSDT.address, mockUSDTDistributableAmount),
      ).to.be.revertedWith("Prize amount exceeded");
    });

    it("Should revert if winner address is zero...", async () => {
      // lock more tokens
      await mockUSDT.transfer(oparcade.address, 10 * MockUSDTDepositAmount);

      // set exceeded distributable amount
      let gid = 0;
      let tid = 0;

      const totalMockUSDTDistributableAmount = 4 * MockUSDTDepositAmount;

      const aliceMockUSDTAmount = totalMockUSDTDistributableAmount * 0.7;
      const bobMockUSDTAmount = totalMockUSDTDistributableAmount * 0.3;

      const mockUSDTDistributableAmount = [aliceMockUSDTAmount, bobMockUSDTAmount + 1];

      // distribute tokens
      await expect(
        oparcade
          .connect(distributor)
          .distributePrize(gid, tid, [alice.address, ZERO_ADDRESS], mockUSDT.address, mockUSDTDistributableAmount),
      ).to.be.revertedWith("Winner address should be defined");
    });

    it("Should revert if prizei amount is zero...", async () => {
      // lock more tokens
      await mockUSDT.transfer(oparcade.address, 10 * MockUSDTDepositAmount);

      // set exceeded distributable amount
      let gid = 0;
      let tid = 0;

      const totalMockUSDTDistributableAmount = 4 * MockUSDTDepositAmount;

      const aliceMockUSDTAmount = totalMockUSDTDistributableAmount * 0.7;
      const bobMockUSDTAmount = totalMockUSDTDistributableAmount * 0.3;

      const mockUSDTDistributableAmount = [aliceMockUSDTAmount, 0];

      // distribute tokens
      await expect(
        oparcade
          .connect(distributor)
          .distributePrize(gid, tid, [alice.address, bob.address], mockUSDT.address, mockUSDTDistributableAmount),
      ).to.be.revertedWith("Winner amount should be greater than zero");
    });

    it("Should revert if is missing DISTRIBUTOR_ROLE role...", async () => {
      await expect(
        oparcade.connect(alice).distributePrize(0, 0, [alice.address, bob.address], mockUSDT.address, [0, 0]),
      ).to.be.revertedWith("Distributor role missing");
    });
  });

  describe("distributeNFTPrize", () => {
    beforeEach(async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts);

      gid = 1;
      tid = 1;
      nftType = 1155;
      tokenIds = [1, 2, 3];
      tokenAmounts = [3, 3, 3];

      // deposit mockERC1155 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC1155.address, true);
      await mockERC1155.setApprovalForAll(oparcade.address, true);
      await oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts);
    });

    it("Should distribute the ERC721 NFT prize", async () => {
      // check old balance
      expect(await mockERC721.balanceOf(alice.address)).to.equal(0);
      expect(await mockERC721.balanceOf(bob.address)).to.equal(0);

      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 3];
      let tokenAmounts = [1, 1];

      // distribute ERC721 NFTs
      await oparcade
        .connect(distributor)
        .distributeNFTPrize(
          gid,
          tid,
          [alice.address, bob.address],
          mockERC721.address,
          nftType,
          tokenIds,
          tokenAmounts,
        );

      // check new balance
      expect(await mockERC721.balanceOf(alice.address)).to.equal(1);
      expect(await mockERC721.balanceOf(bob.address)).to.equal(1);
      expect(await mockERC721.ownerOf(1)).to.equal(alice.address);
      expect(await mockERC721.ownerOf(3)).to.equal(bob.address);
    });

    it("Should distribute the ERC1155 NFT prize", async () => {
      // check old balance
      expect(await mockERC1155.balanceOf(alice.address, 1)).to.equal(0);
      expect(await mockERC1155.balanceOf(bob.address, 3)).to.equal(0);

      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 3];
      let tokenAmounts = [1, 2];

      // distribute ERC1155 NFTs
      await oparcade
        .connect(distributor)
        .distributeNFTPrize(
          gid,
          tid,
          [alice.address, bob.address],
          mockERC1155.address,
          nftType,
          tokenIds,
          tokenAmounts,
        );

      // check new balance
      expect(await mockERC1155.balanceOf(alice.address, 1)).to.equal(1);
      expect(await mockERC1155.balanceOf(bob.address, 3)).to.equal(2);
    });

    it("Should revert if NFT is not allowed to distribute", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 1155;
      let tokenIds = [1, 3];
      let tokenAmounts = [1, 1];

      // distribute ERC721 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address],
            mockERC1155.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("Disallowed distribution token");
    });

    it("Should revert if NFT type is not acceptable", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 0;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // distribute mockERC1155 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address],
            mockERC1155.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("Unexpected NFT type");
    });

    it("Should revert if the distribution params are invalid", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3];

      // distribute mockERC1155 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address],
            mockERC1155.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("Mismatched NFT distribution data");
    });

    it("Should revert if NFT type (ERC721) is not matched with the param", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 1155;
      let tokenIds = [1, 2];
      let tokenAmounts = [1, 1];

      // distribute mockERC721 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address],
            mockERC721.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("Unexpected NFT address");
    });

    it("Should revert if NFT type (ERC1155) is not matched with the param", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 721;
      let tokenIds = [1, 2];
      let tokenAmounts = [3, 3];

      // distribute mockERC1155 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address],
            mockERC1155.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("Unexpected NFT address");
    });

    it("Should revert if NFT distribution amount (ERC721) is exceeded", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3, 4];
      let tokenAmounts = [1, 1, 1, 1];

      // distribute mockERC721 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address, alice.address, bob.address],
            mockERC721.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("NFT prize distribution amount exceeded");
    });

    it("Should revert if NFT distribution amount (ERC1155) is exceeded", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 5];

      // distribute mockERC1155 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address, alice.address],
            mockERC1155.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("NFT prize distribution amount exceeded");
    });

    it("Should revert if NFT distribution amount (ERC721) is incorrect", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 0];

      // distribute mockERC721 NFTs
      await expect(
        oparcade
          .connect(distributor)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address, alice.address],
            mockERC721.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("Invalid amount value");
    });

    it("Should revert if is missing DISTRIBUTOR_ROLE role...", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 0];

      await expect(
        oparcade
          .connect(alice)
          .distributeNFTPrize(
            gid,
            tid,
            [alice.address, bob.address, alice.address],
            mockERC721.address,
            nftType,
            tokenIds,
            tokenAmounts,
          ),
      ).to.be.revertedWith("Distributor role missing");
    });
  });

  describe("depositPrize", () => {
    it("Should deposit the ERC20 token prize", async () => {
      // check old balance
      expect(await mockUSDT.balanceOf(oparcade.address)).to.equal(0);

      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit the prize
      await mockUSDT.approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.depositPrize(deployer.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount);

      expect(await mockUSDT.balanceOf(oparcade.address)).to.equal(MockUSDTDepositAmount);
    });

    it("Should revert if the token is not allowed to distribute...", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit the prize
      await mockOPC.approve(oparcade.address, mockOPCDepositAmount);
      await expect(
        oparcade.depositPrize(deployer.address, gid, tid, mockOPC.address, mockOPCDepositAmount),
      ).to.be.revertedWith("Disallowed distribution token");
    });

    it("Should revert if msg.sender does not have depositor role...", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit the prize
      await mockOPC.approve(oparcade.address, mockOPCDepositAmount);
      await expect(
        oparcade.connect(bob).depositPrize(deployer.address, gid, tid, mockOPC.address, mockOPCDepositAmount),
      ).to.be.revertedWith("Depositor role missing");
    });

    it("Should revert if the prize token address is zero...", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit the prize
      await mockOPC.approve(oparcade.address, mockOPCDepositAmount);
      await expect(
        oparcade.depositPrize(deployer.address, gid, tid, ZERO_ADDRESS, mockOPCDepositAmount),
      ).to.be.revertedWith("Unexpected token address");
    });
  });

  describe("withdrawPrize", () => {
    beforeEach(async () => {
      await addressRegistry.updateTimelock(timelock.address);
    });

    it("Should withdraw the ERC20 token prize", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit the prize
      await mockUSDT.approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.depositPrize(deployer.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount);

      // deposit the prize again
      await mockUSDT.approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.depositPrize(deployer.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount);

      // check old balance
      const beforeAliceMockUSDTAmount = await mockUSDT.balanceOf(alice.address);

      // withdraw the prize
      await oparcade
        .connect(timelock)
        .withdrawPrize(alice.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount * 1.5);

      // check new balance
      expect(await mockUSDT.balanceOf(alice.address)).to.equal(
        beforeAliceMockUSDTAmount.add(MockUSDTDepositAmount * 1.5),
      );
    });

    it("Should revert if the caller is not a timelock contract...", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit the prize
      await mockUSDT.approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.depositPrize(deployer.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount);

      // deposit the prize again
      await mockUSDT.approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.depositPrize(deployer.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount);

      // check old balance
      const beforeAliceMockUSDTAmount = await mockUSDT.balanceOf(alice.address);

      // withdraw the prize
      await expect(
        oparcade.withdrawPrize(alice.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount * 1.5),
      ).to.be.revertedWith("Only timelock");
    });

    it("Should revert if the prize token is not enough to withdraw...", async () => {
      // set gid and tid
      let gid = 0;
      let tid = 0;

      // deposit prize
      await mockOPC.approve(oparcade.address, mockOPCDepositAmount);
      await expect(
        oparcade.depositPrize(deployer.address, gid, tid, mockOPC.address, mockOPCDepositAmount),
      ).to.be.revertedWith("Disallowed distribution token");

      // withdraw the prize
      await expect(
        oparcade
          .connect(timelock)
          .withdrawPrize(alice.address, gid, tid, mockUSDT.address, MockUSDTDepositAmount * 1.5),
      ).to.be.revertedWith("Insufficient prize");
    });

    it("Should revert the user does not have DEPOSITOR_ROLE...", async () => {
      let gid = 0;
      let tid = 0;

      // deposit prize
      await mockOPC.approve(oparcade.address, mockOPCDepositAmount);
      await expect(
        oparcade.connect(alice).depositPrize(deployer.address, gid, tid, mockOPC.address, mockOPCDepositAmount),
      ).to.be.revertedWith("Depositor role missing");
    });
  });

  describe("depositNFTPrize", () => {
    it("Should deposit the ERC721 NFT prize", async () => {
      // check old balance
      expect(await mockERC721.balanceOf(oparcade.address)).to.equal(0);

      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts);

      // check new balance
      expect(await mockERC721.balanceOf(oparcade.address)).to.equal(3);
      expect(await mockERC721.ownerOf(1)).to.equal(oparcade.address);
      expect(await mockERC721.ownerOf(2)).to.equal(oparcade.address);
      expect(await mockERC721.ownerOf(3)).to.equal(oparcade.address);
    });

    it("Should deposit the ERC1155 NFT prize", async () => {
      // check old balance
      expect(await mockERC1155.balanceOf(oparcade.address, 1)).to.equal(0);
      expect(await mockERC1155.balanceOf(oparcade.address, 2)).to.equal(0);
      expect(await mockERC1155.balanceOf(oparcade.address, 3)).to.equal(0);

      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // deposit mockERC1155 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC1155.address, true);
      await mockERC1155.setApprovalForAll(oparcade.address, true);
      await oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts);

      // check new balance
      expect(await mockERC1155.balanceOf(oparcade.address, 1)).to.equal(3);
      expect(await mockERC1155.balanceOf(oparcade.address, 2)).to.equal(3);
      expect(await mockERC1155.balanceOf(oparcade.address, 3)).to.equal(3);
    });

    it("Should revert if msg.sender does not have depositor role...", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await expect(
        oparcade
          .connect(bob)
          .depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Depositor role missing");
    });

    it("Should revert if NFT Address is zero...", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, ZERO_ADDRESS, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, ZERO_ADDRESS, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT address");
    });

    it("Should revert if the ERC721 NFT to deposit is not allowed to distribute...", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Disallowed distribution token");
    });

    it("Should revert if the ERC1155 NFT to deposit is not allowed to distribute...", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // deposit mockERC1155 NFTs
      await mockERC1155.setApprovalForAll(oparcade.address, true);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Disallowed distribution token");
    });

    it("Should revert if the NFT type (ERC721) to deposit is incorrect...", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 0;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT type");
    });

    it("Should revert if the NFT type (ERC1155) to deposit is incorrect...", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 0;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // deposit mockERC1155 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC1155.address, true);
      await mockERC1155.setApprovalForAll(oparcade.address, true);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT type");
    });

    it("Should revert if the deposit data is not matched...", async () => {
      // ERC721
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1, 1];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Mismatched deposit data");

      // ERC1155
      gid = 1;
      tid = 1;
      nftType = 1155;
      tokenIds = [1, 2, 3];
      tokenAmounts = [3, 3, 3, 1];

      // deposit mockERC1155 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC1155.address, true);
      await mockERC1155.setApprovalForAll(oparcade.address, true);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Mismatched deposit data");
    });

    it("Should revert if the NFT interface (ERC721) to deposit is incorrect...", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT address");
    });

    it("Should revert if the NFT interface (ERC1155) to deposit is incorrect...", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // deposit mockERC1155 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC1155.address, true);
      await mockERC1155.setApprovalForAll(oparcade.address, true);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT address");
    });

    it("Should revert if the NFT amount (ERC721) to deposit is incorrect...", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 0];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await expect(
        oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Invalid amount value");
    });
  });

  describe("withdrawNFTPrize", () => {
    beforeEach(async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // deposit mockERC721 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC721.address, true);
      await mockERC721.approve(oparcade.address, tokenIds[0]);
      await mockERC721.approve(oparcade.address, tokenIds[1]);
      await mockERC721.approve(oparcade.address, tokenIds[2]);
      await oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts);

      gid = 1;
      tid = 1;
      nftType = 1155;
      tokenIds = [1, 2, 3];
      tokenAmounts = [3, 3, 3];

      // deposit mockERC1155 NFTs
      await gameRegistry.updateDistributableTokenAddress(gid, mockERC1155.address, true);
      await mockERC1155.setApprovalForAll(oparcade.address, true);
      await oparcade.depositNFTPrize(deployer.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts);
    });

    it("Should withdraw the ERC721 NFT prize", async () => {
      // check old balance
      expect(await mockERC721.balanceOf(alice.address)).to.equal(0);

      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 1];

      // withdraw mockERC721 NFTs
      await oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts);

      // check new balance
      expect(await mockERC721.balanceOf(alice.address)).to.equal(3);
      expect(await mockERC721.ownerOf(1)).to.equal(alice.address);
      expect(await mockERC721.ownerOf(2)).to.equal(alice.address);
      expect(await mockERC721.ownerOf(3)).to.equal(alice.address);
    });

    it("Should withdraw the ERC1155 NFT prize", async () => {
      // check old balance
      expect(await mockERC1155.balanceOf(alice.address, 1)).to.equal(0);
      expect(await mockERC1155.balanceOf(alice.address, 2)).to.equal(0);
      expect(await mockERC1155.balanceOf(alice.address, 3)).to.equal(0);

      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // withdraw mockERC1155 NFTs
      await oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts);

      // check new balance
      expect(await mockERC1155.balanceOf(alice.address, 1)).to.equal(3);
      expect(await mockERC1155.balanceOf(alice.address, 2)).to.equal(3);
      expect(await mockERC1155.balanceOf(alice.address, 3)).to.equal(3);
    });

    it("Should revert if NFT type is not acceptable", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 0;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // withdraw mockERC1155 NFTs
      await expect(
        oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT type");
    });

    it("Should revert if the params are invalid", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3];

      // withdraw mockERC1155 NFTs
      await expect(
        oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Mismatched deposit data");
    });

    it("Should revert if NFT type (ERC721) is not matched with the param", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // withdraw mockERC721 NFTs
      await expect(
        oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT address");
    });

    it("Should revert if NFT type (ERC1155) is not matched with the param", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 3];

      // withdraw mockERC1155 NFTs
      await expect(
        oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Unexpected NFT address");
    });

    it("Should revert if NFT amount (ERC721) to withdraw is insufficient", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1];
      let tokenAmounts = [1];

      // withdraw mockERC721 NFTs
      await oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts);

      tokenIds = [1, 2, 3];
      tokenAmounts = [1, 1, 1];

      // withdraw mockERC721 NFTs again
      await expect(
        oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Insufficient NFT prize");
    });

    it("Should revert if NFT amount (ERC721) to withdraw is not enough", async () => {
      let gid = 0;
      let tid = 0;
      let nftType = 721;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [1, 1, 0];

      // withdraw mockERC721 NFTs
      await expect(
        oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC721.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Invalid amount value");
    });

    it("Should revert if NFT amount (ERC1155) to withdraw is not enough", async () => {
      let gid = 1;
      let tid = 1;
      let nftType = 1155;
      let tokenIds = [1, 2, 3];
      let tokenAmounts = [3, 3, 4];

      // withdraw mockERC1155 NFTs
      await expect(
        oparcade.withdrawNFTPrize(alice.address, gid, tid, mockERC1155.address, nftType, tokenIds, tokenAmounts),
      ).to.be.revertedWith("Insufficient NFT prize");
    });
  });

  describe("withdraw", () => {
    beforeEach(async () => {
      // user deposit
      let gid = 0;
      let tid = 0;

      await mockUSDT.approve(oparcade.address, MockUSDTDepositAmount);
      await oparcade.deposit(gid, tid, mockUSDT.address);

      // deposit the prize with different gid and tid
      gid = 1;
      tid = 0;

      await mockOPC.approve(oparcade.address, mockOPCDepositAmount);
      await oparcade.depositPrize(deployer.address, gid, tid, mockOPC.address, mockOPCDepositAmount);
    });
  });

  describe("pause/unpause", () => {
    it("Should pause Oparcade", async () => {
      // Pause Oparcade
      await oparcade.pause();

      // Expect Oparcade is paused
      expect(await oparcade.paused()).to.be.true;
    });
    it("Should unpause(resume) Oparcade", async () => {
      // Pause Oparcade
      await oparcade.pause();

      // Expect Oparcade is paused
      expect(await oparcade.paused()).to.be.true;

      // Unpause Oparcade
      await oparcade.unpause();

      // Expect Oparcade is resumed
      expect(await oparcade.paused()).to.be.false;
    });
  });
});
