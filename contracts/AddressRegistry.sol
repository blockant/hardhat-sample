// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title AddressRegistry
 * @notice This stores all addresses in the Oparcade
 * @author David Lee
 */
contract AddressRegistry is AccessControlUpgradeable {
  event OparcadeUpdated(address indexed oldOparcade, address indexed newOparcade);
  event GameRegistryUpdated(address indexed oldGameRegistry, address indexed newGameRegistry);
  event TimelockUpdated(address indexed oldTimelock, address indexed newTimelock);

  /// @dev Oparcade contract address, can be zero if not set
  address public oparcade;

  /// @dev GameRegistry contract address, can be zero if not set
  address public gameRegistry;

  /// @dev Timelock contract address, can be zero if not set
  address public timelock;

  modifier onlyAdmin() {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Admin role missing");
    _;
  }

  function initialize() public initializer {
    __AccessControl_init();

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /**
   * @notice Update Oparcade contract address
   * @dev Only owner
   * @param _oparcade Oparcade contract address
   */
  function updateOparcade(address _oparcade) external onlyAdmin {
    require(_oparcade != address(0), "!Oparcade");

    emit OparcadeUpdated(oparcade, _oparcade);

    oparcade = _oparcade;
  }

  /**
   * @notice Update GameRegistry contract address
   * @dev Only owner
   * @param _gameRegistry TokenRegistry contract address
   */
  function updateGameRegistry(address _gameRegistry) external onlyAdmin {
    require(_gameRegistry != address(0), "!GameRegistry");

    emit GameRegistryUpdated(gameRegistry, _gameRegistry);

    gameRegistry = _gameRegistry;
  }

  /**
   * @notice Update Timelock contract address
   * @dev Only owner
   * @param _timelock Timelock address
   */
  function updateTimelock(address _timelock) external onlyAdmin {
    require(_timelock != address(0), "!Timelock");

    emit TimelockUpdated(timelock, _timelock);

    timelock = _timelock;
  }
}
