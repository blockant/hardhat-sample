// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

/**
 * @title AddressRegistry Contract Interface
 * @notice Define the interface used to get addresses in Oparcade
 * @author David Lee
 */
interface IAddressRegistry {
  /**
   * @notice Provide the Oparcade contract address
   * @dev Can be zero in case of the Oparcade contract is not registered
   * @return address Oparcade contract address
   */
  function oparcade() external view returns (address);

  /**
   * @notice Provide the GameRegistry contract address
   * @dev Can be zero in case of the GameRegistry contract is not registered
   * @return address GameRegistry contract address
   */
  function gameRegistry() external view returns (address);

  /**
   * @notice Provide the maintainer address
   * @dev Can be zero in case of the maintainer address is not registered
   * @return address Maintainer contract address
   */
  function maintainer() external view returns (address);

  /**
   * @notice Provide the timelock contract address
   * @dev Can be zero in case of the timelock address is not registered
   * @return address Timelock contract address
   */
  function timelock() external view returns (address);
}
