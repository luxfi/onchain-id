// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { ClaimIssuer } from "../ClaimIssuer.sol";
import { Errors } from "../libraries/Errors.sol";

contract ClaimIssuerFactory is Ownable {
    
    /// @notice Event emitted when a new ClaimIssuer is deployed
    event ClaimIssuerDeployed(address indexed managementKey, address indexed claimIssuer);

    /// @notice Event emitted when an address is blacklisted
    event Blacklisted(address indexed addr, bool blacklisted);


    mapping(address => address) public deployedClaimIssuers;
    mapping(address => bool) public blacklistedAddresses;

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

        bytes32 salt = bytes32(uint256(uint160(managementKey)));
        bytes memory initCode = abi.encodePacked(
            type(ClaimIssuer).creationCode, 
            abi.encode(managementKey)
        );

        address claimIssuer;
        assembly {
            claimIssuer := create2(0, add(initCode, 0x20), mload(initCode), salt)
            if iszero(extcodesize(claimIssuer)) {
                revert(0, 0)
            }
        }

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

}

