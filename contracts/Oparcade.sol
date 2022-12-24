// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IGameRegistry.sol";

/**
 * @title Oparcade
 * @notice This contract manages token deposit/distribution from/to the users playing the game/tournament
 * @author David Lee
 */
contract Oparcade is
  AccessControlUpgradeable,
  ReentrancyGuardUpgradeable,
  PausableUpgradeable,
  ERC721HolderUpgradeable,
  ERC1155HolderUpgradeable
{
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event UserDeposited(address by, uint256 indexed gid, uint256 indexed tid, address indexed token, uint256 amount);
  event PrizeDistributed(
    address by,
    address[] winners,
    uint256 indexed gid,
    uint256 indexed tid,
    address indexed token,
    uint256[] amounts
  );
  event NFTPrizeDistributed(
    address by,
    address[] winners,
    uint256 indexed gid,
    uint256 indexed tid,
    address indexed nftAddress,
    uint256 nftType,
    uint256[] tokenIds,
    uint256[] amounts
  );
  event PrizeDeposited(
    address by,
    address depositor,
    uint256 indexed gid,
    uint256 indexed tid,
    address indexed token,
    uint256 amount
  );
  event PrizeWithdrawn(
    address by,
    address to,
    uint256 indexed gid,
    uint256 indexed tid,
    address indexed token,
    uint256 amount
  );
  event NFTPrizeDeposited(
    address by,
    address from,
    uint256 indexed gid,
    uint256 indexed tid,
    address indexed nftAddress,
    uint256 nftType,
    uint256[] tokenIds,
    uint256[] amounts
  );
  event NFTPrizeWithdrawn(
    address by,
    address to,
    uint256 indexed gid,
    uint256 indexed tid,
    address indexed nftAddress,
    uint256 nftType,
    uint256[] tokenIds,
    uint256[] amounts
  );

  bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;

  bytes4 private constant INTERFACE_ID_ERC1155 = 0xd9b67a26;

  struct TournamentToken {
    uint256 totalUserDeposit;
    uint256 totalPrizeDistribution;
    uint256 totalPrizeFee;
    uint256 totalPrizeDeposit;
  }
  /// @dev Game ID -> Tournament ID -> Token Address -> Tournament tokens
  mapping(uint256 => mapping(uint256 => mapping(address => TournamentToken))) public tournamentTokens;

  struct TournamentNftPrize {
    uint256 totalDistribution;
    uint256 totalDeposit;
  }
  /// @dev Game ID -> Tournament ID -> NFT Address -> Token ID -> Tournament NFT prizes
  mapping(uint256 => mapping(uint256 => mapping(address => mapping(uint256 => TournamentNftPrize)))) tournamentNftPrizes;

  bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
  bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE");
  bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

  /// @dev AddressRegistry
  IAddressRegistry public addressRegistry;

  modifier onlyDistributor() {
    require(
      hasRole(DISTRIBUTOR_ROLE, _msgSender()) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
      "Distributor role missing"
    );
    _;
  }

  modifier onlyTimelock() {
    require(msg.sender == addressRegistry.timelock(), "Only timelock");
    _;
  }

  modifier onlyPauser() {
    require(hasRole(PAUSER_ROLE, _msgSender()) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Pauser role missing");
    _;
  }

  modifier onlyDepositor() {
    require(
      hasRole(DEPOSITOR_ROLE, _msgSender()) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
      "Depositor role missing"
    );
    _;
  }

  modifier onlyAdmin() {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Admin role missing");
    _;
  }

  function initialize(address _addressRegistry) public initializer {
    __AccessControl_init();
    __ReentrancyGuard_init();
    __Pausable_init();
    __ERC721Holder_init();
    __ERC1155Holder_init();

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _grantRole(PAUSER_ROLE, _msgSender());
    _grantRole(DEPOSITOR_ROLE, _msgSender());
    _grantRole(DISTRIBUTOR_ROLE, _msgSender());

    require(_addressRegistry != address(0), "Invalid AddressRegistry");

    // initialize AddressRegistery
    addressRegistry = IAddressRegistry(_addressRegistry);
  }

  /**
   * @notice Deposit ERC20 tokens from user
   * @dev Only tokens registered in GameRegistry with an amount greater than zero is valid for the deposit
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Token address to deposit
   */
  function deposit(uint256 _gid, uint256 _tid, address _token) external whenNotPaused {
    // get token amount to deposit
    uint256 depositTokenAmount = IGameRegistry(addressRegistry.gameRegistry()).getDepositTokenAmount(
      _gid,
      _tid,
      _token
    );

    // check if the token address is valid
    require(depositTokenAmount > 0, "Invalid deposit token");

    // transfer the payment
    IERC20Upgradeable(_token).safeTransferFrom(msg.sender, address(this), depositTokenAmount);
    tournamentTokens[_gid][_tid][_token].totalUserDeposit += depositTokenAmount;

    emit UserDeposited(msg.sender, _gid, _tid, _token, depositTokenAmount);
  }

  /**
   * @notice Distribute winners their prizes
   * @dev Only depositor
   * @dev The maximum distributable prize amount is the sum of the users' deposit and the prize that the owner deposited
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _winners Winners list
   * @param _token Prize token address
   * @param _amounts Prize list
   */
  function distributePrize(
    uint256 _gid,
    uint256 _tid,
    address[] calldata _winners,
    address _token,
    uint256[] calldata _amounts
  ) external whenNotPaused onlyDistributor {
    require(_winners.length == _amounts.length, "Mismatched winners and amounts");

    // get gameRegistry
    IGameRegistry gameRegistry = IGameRegistry(addressRegistry.gameRegistry());

    // check if token is allowed to distribute
    require(gameRegistry.isDistributable(_gid, _token), "Disallowed distribution token");

    _transferPayment(_gid, _tid, _winners, _token, _amounts);

    // check if the prize amount is not exceeded
    require(
      tournamentTokens[_gid][_tid][_token].totalPrizeDistribution +
        tournamentTokens[_gid][_tid][_token].totalPrizeFee <=
        tournamentTokens[_gid][_tid][_token].totalPrizeDeposit + tournamentTokens[_gid][_tid][_token].totalUserDeposit,
      "Prize amount exceeded"
    );

    emit PrizeDistributed(msg.sender, _winners, _gid, _tid, _token, _amounts);
  }

  /**
   * @notice Transfer the winners' ERC20 token prizes and relevant fees
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _winners Winners list
   * @param _token Prize token address
   * @param _amounts Prize list
   */
  function _transferPayment(
    uint256 _gid,
    uint256 _tid,
    address[] calldata _winners,
    address _token,
    uint256[] calldata _amounts
  ) internal {
    // get gameRegistry
    IGameRegistry gameRegistry = IGameRegistry(addressRegistry.gameRegistry());

    // transfer the winners their prizes
    uint256 totalPlatformFeeAmount;
    uint256 totalGameCreatorFeeAmount;
    uint256 totalTournamentCreatorFeeAmount;
    for (uint256 i; i < _winners.length; i++) {
      require(_winners[i] != address(0), "Winner address should be defined");
      require(_amounts[i] != 0, "Winner amount should be greater than zero");

      // get userAmount
      uint256 userAmount = _amounts[i];

      {
        // calculate the platform fee
        uint256 platformFeeAmount = (_amounts[i] * gameRegistry.platformFee()) / 100_0;
        totalPlatformFeeAmount += platformFeeAmount;

        // update userAmount
        userAmount -= platformFeeAmount;
      }

      {
        // calculate gameCreatorFee
        uint256 gameCreatorFee = gameRegistry.getAppliedGameCreatorFee(_gid, _tid);
        uint256 gameCreatorFeeAmount = (_amounts[i] * gameCreatorFee) / 100_0;
        totalGameCreatorFeeAmount += gameCreatorFeeAmount;

        // update userAmount
        userAmount -= gameCreatorFeeAmount;
      }

      {
        // calculate tournamentCreatorFee
        uint256 tournamentCreatorFee = gameRegistry.getTournamentCreatorFee(_gid, _tid);
        uint256 tournamentCreatorFeeAmount = (_amounts[i] * tournamentCreatorFee) / 100_0;
        totalTournamentCreatorFeeAmount += tournamentCreatorFeeAmount;

        // update userAmount
        userAmount -= tournamentCreatorFeeAmount;
      }

      // transfer the prize
      tournamentTokens[_gid][_tid][_token].totalPrizeDistribution += userAmount;
      IERC20Upgradeable(_token).safeTransfer(_winners[i], userAmount);
    }

    // transfer the fees
    tournamentTokens[_gid][_tid][_token].totalPrizeFee +=
      totalPlatformFeeAmount +
      totalGameCreatorFeeAmount +
      totalTournamentCreatorFeeAmount;
    IERC20Upgradeable(_token).safeTransfer(gameRegistry.feeRecipient(), totalPlatformFeeAmount);
    IERC20Upgradeable(_token).safeTransfer(gameRegistry.getGameCreatorAddress(_gid), totalGameCreatorFeeAmount);
    IERC20Upgradeable(_token).safeTransfer(
      gameRegistry.getTournamentCreator(_gid, _tid),
      totalTournamentCreatorFeeAmount
    );
  }

  /**
   * @notice Distribute winners' NFT prizes
   * @dev Only depositor
   * @dev NFT type should be either 721 or 1155
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _winners Winners list
   * @param _nftAddress NFT address
   * @param _nftType NFT type (721/1155)
   * @param _tokenIds Token Id list
   * @param _amounts Token amount list
   */
  function distributeNFTPrize(
    uint256 _gid,
    uint256 _tid,
    address[] calldata _winners,
    address _nftAddress,
    uint256 _nftType,
    uint256[] calldata _tokenIds,
    uint256[] calldata _amounts
  ) external whenNotPaused nonReentrant onlyDistributor {
    // check if token is allowed to distribute
    require(
      IGameRegistry(addressRegistry.gameRegistry()).isDistributable(_gid, _nftAddress),
      "Disallowed distribution token"
    );

    require(_nftType == 721 || _nftType == 1155, "Unexpected NFT type");
    require(
      _winners.length == _tokenIds.length && _tokenIds.length == _amounts.length,
      "Mismatched NFT distribution data"
    );

    uint256 totalAmounts;
    if (_nftType == 721) {
      require(IERC165(_nftAddress).supportsInterface(INTERFACE_ID_ERC721), "Unexpected NFT address");

      // update totalNFTPrizeDeposit and transfer NFTs to the winners
      for (uint256 i; i < _winners.length; i++) {
        require(
          tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit == 1 &&
            tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution == 0,
          "NFT prize distribution amount exceeded"
        );

        tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution = 1;
        totalAmounts += _amounts[i];
        try IERC721Upgradeable(_nftAddress).safeTransferFrom(address(this), _winners[i], _tokenIds[i]) {} catch {
          tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution = 0;
          totalAmounts -= _amounts[i];
        }
      }

      // check if all amount value is 1
      require(totalAmounts == _winners.length, "Invalid amount value");
    } else {
      require(IERC165(_nftAddress).supportsInterface(INTERFACE_ID_ERC1155), "Unexpected NFT address");

      // update totalNFTPrizeDeposit and transfer NFTs to the winners
      for (uint256 i; i < _winners.length; i++) {
        require(
          tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit -
            tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution >=
            _amounts[i],
          "NFT prize distribution amount exceeded"
        );

        tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution += _amounts[i];
        try
          IERC1155Upgradeable(_nftAddress).safeTransferFrom(
            address(this),
            _winners[i],
            _tokenIds[i],
            _amounts[i],
            bytes("")
          )
        {} catch {
          tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution -= _amounts[i];
        }
      }
    }

    emit NFTPrizeDistributed(msg.sender, _winners, _gid, _tid, _nftAddress, _nftType, _tokenIds, _amounts);
  }

  /**
   * @notice Deposit the prize tokens for the specific game/tournament
   * @dev Only tokens which are allowed as a distributable token can be deposited
   * @dev Prize is transferred from _depositor address to this contract
   * @param _depositor Depositor address
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Prize token address
   * @param _amount Prize amount to deposit
   */
  function depositPrize(
    address _depositor,
    uint256 _gid,
    uint256 _tid,
    address _token,
    uint256 _amount
  ) external onlyDepositor {
    require(_token != address(0), "Unexpected token address");

    // check if tokens are allowed to claim as a prize
    require(
      IGameRegistry(addressRegistry.gameRegistry()).isDistributable(_gid, _token),
      "Disallowed distribution token"
    );

    // deposit prize tokens
    bool supportsERC721Interface;
    // Try-catch approach ensures that a non-implementer of EIP-165 standard still can still be deposited
    try IERC165Upgradeable(_token).supportsInterface(INTERFACE_ID_ERC721) {
      supportsERC721Interface = IERC165Upgradeable(_token).supportsInterface(INTERFACE_ID_ERC721);
    } catch {
      supportsERC721Interface = false;
    }
    require(!supportsERC721Interface, "ERC721 token not allowed");

    IERC20Upgradeable(_token).safeTransferFrom(_depositor, address(this), _amount);
    tournamentTokens[_gid][_tid][_token].totalPrizeDeposit += _amount;

    emit PrizeDeposited(msg.sender, _depositor, _gid, _tid, _token, _amount);
  }

  /**
   * @notice Withdraw the prize tokens from the specific game/tournament
   * @dev Only owner
   * @param _to Beneficiary address
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Prize token address
   * @param _amount Prize amount to withdraw
   */
  function withdrawPrize(
    address _to,
    uint256 _gid,
    uint256 _tid,
    address _token,
    uint256 _amount
  ) external onlyTimelock {
    // check if the prize is sufficient to withdraw
    require(tournamentTokens[_gid][_tid][_token].totalPrizeDeposit >= _amount, "Insufficient prize");

    // withdraw the prize
    unchecked {
      tournamentTokens[_gid][_tid][_token].totalPrizeDeposit -= _amount;
    }
    IERC20Upgradeable(_token).safeTransfer(_to, _amount);

    emit PrizeWithdrawn(msg.sender, _to, _gid, _tid, _token, _amount);
  }

  /**
   * @notice Deposit NFT prize for the specific game/tournament
   * @dev NFT type should be either 721 or 1155
   * @param _from NFT owner address
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _nftAddress NFT address
   * @param _nftType NFT type (721/1155)
   * @param _tokenIds Token Id list
   * @param _amounts Token amount list
   */
  function depositNFTPrize(
    address _from,
    uint256 _gid,
    uint256 _tid,
    address _nftAddress,
    uint256 _nftType,
    uint256[] calldata _tokenIds,
    uint256[] calldata _amounts
  ) external onlyDepositor {
    // check if NFT is allowed to distribute
    require(
      IGameRegistry(addressRegistry.gameRegistry()).isDistributable(_gid, _nftAddress),
      "Disallowed distribution token"
    );

    require(_nftAddress != address(0), "Unexpected NFT address");
    require(_nftType == 721 || _nftType == 1155, "Unexpected NFT type");
    require(_tokenIds.length == _amounts.length, "Mismatched deposit data");

    uint256 totalAmounts;
    if (_nftType == 721) {
      require(IERC165(_nftAddress).supportsInterface(INTERFACE_ID_ERC721), "Unexpected NFT address");

      // transfer NFTs to the contract and update totalNFTPrizeDeposit
      for (uint256 i; i < _tokenIds.length; i++) {
        IERC721Upgradeable(_nftAddress).safeTransferFrom(_from, address(this), _tokenIds[i]);
        tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit = 1;
        totalAmounts += _amounts[i];
      }

      // check if all amount value is 1
      require(totalAmounts == _tokenIds.length, "Invalid amount value");
    } else {
      require(IERC165(_nftAddress).supportsInterface(INTERFACE_ID_ERC1155), "Unexpected NFT address");

      // transfer NFTs to the contract and update totalNFTPrizeDeposit
      IERC1155Upgradeable(_nftAddress).safeBatchTransferFrom(_from, address(this), _tokenIds, _amounts, bytes(""));
      for (uint256 i; i < _tokenIds.length; i++) {
        tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit += _amounts[i];
      }
    }

    emit NFTPrizeDeposited(msg.sender, _from, _gid, _tid, _nftAddress, _nftType, _tokenIds, _amounts);
  }

  /**
   * @notice Withdraw NFT prize for the specific game/tournament
   * @dev Only owner
   * @dev NFT type should be either 721 or 1155
   * @param _to NFT receiver address
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _nftAddress NFT address
   * @param _nftType NFT type (721/1155)
   * @param _tokenIds Token Id list
   * @param _amounts Token amount list
   */
  function withdrawNFTPrize(
    address _to,
    uint256 _gid,
    uint256 _tid,
    address _nftAddress,
    uint256 _nftType,
    uint256[] calldata _tokenIds,
    uint256[] calldata _amounts
  ) external nonReentrant onlyAdmin {
    require(_nftType == 721 || _nftType == 1155, "Unexpected NFT type");
    require(_tokenIds.length == _amounts.length, "Mismatched deposit data");

    uint256 totalAmounts;
    if (_nftType == 721) {
      require(IERC165(_nftAddress).supportsInterface(INTERFACE_ID_ERC721), "Unexpected NFT address");

      // update totalNFTPrizeDeposit and transfer NFTs from the contract
      for (uint256 i; i < _tokenIds.length; i++) {
        require(
          tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit -
            tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution ==
            1,
          "Insufficient NFT prize"
        );

        tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit = 0;
        totalAmounts += _amounts[i];
        IERC721Upgradeable(_nftAddress).safeTransferFrom(address(this), _to, _tokenIds[i]);
      }

      // check if all amount value is 1
      require(totalAmounts == _tokenIds.length, "Invalid amount value");
    } else {
      require(IERC165(_nftAddress).supportsInterface(INTERFACE_ID_ERC1155), "Unexpected NFT address");

      // update totalNFTPrizeDeposit and transfer NFTs from the contract
      for (uint256 i; i < _tokenIds.length; i++) {
        require(
          tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit -
            tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDistribution >=
            _amounts[i],
          "Insufficient NFT prize"
        );

        unchecked {
          tournamentNftPrizes[_gid][_tid][_nftAddress][_tokenIds[i]].totalDeposit -= _amounts[i];
        }
      }
      IERC1155Upgradeable(_nftAddress).safeBatchTransferFrom(address(this), _to, _tokenIds, _amounts, bytes(""));
    }

    emit NFTPrizeWithdrawn(msg.sender, _to, _gid, _tid, _nftAddress, _nftType, _tokenIds, _amounts);
  }

  /**
   * @notice Pause Oparcade
   * @dev Only owner
   */
  function pause() external onlyPauser {
    _pause();
  }

  /**
   * @notice Resume Oparcade
   * @dev Only owner
   */
  function unpause() external onlyPauser {
    _unpause();
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(AccessControlUpgradeable, ERC1155ReceiverUpgradeable) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
