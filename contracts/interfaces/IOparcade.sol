// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

/**
 * @title Oparcade Contract Interface
 * @notice Define the interface used to get the token deposit and withdrawal info
 * @author David Lee
 */
interface IOparcade {
  /**
   * @notice Deposit ERC20 tokens from user
   * @dev Only tokens registered in GameRegistry with an amount greater than zero is valid for the deposit
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Token address to deposit
   */
  function deposit(uint256 _gid, uint256 _tid, address _token) external;

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
  function depositPrize(address _depositor, uint256 _gid, uint256 _tid, address _token, uint256 _amount) external;

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
  ) external;

  /**
   * @notice Distribute winners their prizes
   * @dev Only maintainer
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
  ) external;

  /**
   * @notice Distribute winners' NFT prizes
   * @dev Only maintainer
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
  ) external;

  /**
   * @notice Withdraw the prize tokens from the specific game/tournament
   * @dev Only owner
   * @param _to Beneficiary address
   * @param _gid Game ID
   * @param _tid Tournament ID
   * @param _token Prize token address
   * @param _amount Prize amount to withdraw
   */
  function withdrawPrize(address _to, uint256 _gid, uint256 _tid, address _token, uint256 _amount) external;

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
  ) external;

  /**
   * @notice Pause Oparcade
   * @dev Only owner
   */
  function pause() external;

  /**
   * @notice Resume Oparcade
   * @dev Only owner
   */
  function unpause() external;
}
