// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

/**
 * @title GameRegistry Contract Interface
 * @notice Define the interface necessary for the GameRegistry
 * @author David Lee
 */
interface IGameRegistry {
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

  /**
   * @return (address) Platform fee recipient
   */
  function feeRecipient() external returns (address);

  /**
   * @return (uint256) Platform fee
   */
  function platformFee() external returns (uint256);

  /**
   * @return (address) Tournament creation fee token address
   */
  function tournamentCreationFeeToken() external returns (address);

  /**
   * @return (uint256) Tournament creation fee token amount
   */
  function tournamentCreationFeeAmount() external returns (uint256);

  /**
   * @notice Returns a boolean indicating if a specific game is deprecated
   * @param _gid Game ID
   * @return (bool) Is deprecated
   */
  function isGameDeprecated(uint256 _gid) external view returns (bool);

  /**
   * @notice Returns the game name
   * @param _gid Game ID
   * @return (string) Game name
   */
  function getGameName(uint256 _gid) external view returns (string memory);

  /**
   * @notice Returns the game creator address
   * @param _gid Game ID
   * @return (string) Game creator address
   */
  function getGameCreatorAddress(uint256 _gid) external view returns (address);

  /**
   * @notice Returns the game creator fee
   * @param _gid Game ID
   * @return (uint256) Game creator fee
   */
  function getGameBaseCreatorFee(uint256 _gid) external view returns (uint256);

  /**
   * @notice Returns true if the token of a specific game is distributable, false otherwise
   * @param _gid Game ID
   * @param _tokenAddress token address
   * @return (uint256) Is token distributable
   */
  function isDistributable(uint256 _gid, address _tokenAddress) external view returns (bool);

  /**
   * @notice Returns the deposit token list of the game
   * @param _gid Game ID
   * @param (address[]) Deposit token list of the game
   */
  function getDepositTokenList(uint256 _gid) external view returns (address[] memory);

  /**
   * @notice Returns the distributable token list of the game
   * @param _gid Game ID
   * @param (address[]) Distributable token list of the game
   */
  function getDistributableTokenList(uint256 _gid) external view returns (address[] memory);

  /**
   * @notice Returns the number of games created
   * @return (uint256) Amount of games created
   */
  function gameCount() external view returns (uint256);

  /**
   * @notice Returns the number of the tournaments of the specific game
   * @param _gid Game ID
   * @return (uint256) Number of the tournament
   */
  function getTournamentCount(uint256 _gid) external view returns (uint256);

  /**
   * @notice Returns the tournament name of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (string) Tournament name
   */
  function getTournamentName(uint256 _gid, uint256 _tid) external view returns (string memory);

  /**
   * @notice Returns the tournament creator fee of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (uint256) Tournament creator fee
   */
  function getTournamentCreatorFee(uint256 _gid, uint256 _tid) external view returns (uint256);

  /**
   * @notice Returns the applied game creator fee of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (string) Game applied game creator fee of a tournament
   */
  function getAppliedGameCreatorFee(uint256 _gid, uint256 _tid) external view returns (uint256);

  /**
   * @notice Returns the deposit token amount of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _tokenAddress token address
   * @return (uint256) Tournament deposit token amount
   */
  function getDepositTokenAmount(uint256 _gid, uint256 _tid, address _tokenAddress) external view returns (uint256);

  /**
   * @notice Returns the tournament creator address of the specific tournament
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @return (address) Tournament creator address
   */
  function getTournamentCreator(uint256 _gid, uint256 _tid) external view returns (address);

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
  ) external returns (uint256);

  /**
   * @notice Remove the exising game
   * @dev Game is not removed from the games array, just set it deprecated
   * @param _gid Game ID
   */
  function removeGame(uint256 _gid) external;

  /**
   * @notice Update the game creator
   * @param _gid Game ID
   * @param _gameCreator Game creator address
   */
  function updateGameCreator(uint256 _gid, address _gameCreator) external;

  /**
   * @notice Update the base game creator fee
   * @dev Tournament creator fee is the royality that will be transferred to the tournament creator address
   * @dev Tournament creator can propose the game creator fee when creating the tournament
   * @dev but it can't be less than the base game creator fee
   * @param _gid Game ID
   * @param _baseGameCreatorFee Base game creator fee
   */
  function updateBaseGameCreatorFee(uint256 _gid, uint256 _baseGameCreatorFee) external;

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
  ) external returns (uint256);

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
  ) external returns (uint256);

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
  ) external returns (uint256 tid);

  /**
   * @notice Update deposit token amount
   * @dev Only owner
   * @dev Only tokens with an amount greater than zero is valid for the deposit
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Token address to allow/disallow the deposit
   * @param _amount Token amount
   */
  function updateDepositTokenAmount(uint256 _gid, uint256 _tid, address _token, uint256 _amount) external;

  /**
   * @notice Update distributable token address
   * @dev Only owner
   * @param _gid Game ID
   * @param _token Token address to allow/disallow the deposit
   * @param _isDistributable true: distributable false: not distributable
   */
  function updateDistributableTokenAddress(uint256 _gid, address _token, bool _isDistributable) external;

  /**
   * @notice Update the platform fee
   * @dev Only owner
   * @dev Allow zero recipient address only of fee is also zero
   * @param _feeRecipient Platform fee recipient address
   * @param _platformFee platform fee
   */
  function updatePlatformFee(address _feeRecipient, uint256 _platformFee) external;

  /**
   * @notice Update the tournament creation fee token
   * @dev Only owner
   * @dev Tournament creator should use this token to pay when creating the tournament
   * @param _tournamentCreationFeeToken Fee token address
   */
  function updateTournamentCreationFeeToken(address _tournamentCreationFeeToken) external;

  /**
   * @notice Update the free tournament creation fee
   * @dev Only owner
   * @dev Tournament creator should pay this fee when creating the tournament
   * @param _freeTournamentCreationFeeAmount Fee token amount
   */

  function updateFreeTournamentCreationFeeAmount(uint256 _freeTournamentCreationFeeAmount) external;

  /**
   * @notice Update the paid tournament creation fee
   * @dev Only owner
   * @dev Tournament creator should pay this fee when creating the tournament
   * @param _paidTournamentCreationFeeAmount Fee token amount
   */
  function updatePaidTournamentCreationFeeAmount(uint256 _paidTournamentCreationFeeAmount) external;

  /**
   * @notice Set the tournament discount value
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _discount Tournament discount to be applied
   */
  function setTournamentDiscount(uint256 _gid, uint256 _tid, uint256 _discount) external;
}
