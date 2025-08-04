// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

import { IIdentity } from "./interface/IIdentity.sol";
import { IClaimIssuer } from "./interface/IClaimIssuer.sol";
import { IERC734 } from "./interface/IERC734.sol";
import { IERC735 } from "./interface/IERC735.sol";
import { Version } from "./version/Version.sol";
import { Errors } from "./libraries/Errors.sol";
import { KeyPurposes } from "./libraries/KeyPurposes.sol";
import { KeyTypes } from "./libraries/KeyTypes.sol";
import { Structs } from "./storage/Structs.sol";

import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title Identity
 * @dev Implementation of the `IERC734` "KeyHolder" and the `IERC735` "ClaimHolder" interfaces
 * into a common Identity Contract.
 *
 * This implementation uses ERC-7201 storage slots for upgradeability, providing:
 * - O(1) key and claim management operations
 * - Efficient index mappings for fast lookups
 * - Swap-and-pop techniques for gas-optimized array operations
 * - Separation of key and claim storage for better organization
 *
 * The contract supports four key purposes:
 * - MANAGEMENT: Keys that can manage the identity
 * - ACTION: Keys that can perform actions on behalf of the identity
 * - CLAIM_SIGNER: Keys that can sign claims for other identities
 * - ENCRYPTION: Keys used for data encryption
 *
 * @custom:security This contract uses ERC-7201 storage slots to prevent storage collision attacks
 * in upgradeable contracts.
 */

contract Identity is IIdentity, Version, MulticallUpgradeable {
    /**
     * @dev ERC-7201 Storage Slots for upgradeable contract pattern
     * These slots ensure no storage collision between different versions of the contract
     *
     * Formula: keccak256(abi.encode(uint256(keccak256(bytes(id))) - 1)) & ~bytes32(uint256(0xff))
     * where id is the namespace identifier
     */
    bytes32 internal constant _KEY_STORAGE_SLOT =
        keccak256(
            abi.encode(
                uint256(keccak256(bytes("onchainid.identity.key.storage"))) - 1
            )
        ) & ~bytes32(uint256(0xff));
    bytes32 internal constant _CLAIM_STORAGE_SLOT =
        keccak256(
            abi.encode(
                uint256(keccak256(bytes("onchainid.identity.claim.storage"))) -
                    1
            )
        ) & ~bytes32(uint256(0xff));

    /**
     * @dev Storage struct for key management and execution data
     * @custom:storage-location erc7201:onchainid.identity.key.storage
     */
    struct KeyStorage {
        /// @dev Nonce used by the execute/approve function to track execution requests
        uint256 executionNonce;
        /// @dev Mapping of key hash to Key struct as defined by IERC734
        mapping(bytes32 => Structs.Key) keys;
        /// @dev Mapping of purpose to array of key hashes for efficient purpose-based lookups
        mapping(uint256 => bytes32[]) keysByPurpose;
        /// @dev Mapping of execution ID to Execution struct for tracking execution requests
        mapping(uint256 => Structs.Execution) executions;
        /// @dev Flag indicating if the contract has been initialized
        bool initialized;
        /// @dev Flag indicating if the contract can be interacted with (prevents direct calls to implementation)
        bool canInteract;
        /// @dev O(1) index mapping: key -> purpose -> index in key.purposes array
        /// @dev Value 0 means not found, value 1+ means found at index (value-1)
        mapping(bytes32 => mapping(uint256 => uint256)) purposeIndexInKey;
        /// @dev O(1) index mapping: purpose -> key -> index in keysByPurpose array
        /// @dev Value 0 means not found, value 1+ means found at index (value-1)
        mapping(uint256 => mapping(bytes32 => uint256)) keyIndexInPurpose;
    }

    /**
     * @dev Storage struct for claim management data
     * @custom:storage-location erc7201:onchainid.identity.claim.storage
     */
    struct ClaimStorage {
        /// @dev Mapping of claim ID to Claim struct as defined by IERC735
        mapping(bytes32 => Structs.Claim) claims;
        /// @dev Mapping of topic to array of claim IDs for efficient topic-based lookups
        mapping(uint256 => bytes32[]) claimsByTopic;
        /// @dev O(1) index mapping: topic -> claimId -> index in claimsByTopic array
        /// @dev Value 0 means not found, value 1+ means found at index (value-1)
        mapping(uint256 => mapping(bytes32 => uint256)) claimIndexInTopic;
        /// @dev Mapping of claimId -> true if claim exists (used for validation/fallback)
        mapping(bytes32 => bool) claimExists;
    }

    /**
     * @dev Returns the key storage struct at the specified ERC-7201 slot
     * @return s The KeyStorage struct pointer for the key management slot
     */
    function _getKeyStorage() internal pure returns (KeyStorage storage s) {
        bytes32 slot = _KEY_STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }

    /**
     * @dev Returns the claim storage struct at the specified ERC-7201 slot
     * @return s The ClaimStorage struct pointer for the claim management slot
     */
    function _getClaimStorage() internal pure returns (ClaimStorage storage s) {
        bytes32 slot = _CLAIM_STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
    /**
     * @notice Prevent any direct calls to the implementation contract (marked by _canInteract = false).
     */
    modifier delegatedOnly() {
        require(
            _getKeyStorage().canInteract,
            Errors.InteractingWithLibraryContractForbidden()
        );
        _;
    }

    /**
     * @notice requires management key to call this function, or internal call
     */
    modifier onlyManager() {
        require(
            msg.sender == address(this) ||
                keyHasPurpose(
                    keccak256(abi.encode(msg.sender)),
                    KeyPurposes.MANAGEMENT
                ),
            Errors.SenderDoesNotHaveManagementKey()
        );
        _;
    }

    /**
     * @notice requires claim key to call this function, or internal call
     */
    modifier onlyClaimKey() {
        require(
            msg.sender == address(this) ||
                keyHasPurpose(
                    keccak256(abi.encode(msg.sender)),
                    KeyPurposes.CLAIM_SIGNER
                ),
            Errors.SenderDoesNotHaveClaimSignerKey()
        );
        _;
    }

    /**
     * @notice constructor of the Identity contract
     * @param initialManagementKey the address of the management key at deployment
     * @param _isLibrary boolean value stating if the contract is library or not
     * calls __Identity_init if contract is not library
     */
    constructor(address initialManagementKey, bool _isLibrary) {
        require(initialManagementKey != address(0), Errors.ZeroAddress());

        if (!_isLibrary) {
            __Identity_init(initialManagementKey);
        } else {
            _getKeyStorage().initialized = true;
        }
    }

    /**
     * @notice When using this contract as an implementation for a proxy, call this initializer with a delegatecall.
     *
     * @param initialManagementKey The ethereum address to be set as the management key of the ONCHAINID.
     */
    function initialize(address initialManagementKey) external {
        require(initialManagementKey != address(0), Errors.ZeroAddress());
        __Identity_init(initialManagementKey);
    }

    /**
     * @dev See {IERC734-execute}.
     * @notice Passes an execution instruction to the keymanager.
     *
     * Execution flow:
     * 1. If the sender is an ACTION key and the destination is external, execution is auto-approved
     * 2. If the sender is a MANAGEMENT key, execution is auto-approved for any destination
     * 3. If the sender is a CLAIM_SIGNER key and the call is to addClaim, execution is auto-approved
     * 4. Otherwise, the execution request must be approved via the `approve` method
     *
     * @param _to The destination address for the execution
     * @param _value The amount of ETH to send with the execution
     * @param _data The calldata for the execution
     * @return executionId The ID to use in the approve function to approve or reject this execution
     */
    function execute(
        address _to,
        uint256 _value,
        bytes memory _data
    ) external payable override delegatedOnly returns (uint256 executionId) {
        KeyStorage storage ks = _getKeyStorage();
        uint256 _executionId = ks.executionNonce;
        ks.executions[_executionId].to = _to;
        ks.executions[_executionId].value = _value;
        ks.executions[_executionId].data = _data;
        ks.executionNonce++;

        emit ExecutionRequested(_executionId, _to, _value, _data);

        // Check if execution can be auto-approved
        if (_canAutoApproveExecution(_to, _data)) {
            _approve(_executionId, true);
        }

        return _executionId;
    }

    /**
     * @notice Gets the current execution nonce
     * @return The current execution nonce
     */
    function getCurrentNonce() external view returns (uint256) {
        return _getKeyStorage().executionNonce;
    }

    /**
     * @dev See {IERC734-getKey}.
     * @notice Implementation of the getKey function from the ERC-734 standard
     * @param _key The public key.  for non-hex and long keys, its the Keccak256 hash of the key
     * @return purposes Returns the full key data, if present in the identity.
     * @return keyType Returns the full key data, if present in the identity.
     * @return key Returns the full key data, if present in the identity.
     */
    function getKey(
        bytes32 _key
    )
        external
        view
        override
        returns (uint256[] memory purposes, uint256 keyType, bytes32 key)
    {
        KeyStorage storage ks = _getKeyStorage();
        return (
            ks.keys[_key].purposes,
            ks.keys[_key].keyType,
            ks.keys[_key].key
        );
    }

    /**
     * @dev See {IERC734-getKeyPurposes}.
     * @notice gets the purposes of a key
     * @param _key The public key.  for non-hex and long keys, its the Keccak256 hash of the key
     * @return _purposes Returns the purposes of the specified key
     */
    function getKeyPurposes(
        bytes32 _key
    ) external view override returns (uint256[] memory _purposes) {
        return (_getKeyStorage().keys[_key].purposes);
    }

    /**
     * @dev See {IERC734-getKeysByPurpose}.
     * @notice gets all the keys with a specific purpose from an identity
     * @param _purpose a uint256[] Array of the key types, like 1 = MANAGEMENT, 2 = ACTION, 3 = CLAIM, 4 = ENCRYPTION
     * @return keys Returns an array of public key bytes32 hold by this identity and having the specified purpose
     */
    function getKeysByPurpose(
        uint256 _purpose
    ) external view override returns (bytes32[] memory keys) {
        return _getKeyStorage().keysByPurpose[_purpose];
    }

    /**
     * @dev See {IERC735-getClaimIdsByTopic}.
     * @notice Implementation of the getClaimIdsByTopic function from the ERC-735 standard.
     * used to get all the claims from the specified topic
     * @param _topic The identity of the claim i.e. keccak256(abi.encode(_issuer, _topic))
     * @return claimIds Returns an array of claim IDs by topic.
     */
    function getClaimIdsByTopic(
        uint256 _topic
    ) external view override returns (bytes32[] memory claimIds) {
        return _getClaimStorage().claimsByTopic[_topic];
    }

    /**
     * @notice Gets the execution data for a specific execution ID
     * @param _executionId The execution ID to get data for
     * @return execution including (to, value, data, approved, executed)
     */
    function getExecutionData(
        uint256 _executionId
    ) external view returns (Structs.Execution memory execution) {
        return _getKeyStorage().executions[_executionId];
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     * @notice Returns true if this contract implements the interface defined by interfaceId
     * @param interfaceId The interface identifier, as specified in ERC-165
     * @return true if the interface is supported, false otherwise
     */
    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return (interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC734).interfaceId ||
            interfaceId == type(IERC735).interfaceId ||
            interfaceId == type(IIdentity).interfaceId);
    }

    /**
     * @dev See {IERC734-addKey}.
     * @notice Adds a key to the identity with the specified purpose.
     *
     * This function uses O(1) index mappings for efficient lookups and updates, eliminating
     * the need for linear searches through arrays.
     *
     * Key purposes:
     * - MANAGEMENT: Keys that can manage the identity (add/remove keys, etc.)
     * - ACTION: Keys that can perform actions on behalf of the identity
     * - CLAIM_SIGNER: Keys that can sign claims for other identities
     * - ENCRYPTION: Keys used for data encryption
     *
     * Access control: Only MANAGEMENT keys or the identity itself can add keys.
     *
     * @param _key The keccak256 hash of the ethereum address or public key
     * @param _purpose The purpose of the key (MANAGEMENT, ACTION, CLAIM_SIGNER, ENCRYPTION)
     * @param _type The type of key (ECDSA, RSA, etc.)
     * @return success True if the key was successfully added
     *
     */
    function addKey(
        bytes32 _key,
        uint256 _purpose,
        uint256 _type
    ) public override delegatedOnly onlyManager returns (bool success) {
        KeyStorage storage ks = _getKeyStorage();

        // 1. Early validation: Reject if key already has this purpose (O(1) lookup)
        require(
            ks.purposeIndexInKey[_key][_purpose] == 0,
            Errors.KeyAlreadyHasPurpose(_key, _purpose)
        );

        Structs.Key storage k = ks.keys[_key];

        // 2. Initialize new key if it doesn't exist yet
        if (k.key == bytes32(0)) {
            k.key = _key;
            k.keyType = _type;
        }

        // 3. Add purpose to key.purposes array and update index mapping
        k.purposes.push(_purpose);
        ks.purposeIndexInKey[_key][_purpose] = k.purposes.length; // Store 1-based index

        // 4. Add key to _keysByPurpose array and update index mapping
        ks.keysByPurpose[_purpose].push(_key);
        ks.keyIndexInPurpose[_purpose][_key] = ks
            .keysByPurpose[_purpose]
            .length; // Store 1-based index

        emit KeyAdded(_key, _purpose, _type);
        return true;
    }

    /**
     * @dev See {IERC734-removeKey}.
     * @notice Removes a purpose from a key.
     *
     * This function uses O(1) index mappings and efficient swap-and-pop technique
     * to maintain array consistency without gaps, ensuring optimal gas usage.
     *
     * The swap-and-pop technique:
     * 1. Moves the last element to the position of the element being removed
     * 2. Updates the index mappings for the swapped element
     * 3. Removes the last element (which is now the target element)
     *
     * Access control: Only MANAGEMENT keys or the identity itself can remove keys.
     *
     * @param _key The key to remove the purpose from
     * @param _purpose The purpose to remove from the key
     * @return success True if the purpose was successfully removed
     *
     */
    function removeKey(
        bytes32 _key,
        uint256 _purpose
    ) public override delegatedOnly onlyManager returns (bool success) {
        KeyStorage storage ks = _getKeyStorage();

        // Fetch the key data for efficient access
        Structs.Key storage k = ks.keys[_key];

        // 1. Validate key exists
        require(k.key == _key, Errors.KeyNotRegistered(_key));

        // 2. Validate key has the specified purpose (O(1) lookup)
        uint256 purposeIdxPlusOne = ks.purposeIndexInKey[_key][_purpose];
        require(
            purposeIdxPlusOne > 0,
            Errors.KeyDoesNotHavePurpose(_key, _purpose)
        );
        uint256 purposeIdx = purposeIdxPlusOne - 1; // Convert to 0-based index

        // Remove purpose from key struct
        _removePurposeFromKey(_key, _purpose, purposeIdx);

        // Remove key from purpose index
        uint256 keyIdxPlusOne = ks.keyIndexInPurpose[_purpose][_key];
        uint256 keyIdx = keyIdxPlusOne - 1; // Convert to 0-based index
        _removeKeyFromPurposeIndex(_key, _purpose, keyIdx);

        // Emit event and cleanup
        emit KeyRemoved(_key, _purpose, k.keyType);

        // If key has no more purposes, delete the entire key struct to save gas
        if (k.purposes.length == 0) {
            delete ks.keys[_key];
        }

        return true;
    }

    /**
     * @dev See {IERC735-addClaim}.
     * @notice Adds or updates a claim for this identity.
     *
     * This function uses O(1) index mappings for efficient claim management, eliminating
     * the need for linear searches through claim arrays.
     *
     * Claim validation:
     * - If the issuer is not the identity itself, the claim must be validated by the issuer
     * - Self-issued claims are automatically valid
     * - The signature must follow the structure: keccak256(abi.encode(identityHolder_address, topic, data))
     *
     * Access control: Only CLAIM_SIGNER keys can add claims.
     *
     * @param _topic The type/category of the claim
     * @param _scheme The verification scheme for the claim (ECDSA, RSA, etc.)
     * @param _issuer The address of the claim issuer (can be the identity itself)
     * @param _signature The cryptographic proof that the issuer authorized this claim
     * @param _data The claim data or hash of the claim data
     * @param _uri The location of additional claim data (HTTP, IPFS, etc.)
     * @return claimRequestId The unique identifier for this claim
     *
     */
    function addClaim(
        uint256 _topic,
        uint256 _scheme,
        address _issuer,
        bytes memory _signature,
        bytes memory _data,
        string memory _uri
    )
        public
        override
        delegatedOnly
        onlyClaimKey
        returns (bytes32 claimRequestId)
    {
        // 1. Validate claim if issuer is not self
        if (_issuer != address(this)) {
            _validateExternalClaim(_issuer, _topic, _signature, _data);
        }

        ClaimStorage storage cs = _getClaimStorage();
        bytes32 claimId = keccak256(abi.encode(_issuer, _topic));
        Structs.Claim storage c = cs.claims[claimId];

        // 2. New claim or update existing
        bool isNew = !cs.claimExists[claimId];
        c.topic = _topic;
        c.scheme = _scheme;
        c.signature = _signature;
        c.data = _data;
        c.uri = _uri;

        if (isNew) {
            _setupNewClaim(claimId, _topic, _issuer);
        }

        _emitClaimEvent(
            claimId,
            _topic,
            _scheme,
            _issuer,
            _signature,
            _data,
            _uri,
            isNew
        );
        return claimId;
    }

    /**
     * @dev See {IERC735-removeClaim}.
     * @notice Removes a claim from this identity.
     *
     * This function uses O(1) index mappings and efficient swap-and-pop technique
     * to maintain array consistency without gaps, ensuring optimal gas usage.
     *
     * The swap-and-pop technique:
     * 1. Moves the last claim to the position of the claim being removed
     * 2. Updates the index mappings for the swapped claim
     * 3. Removes the last claim (which is now the target claim)
     *
     * Access control: Only CLAIM_SIGNER keys can remove claims.
     *
     * @param _claimId The unique identifier of the claim (keccak256(abi.encode(issuer, topic)))
     * @return success True if the claim was successfully removed
     *
     */
    function removeClaim(
        bytes32 _claimId
    ) public override delegatedOnly onlyClaimKey returns (bool success) {
        ClaimStorage storage cs = _getClaimStorage();

        // 1. Validate claim exists and get topic
        Structs.Claim storage c = cs.claims[_claimId];
        uint256 topic = c.topic;
        require(topic != 0, Errors.ClaimNotRegistered(_claimId));

        // 2. Get claim index using O(1) lookup
        uint256 claimIdxPlusOne = cs.claimIndexInTopic[topic][_claimId];
        require(claimIdxPlusOne > 0, "Claim index missing");
        uint256 claimIdx = claimIdxPlusOne - 1; // Convert to 0-based index

        // Remove claim from topic index
        _removeClaimFromTopicIndex(_claimId, topic, claimIdx);

        // Emit event and clean up claim
        emit ClaimRemoved(
            _claimId,
            topic,
            c.scheme,
            c.issuer,
            c.signature,
            c.data,
            c.uri
        );

        // Clean up the claim data
        delete cs.claims[_claimId];

        return true;
    }

    /**
     *  @dev See {IERC734-approve}.
     *  @notice Approves an execution.
     *  If the sender is an ACTION key and the destination address is not the identity contract itself, then the
     *  approval is authorized and the operation would be performed.
     *  If the destination address is the identity itself, then the execution would be authorized and performed only
     *  if the sender is a MANAGEMENT key.
     */
    function approve(
        uint256 _id,
        bool _shouldApprove
    ) public override delegatedOnly returns (bool success) {
        KeyStorage storage ks = _getKeyStorage();
        require(_id < ks.executionNonce, Errors.InvalidRequestId());
        require(!ks.executions[_id].executed, Errors.RequestAlreadyExecuted());

        // Validate that the sender has the appropriate key purpose
        if (ks.executions[_id].to == address(this)) {
            require(
                keyHasPurpose(
                    keccak256(abi.encode(msg.sender)),
                    KeyPurposes.MANAGEMENT
                ),
                Errors.SenderDoesNotHaveManagementKey()
            );
        } else {
            require(
                keyHasPurpose(
                    keccak256(abi.encode(msg.sender)),
                    KeyPurposes.ACTION
                ),
                Errors.SenderDoesNotHaveActionKey()
            );
        }

        return _approve(_id, _shouldApprove);
    }

    /**
     * @dev See {IERC735-getClaim}.
     * @notice Implementation of the getClaim function from the ERC-735 standard.
     *
     * @param _claimId The identity of the claim i.e. keccak256(abi.encode(_issuer, _topic))
     *
     * @return topic Returns all the parameters of the claim for the
     * specified _claimId (topic, scheme, signature, issuer, data, uri) .
     * @return scheme Returns all the parameters of the claim for the
     * specified _claimId (topic, scheme, signature, issuer, data, uri) .
     * @return issuer Returns all the parameters of the claim for the
     * specified _claimId (topic, scheme, signature, issuer, data, uri) .
     * @return signature Returns all the parameters of the claim for the
     * specified _claimId (topic, scheme, signature, issuer, data, uri) .
     * @return data Returns all the parameters of the claim for the
     * specified _claimId (topic, scheme, signature, issuer, data, uri) .
     * @return uri Returns all the parameters of the claim for the
     * specified _claimId (topic, scheme, signature, issuer, data, uri) .
     */
    function getClaim(
        bytes32 _claimId
    )
        public
        view
        override
        returns (
            uint256 topic,
            uint256 scheme,
            address issuer,
            bytes memory signature,
            bytes memory data,
            string memory uri
        )
    {
        ClaimStorage storage cs = _getClaimStorage();
        return (
            cs.claims[_claimId].topic,
            cs.claims[_claimId].scheme,
            cs.claims[_claimId].issuer,
            cs.claims[_claimId].signature,
            cs.claims[_claimId].data,
            cs.claims[_claimId].uri
        );
    }

    /**
     * @dev See {IERC734-keyHasPurpose}.
     * @notice Checks if a key has a specific purpose or MANAGEMENT purpose.
     *
     * This function uses O(1) index mappings for efficient lookups instead of
     * linear search through the purposes array. MANAGEMENT keys have universal
     * permissions according to the ERC-734 standard, so any key with MANAGEMENT
     * purpose will return true for any purpose.
     *
     * @param _key The key to check (keccak256 hash of the address)
     * @param _purpose The purpose to check for
     * @return result True if the key has the specified purpose or MANAGEMENT purpose
     *
     */
    function keyHasPurpose(
        bytes32 _key,
        uint256 _purpose
    ) public view override returns (bool result) {
        KeyStorage storage ks = _getKeyStorage();

        // Early return if key doesn't exist
        if (ks.keys[_key].key == 0) return false;

        // O(1) lookup: Check if key has the specific purpose OR MANAGEMENT purpose
        // MANAGEMENT keys have universal permissions in the ERC-734 standard
        return
            ks.purposeIndexInKey[_key][_purpose] > 0 ||
            ks.purposeIndexInKey[_key][KeyPurposes.MANAGEMENT] > 0;
    }

    /**
     * @dev Checks if a claim is valid. Claims issued by the identity are self-attested claims. They do not have a
     * built-in revocation mechanism and are considered valid as long as their signature is valid and they are still
     * stored by the identity contract.
     * @param _identity the identity contract related to the claim
     * @param claimTopic the claim topic of the claim
     * @param sig the signature of the claim
     * @param data the data field of the claim
     * @return claimValid true if the claim is valid, false otherwise
     */
    function isClaimValid(
        IIdentity _identity,
        uint256 claimTopic,
        bytes memory sig,
        bytes memory data
    ) public view virtual override returns (bool claimValid) {
        bytes32 dataHash = keccak256(abi.encode(_identity, claimTopic, data));
        // Use abi.encodePacked to concatenate the message prefix and the message to sign.
        bytes32 prefixedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash)
        );

        // Recover address of data signer
        address recovered = getRecoveredAddress(sig, prefixedHash);

        // Take hash of recovered address
        bytes32 hashedAddr = keccak256(abi.encode(recovered));

        // Does the trusted identifier have they key which signed the user's claim?
        //  && (isClaimRevoked(_claimId) == false)
        return keyHasPurpose(hashedAddr, KeyPurposes.CLAIM_SIGNER);
    }

    /**
     * @dev returns the address that signed the given data
     * @param sig the signature of the data
     * @param dataHash the data that was signed
     * returns the address that signed dataHash and created the signature sig
     */
    function getRecoveredAddress(
        bytes memory sig,
        bytes32 dataHash
    ) public pure returns (address addr) {
        bytes32 ra;
        bytes32 sa;
        uint8 va;

        // Check the signature length
        if (sig.length != 65) {
            return address(0);
        }

        // Divide the signature in r, s and v variables
        // solhint-disable-next-line no-inline-assembly
        assembly {
            ra := mload(add(sig, 32))
            sa := mload(add(sig, 64))
            va := byte(0, mload(add(sig, 96)))
        }

        if (va < 27) {
            va += 27;
        }

        address recoveredAddress = ecrecover(dataHash, va, ra, sa);

        return (recoveredAddress);
    }

    /**
     * @dev Internal method to handle the actual approval logic
     * @param _id The execution ID to approve
     * @param _shouldApprove Whether to approve or reject the execution
     * @return success Whether the execution was successful
     */
    function _approve(
        uint256 _id,
        bool _shouldApprove
    ) internal returns (bool success) {
        KeyStorage storage ks = _getKeyStorage();
        emit Approved(_id, _shouldApprove);

        if (_shouldApprove) {
            ks.executions[_id].approved = true;

            // solhint-disable-next-line avoid-low-level-calls
            (success, ) = ks.executions[_id].to.call{
                value: (ks.executions[_id].value)
            }(ks.executions[_id].data);

            if (success) {
                ks.executions[_id].executed = true;

                emit Executed(
                    _id,
                    ks.executions[_id].to,
                    ks.executions[_id].value,
                    ks.executions[_id].data
                );

                return true;
            } else {
                emit ExecutionFailed(
                    _id,
                    ks.executions[_id].to,
                    ks.executions[_id].value,
                    ks.executions[_id].data
                );

                return false;
            }
        } else {
            ks.executions[_id].approved = false;
        }
        return false;
    }

    /**
     * @dev Internal helper to remove purpose from key struct using swap-and-pop technique.
     *
     * This function efficiently removes a purpose from a key's purposes array while
     * maintaining array consistency and updating the index mappings.
     *
     * @param _key The key to remove the purpose from
     * @param _purpose The purpose to remove
     * @param _purposeIdx The 0-based index of the purpose in the key.purposes array
     */
    function _removePurposeFromKey(
        bytes32 _key,
        uint256 _purpose,
        uint256 _purposeIdx
    ) internal {
        KeyStorage storage ks = _getKeyStorage();
        Structs.Key storage k = ks.keys[_key];
        uint256 lastPurposeIdx = k.purposes.length - 1;

        if (_purposeIdx != lastPurposeIdx) {
            // Swap-and-pop: Move last element to current position to maintain array consistency
            uint256 lastPurpose = k.purposes[lastPurposeIdx];
            k.purposes[_purposeIdx] = lastPurpose;

            // Update index mapping for the swapped purpose
            ks.purposeIndexInKey[_key][lastPurpose] = _purposeIdx + 1;
        }

        // Remove the last element (either the target or the swapped element)
        k.purposes.pop();

        // Clean up the index mapping for the removed purpose
        delete ks.purposeIndexInKey[_key][_purpose];
    }

    /**
     * @dev Internal helper to remove claim from topic index using swap-and-pop technique.
     *
     * This function efficiently removes a claim from a topic's claims array while
     * maintaining array consistency and updating the index mappings.
     *
     * @param _claimId The claim ID to remove
     * @param _topic The topic of the claim
     * @param _claimIdx The 0-based index of the claim in the claimsByTopic array
     */
    function _removeClaimFromTopicIndex(
        bytes32 _claimId,
        uint256 _topic,
        uint256 _claimIdx
    ) internal {
        ClaimStorage storage cs = _getClaimStorage();
        uint256 lastClaimIdx = cs.claimsByTopic[_topic].length - 1;

        if (_claimIdx != lastClaimIdx) {
            // Swap-and-pop: Move last element to current position to maintain array consistency
            bytes32 lastClaimId = cs.claimsByTopic[_topic][lastClaimIdx];
            cs.claimsByTopic[_topic][_claimIdx] = lastClaimId;

            // Update index mapping for the swapped claim
            cs.claimIndexInTopic[_topic][lastClaimId] = _claimIdx + 1;
        }

        // Remove the last element (either the target or the swapped element)
        cs.claimsByTopic[_topic].pop();

        // Clean up the index mapping for the removed claim
        delete cs.claimIndexInTopic[_topic][_claimId];
        delete cs.claimExists[_claimId];
    }

    /**
     * @dev Internal helper to remove key from purpose index using swap-and-pop technique.
     *
     * This function efficiently removes a key from a purpose's keys array while
     * maintaining array consistency and updating the index mappings.
     *
     * @param _key The key to remove from the purpose
     * @param _purpose The purpose to remove the key from
     * @param _keyIdx The 0-based index of the key in the keysByPurpose array
     */
    function _removeKeyFromPurposeIndex(
        bytes32 _key,
        uint256 _purpose,
        uint256 _keyIdx
    ) internal {
        KeyStorage storage ks = _getKeyStorage();
        uint256 lastKeyIdx = ks.keysByPurpose[_purpose].length - 1;

        if (_keyIdx != lastKeyIdx) {
            // Swap-and-pop: Move last key to current position
            bytes32 lastKey = ks.keysByPurpose[_purpose][lastKeyIdx];
            ks.keysByPurpose[_purpose][_keyIdx] = lastKey;

            // Update index mapping for the swapped key
            ks.keyIndexInPurpose[_purpose][lastKey] = _keyIdx + 1;
        }

        // Remove the last key (either the target or the swapped key)
        ks.keysByPurpose[_purpose].pop();

        // Clean up the index mapping for this key in the purpose group
        delete ks.keyIndexInPurpose[_purpose][_key];
    }

    /**
     * @dev Internal helper to setup new claim tracking with index mappings.
     *
     * This function initializes the index mappings for a new claim to enable
     * O(1) lookups and efficient claim management.
     *
     * @param _claimId The unique identifier of the claim
     * @param _topic The topic of the claim
     * @param _issuer The address of the claim issuer
     */
    function _setupNewClaim(
        bytes32 _claimId,
        uint256 _topic,
        address _issuer
    ) internal {
        ClaimStorage storage cs = _getClaimStorage();
        cs.claimsByTopic[_topic].push(_claimId);
        cs.claimIndexInTopic[_topic][_claimId] = cs
            .claimsByTopic[_topic]
            .length; // index+1
        cs.claimExists[_claimId] = true;
        cs.claims[_claimId].issuer = _issuer;
    }

    /**
     * @dev Internal helper to emit appropriate claim events based on whether the claim is new or updated.
     *
     * This function emits either ClaimAdded or ClaimChanged events depending on whether
     * the claim is being added for the first time or updated.
     *
     * @param _claimId The unique identifier of the claim
     * @param _topic The topic of the claim
     * @param _scheme The verification scheme for the claim
     * @param _issuer The address of the claim issuer
     * @param _signature The cryptographic proof of the claim
     * @param _data The claim data or hash
     * @param _uri The location of additional claim data
     * @param _isNew Whether this is a new claim (true) or an update (false)
     */
    function _emitClaimEvent(
        bytes32 _claimId,
        uint256 _topic,
        uint256 _scheme,
        address _issuer,
        bytes memory _signature,
        bytes memory _data,
        string memory _uri,
        bool _isNew
    ) internal {
        if (_isNew) {
            emit ClaimAdded(
                _claimId,
                _topic,
                _scheme,
                _issuer,
                _signature,
                _data,
                _uri
            );
        } else {
            emit ClaimChanged(
                _claimId,
                _topic,
                _scheme,
                _issuer,
                _signature,
                _data,
                _uri
            );
        }
    }
    /**
     * @notice Initializer internal function for the Identity contract.
     *
     *  * @dev This function sets up the initial management key and initializes all
     * storage mappings including the new index mappings for efficient key management.
     * @param initialManagementKey The ethereum address to be set as the management key of the ONCHAINID.
     */
    // solhint-disable-next-line func-name-mixedcase
    function __Identity_init(address initialManagementKey) internal {
        KeyStorage storage ks = _getKeyStorage();
        require(
            !ks.initialized || _isConstructor(),
            Errors.InitialKeyAlreadySetup()
        );
        ks.initialized = true;
        ks.canInteract = true;

        // Set up the initial management key
        bytes32 _key = keccak256(abi.encode(initialManagementKey));
        ks.keys[_key].key = _key;
        ks.keys[_key].purposes = [KeyPurposes.MANAGEMENT]; // MANAGEMENT purpose
        ks.keys[_key].keyType = KeyTypes.ECDSA; // ECDSA key type
        ks.keysByPurpose[KeyPurposes.MANAGEMENT].push(_key);

        // Initialize index mappings for O(1) lookups
        // Store 1-based indices (0 means not found, 1+ means found at index-1)
        ks.purposeIndexInKey[_key][KeyPurposes.MANAGEMENT] = 1; // First purpose at index 0 + 1
        ks.keyIndexInPurpose[KeyPurposes.MANAGEMENT][_key] = 1; // First key at index 0 + 1

        emit KeyAdded(_key, KeyPurposes.MANAGEMENT, KeyTypes.ECDSA);
    }

    /**
     * @dev Internal method to check if an execution can be auto-approved based on key purposes.
     *
     * This function determines whether an execution request can be automatically approved
     * without requiring manual approval through the approve function.
     *
     * Auto-approval conditions:
     * 1. MANAGEMENT keys can auto-approve any execution
     * 2. CLAIM_SIGNER keys can auto-approve addClaim calls to the identity itself
     * 3. ACTION keys can auto-approve external calls (not to the identity itself)
     *
     * @param _to The target address of the execution
     * @param _data The execution data (calldata)
     * @return canAutoApprove Whether the execution can be auto-approved
     */
    function _canAutoApproveExecution(
        address _to,
        bytes memory _data
    ) internal view returns (bool canAutoApprove) {
        // MANAGEMENT keys can auto-approve any execution
        if (
            keyHasPurpose(
                keccak256(abi.encode(msg.sender)),
                KeyPurposes.MANAGEMENT
            )
        ) {
            return true;
        }

        // For identity contract calls, check if it's an addClaim call with CLAIM_SIGNER key
        if (_to == address(this) && _data.length >= 4) {
            bytes4 selector;
            assembly {
                selector := mload(add(_data, 32))
            }
            if (
                selector == this.addClaim.selector &&
                keyHasPurpose(
                    keccak256(abi.encode(msg.sender)),
                    KeyPurposes.CLAIM_SIGNER
                )
            ) {
                return true;
            }
        }

        // ACTION keys can auto-approve external calls
        if (
            _to != address(this) &&
            keyHasPurpose(keccak256(abi.encode(msg.sender)), KeyPurposes.ACTION)
        ) {
            return true;
        }

        return false;
    }

    /**
     * @dev Internal helper to validate claim with external issuer.
     *
     * This function validates that a claim issued by an external issuer is valid
     * by calling the issuer's isClaimValid function.
     *
     * @param _issuer The address of the claim issuer
     * @param _topic The topic of the claim
     * @param _signature The cryptographic proof of the claim
     * @param _data The claim data or hash
     *
     */
    function _validateExternalClaim(
        address _issuer,
        uint256 _topic,
        bytes memory _signature,
        bytes memory _data
    ) internal view {
        require(
            IClaimIssuer(_issuer).isClaimValid(
                IIdentity(address(this)),
                _topic,
                _signature,
                _data
            ),
            Errors.InvalidClaim()
        );
    }

    /**
     * @notice Computes if the context in which the function is called is a constructor or not.
     *
     * @return true if the context is a constructor.
     */
    function _isConstructor() private view returns (bool) {
        address self = address(this);
        uint256 cs;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            cs := extcodesize(self)
        }
        return cs == 0;
    }
}
