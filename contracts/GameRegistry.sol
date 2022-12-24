// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IOparcade.sol";

/**
 * @title GameRegistry
 * @notice This contract stores all info related to the game and tournament creation
 * @author David Lee
 */
contract GameRegistry is AccessControlUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  bytes32 public constant GAME_MANAGER_ROLE = keccak256("GAME_MANAGER_ROLE");
  bytes32 public constant TOURNAMENT_MANAGER_ROLE = keccak256("TOURNAMENT_MANAGER_ROLE");

  event GameAdded(
    address indexed by,
    uint256 indexed gid,
    string gameName,
    address indexed gameCreator,
    uint256 baseGameCreatorFee
  );
  event GameRemoved(
    address indexed by,
    uint256 indexed gid,
    string gameName,
    address indexed gameCreator,
    uint256 baseGameCreatorFee
  );
  event GameCreatorUpdated(
    address indexed by,
    uint256 indexed gid,
    address indexed oldGameCreator,
    address newGameCreator
  );
  event BaseGameCreatorFeeUpdated(
    address indexed by,
    uint256 indexed gid,
    uint256 indexed oldBaseGameCreatorFee,
    uint256 newBaseGameCreatorFee
  );
  event TournamentCreated(
    address indexed by,
    uint256 indexed gid,
    uint256 indexed tid,
    string tournamentName,
    uint256 appliedGameCreatorFee,
    uint256 tournamentCreatorFee
  );
  event DepositAmountUpdated(
    address indexed by,
    uint256 indexed gid,
    uint256 indexed tid,
    string tournamentName,
    address token,
    uint256 oldAmount,
    uint256 newAmount
  );
  event DistributableTokenAddressUpdated(
    address indexed by,
    uint256 indexed gid,
    address indexed token,
    bool oldStatus,
    bool newStatus
  );
  event PlatformFeeUpdated(
    address indexed by,
    address indexed oldFeeRecipient,
    uint256 oldPlatformFee,
    address indexed newFeeRecipient,
    uint256 newPlatformFee
  );
  event TournamentCreationFeeTokenUpdated(
    address indexed by,
    address indexed oldTournamentCreationFeeToken,
    address indexed newTournamentCreationFeeToken
  );
  event FreeTournamentCreationFeeAmountUpdated(
    address indexed by,
    uint256 oldFreeTournamentCreationFeeAmount,
    uint256 newFreeTournamentCreationFeeAmount
  );
  event PaidTournamentCreationFeeAmountUpdated(
    address indexed by,
    uint256 oldPaidTournamentCreationFeeAmount,
    uint256 newPaidTournamentCreationFeeAmount
  );

  struct Token {
    address tokenAddress;
    uint256 tokenAmount;
  }

  struct Tournament {
    string name;
    address creatorAddress;
    uint256 creatorFee;
    uint256 appliedGameCreatorFee;
    /// @dev Token address -> amount
    mapping(address => uint256) depositTokenAmount;
  }

  struct Game {
    string name;
    address creatorAddress;
    uint256 baseCreatorFee;
    bool isDeprecated;
    address[] distributableTokenList; // return all array
    address[] depositTokenList;
    mapping(uint256 => Tournament) tournaments;
    uint256 tournamentsCount;
    /// @dev Token address -> Bool
    mapping(address => bool) distributable;
  }

  /// @dev Game name array
  Game[] public games;

  /// @dev AddressRegistry
  IAddressRegistry public addressRegistry;

  /// @dev Platform fee recipient
  address public feeRecipient;

  /// @dev Platform fee
  uint256 public platformFee;

  /// @dev Tournament creation fee token address
  address public tournamentCreationFeeToken;

  /// @dev Free Tournament creation fee token amount
  uint256 public freeTournamentCreationFeeAmount;

  /// @dev Paid Tournament creation fee token amount
  uint256 public paidTournamentCreationFeeAmount;

  /// @dev Max fee constant in permillage (percentage * 10)
  uint256 private constant MAX_PERMILLAGE = 100_0;

  modifier onlyValidGID(uint256 _gid) {
    require(_gid < games.length, "Invalid game index");
    _;
  }

  modifier onlyActiveGame(uint256 _gid) {
    require(_gid < games.length && !games[_gid].isDeprecated, "Game not active");
    _;
  }

  modifier onlyValidTID(uint256 _gid, uint256 _tid) {
    require(_tid < games[_gid].tournamentsCount, "Invalid tournament index");
    _;
  }

  modifier onlyGameManager() {
    require(
      hasRole(GAME_MANAGER_ROLE, _msgSender()) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
      "Game manager role missing"
    );
    _;
  }

  modifier onlyTournamentManager() {
    require(
      hasRole(TOURNAMENT_MANAGER_ROLE, _msgSender()) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
      "Tournament manager role missing"
    );
    _;
  }

  modifier onlyAdmin() {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Admin role missing");
    _;
  }

  function initialize(
    address _addressRegistry,
    address _feeRecipient,
    uint256 _platformFee,
    address _tournamentCreationFeeToken,
    uint256 _freeTournamentCreationFeeAmount,
    uint256 _paidTournamentCreationFeeAmount
  ) public initializer {
    __AccessControl_init();

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _grantRole(GAME_MANAGER_ROLE, _msgSender());
    _grantRole(TOURNAMENT_MANAGER_ROLE, _msgSender());

    require(_addressRegistry != address(0), "Zero address registry");
    require(_tournamentCreationFeeToken != address(0), "Zero tournament fee token");
    require(_feeRecipient != address(0) || _platformFee == 0, "Fee recipient not set");
    require(_platformFee <= MAX_PERMILLAGE, "Platform fee exceeded");

    // initialize AddressRegistery
    addressRegistry = IAddressRegistry(_addressRegistry);

    // initialize fee and recipient
    feeRecipient = _feeRecipient;
    platformFee = _platformFee;
    tournamentCreationFeeToken = _tournamentCreationFeeToken;
    freeTournamentCreationFeeAmount = _freeTournamentCreationFeeAmount;
    paidTournamentCreationFeeAmount = _paidTournamentCreationFeeAmount;
  }

  /**
   * @notice Returns a boolean indicating if a specific game is deprecated
   * @param _gid Game ID
   * @return (bool) Is deprecated
   */
  function isGameDeprecated(uint256 _gid) external view onlyValidGID(_gid) returns (bool) {
    return games[_gid].isDeprecated;
  }

  /**
   * @notice Returns the game name
   * @param _gid Game ID
   * @return (string) Game name
   */
  function getGameName(uint256 _gid) external view onlyValidGID(_gid) returns (string memory) {
    return games[_gid].name;
  }

  /**
   * @notice Returns the game creator address
   * @param _gid Game ID
   * @return (string) Game creator address
   */
  function getGameCreatorAddress(uint256 _gid) external view onlyValidGID(_gid) returns (address) {
    return games[_gid].creatorAddress;
  }

  /**
   * @notice Returns the game creator fee
   * @param _gid Game ID
   * @return (uint256) Game creator fee
   */
  function getGameBaseCreatorFee(uint256 _gid) external view onlyValidGID(_gid) returns (uint256) {
    return games[_gid].baseCreatorFee;
  }

  /**
   * @notice Returns true if the token of a specific game is distributable, false otherwise
   * @param _gid Game ID
   * @param _tokenAddress token address
   * @return (uint256) Is token distributable
   */
  function isDistributable(uint256 _gid, address _tokenAddress) external view onlyValidGID(_gid) returns (bool) {
    return games[_gid].distributable[_tokenAddress];
  }

  /**
   * @notice Returns the deposit token list of the game
   * @param _gid Game ID
   * @param (address[]) Deposit token list of the game
   */
  function getDepositTokenList(uint256 _gid) external view returns (address[] memory) {
    return games[_gid].depositTokenList;
  }

  /**
   * @notice Returns the distributable token list of the game
   * @param _gid Game ID
   * @param (address[]) Distributable token list of the game
   */
  function getDistributableTokenList(uint256 _gid) external view returns (address[] memory) {
    return games[_gid].distributableTokenList;
  }

  /**
   * @notice Returns the number of games created
   * @return (uint256) Amount of games created
   */
  function gameCount() external view returns (uint256) {
    return games.length;
  }

  /**
   * @notice Returns the number of the tournaments of the specific game
   * @param _gid Game ID
   * @return (uint256) Number of the tournament
   */
  function getTournamentCount(uint256 _gid) external view onlyValidGID(_gid) returns (uint256) {
    return games[_gid].tournamentsCount;
  }

  /**
   * @notice Returns the tournament name of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (string) Tournament name
   */
  function getTournamentName(
    uint256 _gid,
    uint256 _tid
  ) external view onlyValidGID(_gid) onlyValidTID(_gid, _tid) returns (string memory) {
    return games[_gid].tournaments[_tid].name;
  }

  /**
   * @notice Returns the tournament creator fee of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (uint256) Tournament creator fee
   */
  function getTournamentCreatorFee(
    uint256 _gid,
    uint256 _tid
  ) external view onlyValidGID(_gid) onlyValidTID(_gid, _tid) returns (uint256) {
    return games[_gid].tournaments[_tid].creatorFee;
  }

  /**
   * @notice Returns the applied game creator fee of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (string) Game applied game creator fee of a tournament
   */
  function getAppliedGameCreatorFee(
    uint256 _gid,
    uint256 _tid
  ) external view onlyValidGID(_gid) onlyValidTID(_gid, _tid) returns (uint256) {
    return games[_gid].tournaments[_tid].appliedGameCreatorFee;
  }

  /**
   * @notice Returns the deposit token amount of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _tokenAddress token address
   * @return (uint256) Tournament deposit token amount
   */
  function getDepositTokenAmount(
    uint256 _gid,
    uint256 _tid,
    address _tokenAddress
  ) external view onlyValidGID(_gid) onlyValidTID(_gid, _tid) returns (uint256) {
    return games[_gid].tournaments[_tid].depositTokenAmount[_tokenAddress];
  }

  /**
   * @notice Returns the tournament creator address of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (address) Tournament creator address
   */
  function getTournamentCreator(
    uint256 _gid,
    uint256 _tid
  ) external view onlyValidGID(_gid) onlyValidTID(_gid, _tid) returns (address) {
    return games[_gid].tournaments[_tid].creatorAddress;
  }

  /**
   * @notice Add the new game
   * @dev Base game creator fee is the minimum fee vaule that the game creator should be rewarded from the tournamnet of the game
   * @dev When creating the tournament of the game, the game creator fee can be proposed by the tournament creator
   * @dev but the proposed value can't be less than the base one
   * @dev If the proposed game creator fee is 0, the base game creator fee will be applied
   * @param _gameName Game name to add
   * @param _gameCreator Game creator address
   * @param _baseGameCreatorFee Base game creator fee
   */
  function addGame(
    string calldata _gameName,
    address _gameCreator,
    uint256 _baseGameCreatorFee
  ) external onlyGameManager returns (uint256 gid) {
    require(bytes(_gameName).length != 0, "Empty game name");
    require(_gameCreator != address(0), "Zero game creator address");
    require(platformFee + _baseGameCreatorFee <= MAX_PERMILLAGE, "Exceeded base game creator fee");

    // Create game and set properties
    gid = games.length;
    games.push();
    games[gid].name = _gameName;
    games[gid].creatorAddress = _gameCreator;
    games[gid].baseCreatorFee = _baseGameCreatorFee;

    emit GameAdded(msg.sender, gid, _gameName, _gameCreator, _baseGameCreatorFee);
  }

  /**
   * @notice Remove the exising game
   * @dev Game is not removed from the games array, just set it deprecated
   * @param _gid Game ID
   */
  function removeGame(uint256 _gid) external onlyGameManager onlyActiveGame(_gid) {
    // remove game
    games[_gid].isDeprecated = true;

    emit GameRemoved(msg.sender, _gid, games[_gid].name, games[_gid].creatorAddress, games[_gid].baseCreatorFee);
  }

  /**
   * @notice Update the game creator
   * @param _gid Game ID
   * @param _gameCreator Game creator address
   */
  function updateGameCreator(uint256 _gid, address _gameCreator) external onlyActiveGame(_gid) {
    require(msg.sender == games[_gid].creatorAddress, "Only game creator");
    require(_gameCreator != address(0), "Zero game creator address");

    emit GameCreatorUpdated(msg.sender, _gid, games[_gid].creatorAddress, _gameCreator);

    // update the game creator address
    games[_gid].creatorAddress = _gameCreator;
  }

  /**
   * @notice Update the base game creator fee
   * @dev Tournament creator fee is the royality that will be transferred to the tournament creator address
   * @dev Tournament creator can propose the game creator fee when creating the tournament
   * @dev but it can't be less than the base game creator fee
   * @param _gid Game ID
   * @param _baseGameCreatorFee Base game creator fee
   */
  function updateBaseGameCreatorFee(
    uint256 _gid,
    uint256 _baseGameCreatorFee
  ) external onlyGameManager onlyActiveGame(_gid) {
    require(platformFee + _baseGameCreatorFee <= MAX_PERMILLAGE, "Exceeded game creator fee");

    emit BaseGameCreatorFeeUpdated(msg.sender, _gid, games[_gid].baseCreatorFee, _baseGameCreatorFee);

    // update the game creator fee
    games[_gid].baseCreatorFee = _baseGameCreatorFee;
  }

  /**
   * @notice Create the tournament and set tokens
   * @dev Only owner
   * @dev If the proposed game creaetor fee is 0, the base game creator fee is applied
   * @dev The prize pool for the tournament that the owner created is initialized on Oparcade contract
   * @param _gid Game ID
   * @param _proposedGameCreatorFee Proposed game creator fee
   * @param _tournamentCreatorFee Tournament creator fee
   * @param _depositToken Token to allow/disallow the deposit
   * @param _distributionTokenAddress Distribution token address to be set to active
   * @return tid Tournament ID created
   */
  function createTournamentByDAOWithTokens(
    uint256 _gid,
    string memory _tournamentName,
    uint256 _proposedGameCreatorFee,
    uint256 _tournamentCreatorFee,
    Token calldata _depositToken,
    address _distributionTokenAddress
  ) external onlyTournamentManager onlyActiveGame(_gid) returns (uint256 tid) {
    // create the tournament
    tid = _createTournament(_gid, _tournamentName, _proposedGameCreatorFee, _tournamentCreatorFee);

    // set the deposit token address and amount
    _updateDepositTokenAmount(_gid, tid, _depositToken.tokenAddress, _depositToken.tokenAmount);

    // set the distributable token address
    if (!games[_gid].distributable[_distributionTokenAddress]) {
      _updateDistributableTokenAddress(_gid, _distributionTokenAddress, true);
    }

    return tid;
  }

  /**
   * @notice Create the tournament
   * @dev Only owner
   * @dev If the proposed game creaetor fee is 0, the base game creator fee is applied
   * @dev The prize pool for the tournament that the owner created is initialized on Oparcade contract
   * @param _gid Game ID
   * @param _proposedGameCreatorFee Proposed game creator fee
   * @param _tournamentCreatorFee Tournament creator fee
   * @return tid Tournament ID created
   */
  function createTournamentByDAO(
    uint256 _gid,
    string calldata _tournamentName,
    uint256 _proposedGameCreatorFee,
    uint256 _tournamentCreatorFee
  ) external onlyTournamentManager onlyActiveGame(_gid) returns (uint256 tid) {
    tid = _createTournament(_gid, _tournamentName, _proposedGameCreatorFee, _tournamentCreatorFee);
  }

  /**
   * @notice Create the tournament
   * @dev If the proposed game creaetor fee is 0, the base game creator fee is applied
   * @param _gid Game ID
   * @param _proposedGameCreatorFee Proposed game creator fee
   * @param _tournamentCreatorFee Tournament creator fee
   * @return tid Tournament ID created
   */
  function _createTournament(
    uint256 _gid,
    string memory _tournamentName,
    uint256 _proposedGameCreatorFee,
    uint256 _tournamentCreatorFee
  ) internal returns (uint256 tid) {
    // use baseCreatorFee if _proposedGameCreatorFee is zero
    uint256 appliedGameCreatorFee;
    if (_proposedGameCreatorFee == 0) {
      appliedGameCreatorFee = games[_gid].baseCreatorFee;
    } else {
      appliedGameCreatorFee = _proposedGameCreatorFee;
    }

    // check fees
    require(games[_gid].baseCreatorFee <= appliedGameCreatorFee, "Low game creator fee proposed");
    require(platformFee + appliedGameCreatorFee + _tournamentCreatorFee <= MAX_PERMILLAGE, "Exceeded fees");

    // get the new tournament ID
    tid = games[_gid].tournamentsCount;

    // add tournament
    games[_gid].tournamentsCount += 1;
    games[_gid].tournaments[tid].name = _tournamentName;
    games[_gid].tournaments[tid].creatorAddress = msg.sender;
    games[_gid].tournaments[tid].appliedGameCreatorFee = appliedGameCreatorFee;
    games[_gid].tournaments[tid].creatorFee = _tournamentCreatorFee;

    emit TournamentCreated(msg.sender, _gid, tid, _tournamentName, appliedGameCreatorFee, _tournamentCreatorFee);
  }

  /**
   * @notice Create the tournament
   * @dev Anyone can create the tournament and initialize the prize pool with tokens and NFTs
   * @dev Tournament creator should set all params necessary for the tournament in 1 tx and
   * @dev the params set is immutable. It will be prevent the fraud tournament is created
   * @dev Tournament creator should pay fees to create the tournament
   * @dev and the fee token address and fee token amount are set by the owner
   * @dev If the proposed game creaetor fee is 0, the base game creator fee is applied
   * @dev NFT type to initialize the prize pool should be either 721 or 1155
   * @param _gid Game ID
   * @param _proposedGameCreatorFee Proposed game creator fee
   * @param _tournamentCreatorFee Tournament creator fee
   * @param _depositToken Deposit token (address and amount) for playing the tournament
   * @param _tokenToAddPrizePool Token (address and amount) to initialize the prize pool
   * @param _nftAddressToAddPrizePool NFT address to initialize the prize pool
   * @param _nftTypeToAddPrizePool NFT type to initialize the prize pool
   * @param _tokenIdsToAddPrizePool NFT token Id list to initialize the prize pool
   * @param _amountsToAddPrizePool NFT token amount list to initialize the prize pool
   * @return tid Tournament ID created
   */
  function createTournamentByUser(
    uint256 _gid,
    string calldata _tournamentName,
    uint256 _proposedGameCreatorFee,
    uint256 _tournamentCreatorFee,
    Token calldata _depositToken,
    Token calldata _tokenToAddPrizePool,
    address _nftAddressToAddPrizePool,
    uint256 _nftTypeToAddPrizePool,
    uint256[] memory _tokenIdsToAddPrizePool,
    uint256[] memory _amountsToAddPrizePool
  ) external onlyActiveGame(_gid) returns (uint256 tid) {
    // pay the tournament creation fee
    IERC20Upgradeable(tournamentCreationFeeToken).safeTransferFrom(
      msg.sender,
      feeRecipient,
      _depositToken.tokenAmount == 0 ? freeTournamentCreationFeeAmount : paidTournamentCreationFeeAmount
    );

    // create new tournament
    tid = _createTournament(_gid, _tournamentName, _proposedGameCreatorFee, _tournamentCreatorFee);

    // set the deposit token amount
    _updateDepositTokenAmount(_gid, tid, _depositToken.tokenAddress, _depositToken.tokenAmount);

    // set the distributable token
    if (!games[_gid].distributable[_depositToken.tokenAddress] && _depositToken.tokenAmount > 0) {
      _updateDistributableTokenAddress(_gid, _depositToken.tokenAddress, true);
    }
    if (!games[_gid].distributable[_tokenToAddPrizePool.tokenAddress] && _tokenToAddPrizePool.tokenAmount > 0) {
      _updateDistributableTokenAddress(_gid, _tokenToAddPrizePool.tokenAddress, true);
    }

    // initialize the prize pool with tokens
    if (_tokenToAddPrizePool.tokenAmount > 0) {
      IOparcade(addressRegistry.oparcade()).depositPrize(
        msg.sender,
        _gid,
        tid,
        _tokenToAddPrizePool.tokenAddress,
        _tokenToAddPrizePool.tokenAmount
      );
    }

    // initialize the prize pool with NFTs
    if (_nftTypeToAddPrizePool == 721 || _nftTypeToAddPrizePool == 1155) {
      // set the distributable token
      if (!games[_gid].distributable[_nftAddressToAddPrizePool] && _amountsToAddPrizePool.length > 0) {
        _updateDistributableTokenAddress(_gid, _nftAddressToAddPrizePool, true);
      }

      IOparcade(addressRegistry.oparcade()).depositNFTPrize(
        msg.sender,
        _gid,
        tid,
        _nftAddressToAddPrizePool,
        _nftTypeToAddPrizePool,
        _tokenIdsToAddPrizePool,
        _amountsToAddPrizePool
      );
    }
  }

  /**
   * @notice Update deposit token amount
   * @dev Only owner
   * @dev Only tokens with an amount greater than zero is valid for the deposit
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Token address to allow/disallow the deposit
   * @param _amount Token amount
   */
  function updateDepositTokenAmount(
    uint256 _gid,
    uint256 _tid,
    address _token,
    uint256 _amount
  ) external onlyTournamentManager onlyActiveGame(_gid) onlyValidTID(_gid, _tid) {
    _updateDepositTokenAmount(_gid, _tid, _token, _amount);
  }

  /**
   * @notice Update deposit token amount
   * @dev Only tokens with an amount greater than zero is valid for the deposit
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Token address to allow/disallow the deposit
   * @param _amount Token amount
   */
  function _updateDepositTokenAmount(uint256 _gid, uint256 _tid, address _token, uint256 _amount) internal {
    emit DepositAmountUpdated(
      msg.sender,
      _gid,
      _tid,
      games[_gid].tournaments[_tid].name,
      _token,
      games[_gid].tournaments[_tid].depositTokenAmount[_token],
      _amount
    );

    // update deposit token list
    if (_amount > 0) {
      if (games[_gid].tournaments[_tid].depositTokenAmount[_token] == 0) {
        // add the token into the list only if it's added newly
        games[_gid].depositTokenList.push(_token);
      }
    } else {
      for (uint256 i; i < games[_gid].depositTokenList.length; i++) {
        if (_token == games[_gid].depositTokenList[i]) {
          // remove the token from the list
          games[_gid].depositTokenList[i] = games[_gid].depositTokenList[games[_gid].depositTokenList.length - 1];
          games[_gid].depositTokenList.pop();
          break;
        }
      }
    }

    // update deposit token amount
    games[_gid].tournaments[_tid].depositTokenAmount[_token] = _amount;
  }

  /**
   * @notice Update distributable token address
   * @dev Only owner
   * @param _gid Game ID
   * @param _token Token address to allow/disallow the deposit
   * @param _isDistributable true: distributable false: not distributable
   */
  function updateDistributableTokenAddress(
    uint256 _gid,
    address _token,
    bool _isDistributable
  ) external onlyGameManager onlyActiveGame(_gid) {
    _updateDistributableTokenAddress(_gid, _token, _isDistributable);
  }

  /**
   * @notice Update distributable token address
   * @dev Only owner
   * @param _gid Game ID
   * @param _token Token address to allow/disallow the deposit
   * @param _isDistributable true: distributable false: not distributable
   */
  function _updateDistributableTokenAddress(uint256 _gid, address _token, bool _isDistributable) internal {
    emit DistributableTokenAddressUpdated(
      msg.sender,
      _gid,
      _token,
      games[_gid].distributable[_token],
      _isDistributable
    );

    // update distributable token list
    if (_isDistributable) {
      if (!games[_gid].distributable[_token]) {
        // add token to the list only if it's added newly
        games[_gid].distributableTokenList.push(_token);
      }
    } else {
      for (uint256 i; i < games[_gid].distributableTokenList.length; i++) {
        if (_token == games[_gid].distributableTokenList[i]) {
          games[_gid].distributableTokenList[i] = games[_gid].distributableTokenList[
            games[_gid].distributableTokenList.length - 1
          ];
          games[_gid].distributableTokenList.pop();
          break;
        }
      }
    }

    // update distributable token amount
    games[_gid].distributable[_token] = _isDistributable;
  }

  /**
   * @notice Update the platform fee
   * @dev Only owner
   * @dev Allow zero recipient address only of fee is also zero
   * @param _feeRecipient Platform fee recipient address
   * @param _platformFee platform fee
   */
  function updatePlatformFee(address _feeRecipient, uint256 _platformFee) external onlyAdmin {
    require(_feeRecipient != address(0) || _platformFee == 0, "Fee recipient not set");
    require(_platformFee <= MAX_PERMILLAGE, "Platform fee exceeded");

    emit PlatformFeeUpdated(msg.sender, feeRecipient, platformFee, _feeRecipient, _platformFee);

    feeRecipient = _feeRecipient;
    platformFee = _platformFee;
  }

  /**
   * @notice Update the tournament creation fee token
   * @dev Only owner
   * @dev Tournament creator should use this token to pay when creating the tournament
   * @param _tournamentCreationFeeToken Fee token address
   */
  function updateTournamentCreationFeeToken(address _tournamentCreationFeeToken) external onlyAdmin {
    require(_tournamentCreationFeeToken != address(0), "Zero tournament creation fee token");

    emit TournamentCreationFeeTokenUpdated(msg.sender, tournamentCreationFeeToken, _tournamentCreationFeeToken);

    tournamentCreationFeeToken = _tournamentCreationFeeToken;
  }

  /**
   * @notice Update the free tournament creation fee
   * @dev Only owner
   * @dev Tournament creator should pay this fee when creating the tournament
   * @param _freeTournamentCreationFeeAmount Fee token amount
   */
  function updateFreeTournamentCreationFeeAmount(uint256 _freeTournamentCreationFeeAmount) external onlyAdmin {
    emit FreeTournamentCreationFeeAmountUpdated(
      msg.sender,
      freeTournamentCreationFeeAmount,
      _freeTournamentCreationFeeAmount
    );

    freeTournamentCreationFeeAmount = _freeTournamentCreationFeeAmount;
  }

  /**
   * @notice Update the paid tournament creation fee
   * @dev Only owner
   * @dev Tournament creator should pay this fee when creating the tournament
   * @param _paidTournamentCreationFeeAmount Fee token amount
   */
  function updatePaidTournamentCreationFeeAmount(uint256 _paidTournamentCreationFeeAmount) external onlyAdmin {
    emit PaidTournamentCreationFeeAmountUpdated(
      msg.sender,
      paidTournamentCreationFeeAmount,
      _paidTournamentCreationFeeAmount
    );

    paidTournamentCreationFeeAmount = _paidTournamentCreationFeeAmount;
  }
}
