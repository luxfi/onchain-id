// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { CREATE3 } from "solady/src/utils/CREATE3.sol";

import { ClaimIssuer, Identity } from "../ClaimIssuer.sol";
import { Errors } from "../libraries/Errors.sol";

contract ClaimIssuerFactory is Ownable {
    
    /// @notice Event emitted when a new ClaimIssuer is deployed
    event ClaimIssuerDeployed(address indexed managementKey, address indexed claimIssuer);

    /// @notice Event emitted when an address is blacklisted
    event Blacklisted(address indexed addr, bool blacklisted);

    /// @notice Event emitted when the implementation is updated
    event ImplementationUpdated(address indexed oldImplementation, address indexed newImplementation);

    address public implementation;
    mapping(address => address) public deployedClaimIssuers;
    mapping(address => bool) public blacklistedAddresses;

    constructor(address _implementation) Ownable() {
        implementation = _implementation;
    }

    /**
     * @dev Deploys a new ClaimIssuer contract using CREATE2
     * @return The address of the deployed ClaimIssuer contract
     */
    function deployClaimIssuer() external returns (address) {
        return _deployClaimIssuer(msg.sender);
    }

    /**
     * @dev Deploys a ClaimIssuer on behalf of a management key (owner only)
     * @param managementKey The initial management key for the ClaimIssuer
     * @return The address of the deployed ClaimIssuer contract
     */
    function deployClaimIssuerOnBehalf(address managementKey) external onlyOwner returns (address) {
        return _deployClaimIssuer(managementKey);
    }
    
    /**
     * @dev Deploys a new ClaimIssuer contract using CREATE2
     * @param managementKey The initial management key for the ClaimIssuer
     * @return The address of the deployed ClaimIssuer contract
     */
    function _deployClaimIssuer(address managementKey) internal returns (address) {
        require(managementKey != address(0), Errors.ZeroAddress());
        require(!blacklistedAddresses[msg.sender], Errors.Blacklisted(msg.sender));
        require(deployedClaimIssuers[managementKey] == address(0), Errors.ClaimIssuerAlreadyDeployed(managementKey));

        address claimIssuer = CREATE3.deployDeterministic(
            abi.encodePacked(
                type(TransparentUpgradeableProxy).creationCode,
                // TransparentUpgradeableProxy constructor arguments:
                // - implementation address
                // - admin address
                // - data: call initialize(managementKey)
                abi.encode(
                    implementation, 
                    owner(), 
                    abi.encodeWithSelector(bytes4(keccak256("initialize(address)")), managementKey)
                )
            ), 
            bytes32(uint256(uint160(managementKey)))
        );

        deployedClaimIssuers[managementKey] = claimIssuer;
        emit ClaimIssuerDeployed(managementKey, claimIssuer);

        return claimIssuer;
    }

    /**
     * @dev Blacklists an address from deploying ClaimIssuers
     * @param addr The address to blacklist
     */
    function blacklistAddress(address addr, bool blacklisted) external onlyOwner {
        require(addr != address(0), Errors.ZeroAddress());
        blacklistedAddresses[addr] = blacklisted;
        emit Blacklisted(addr, blacklisted);
    }

    /**
     * @dev Updates the implementation address
     * @param newImplementation The new implementation address
     */
    function updateImplementation(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), Errors.ZeroAddress());
    
        address oldImplementation = implementation;
        implementation = newImplementation;
        emit ImplementationUpdated(oldImplementation, newImplementation);
    }

}

