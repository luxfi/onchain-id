// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.27;

/**
 * @dev Version contract gives the versioning information of the implementation contract
 * @notice This contract is designed to be inherited and overridden by upgradeable contracts
 * and provides ERC-7201 storage for version management
 */
contract Version {
    /**
     * @dev Storage struct for version management data
     * @custom:storage-location erc7201:onchainid.identity.version.storage
     */
    struct VersionStorage {
        string version;
    }

    // ========= ERC-7201 Version Storage =========
    bytes32 internal constant _VERSION_STORAGE_SLOT =
        keccak256(
            abi.encode(
                uint256(
                    keccak256(bytes("onchainid.identity.version.storage"))
                ) - 1
            )
        ) & ~bytes32(uint256(0xff));

    /**
     * @dev Returns the current version of the contract.
     * @notice This function reads the version from ERC-7201 storage
     * @return The version string
     */
    function version() external view virtual returns (string memory) {
        return _getVersion();
    }

    /**
     * @dev Internal function to get the current version.
     * @notice This function reads the version from ERC-7201 storage
     * @return The version string
     */
    function _getVersion() internal view returns (string memory) {
        return _getVersionStorage().version;
    }

    /**
     * @dev Initializes the version storage with the specified version.
     * @notice This function should be called during contract initialization.
     * @param initialVersion The initial version string
     */
    // solhint-disable-next-line func-name-mixedcase
    function __Version_init(string memory initialVersion) internal {
        _getVersionStorage().version = initialVersion;
    }

    /**
     * @dev Sets the version to a new value.
     * @notice This function should be called during contract upgrades to set new versions.
     * @param newVersion The new version string
     */
    function _setVersion(string memory newVersion) internal {
        _getVersionStorage().version = newVersion;
    }

    /**
     * @dev Returns the version storage struct at the specified ERC-7201 slot
     * @return s The VersionStorage struct pointer for the version management slot
     */
    function _getVersionStorage()
        internal
        pure
        virtual
        returns (VersionStorage storage s)
    {
        bytes32 slot = _VERSION_STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
