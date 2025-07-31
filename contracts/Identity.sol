// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

import { IIdentity } from "./interface/IIdentity.sol";
import { IClaimIssuer } from "./interface/IClaimIssuer.sol";
import { IERC734 } from "./interface/IERC734.sol";
import { IERC735 } from "./interface/IERC735.sol";
import { Version } from "./version/Version.sol";
import { Storage } from "./storage/Storage.sol";
import { Errors } from "./libraries/Errors.sol";
import { KeyPurposes } from "./libraries/KeyPurposes.sol";

import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @dev Implementation of the `IERC734` "KeyHolder" and the `IERC735` "ClaimHolder" interfaces
 * into a common Identity Contract.
 * This implementation has a separate contract were it declares all storage,
 * allowing for it to be used as an upgradable logic contract.
 */
contract Identity is Storage, IIdentity, Version, MulticallUpgradeable {
    /**
     * @notice Prevent any direct calls to the implementation contract (marked by _canInteract = false).
     */
    modifier delegatedOnly() {
        require(_canInteract, Errors.InteractingWithLibraryContractForbidden());
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
            _initialized = true;
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
     * If the sender is an ACTION key and the destination address is not the identity contract itself, then the
     * execution is immediately approved and performed.
     * If the destination address is the identity itself, then the execution would be performed immediately only if
     * the sender is a MANAGEMENT key.
     * Otherwise the execution request must be approved via the `approve` method.
     * @return executionId to use in the approve function, to approve or reject this execution.
     */
    function execute(
        address _to,
        uint256 _value,
        bytes memory _data
    ) external payable override delegatedOnly returns (uint256 executionId) {
        uint256 _executionId = _executionNonce;
        _executions[_executionId].to = _to;
        _executions[_executionId].value = _value;
        _executions[_executionId].data = _data;
        _executionNonce++;

        emit ExecutionRequested(_executionId, _to, _value, _data);

        // Check if execution can be auto-approved
        if (_canAutoApproveExecution(_to, _data)) {
            _approve(_executionId, true);
        }

        return _executionId;
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
        return (_keys[_key].purposes, _keys[_key].keyType, _keys[_key].key);
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
        return (_keys[_key].purposes);
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
        return _keysByPurpose[_purpose];
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
        return _claimsByTopic[_topic];
    }

    /**
     * @notice Gets the current execution nonce
     * @return The current execution nonce
     */
    function getCurrentNonce() external view returns (uint256) {
        return _executionNonce;
    }

    /**
     * @notice Gets the execution data for a specific execution ID
     * @param _executionId The execution ID to get data for
     * @return execution including (to, value, data, approved, executed)
     */
    function getExecutionData(
        uint256 _executionId
    ) external view returns (Execution memory execution) {
        return _executions[_executionId];
    }

    /**
     * @notice implementation of the addKey function of the ERC-734 standard
     * Adds a _key to the identity. The _purpose specifies the purpose of key. Initially we propose four purposes:
     * 1: MANAGEMENT keys, which can manage the identity
     * 2: ACTION keys, which perform actions in this identities name (signing, logins, transactions, etc.)
     * 3: CLAIM signer keys, used to sign claims on other identities which need to be revokable.
     * 4: ENCRYPTION keys, used to encrypt data e.g. hold in claims.
     * MUST only be done by keys of purpose 1, or the identity itself.
     * If its the identity itself, the approval process will determine its approval.
     *
     * @dev This function uses O(1) index mappings for efficient lookups and updates.
     * @param _key keccak256 representation of an ethereum address
     * @param _type type of key used, which would be a uint256 for different key types. e.g. 1 = ECDSA, 2 = RSA, etc.
     * @param _purpose a uint256 specifying the key type, like 1 = MANAGEMENT, 2 = ACTION, 3 = CLAIM, 4 = ENCRYPTION
     * @return success Returns TRUE if the addition was successful and FALSE if not
     */
    function addKey(
        bytes32 _key,
        uint256 _purpose,
        uint256 _type
    ) public override delegatedOnly onlyManager returns (bool success) {
        // 1. Early validation: Reject if key already has this purpose (O(1) lookup)
        require(
            _purposeIndexInKey[_key][_purpose] == 0,
            Errors.KeyAlreadyHasPurpose(_key, _purpose)
        );

        Key storage k = _keys[_key];

        // 2. Initialize new key if it doesn't exist yet
        if (k.key == bytes32(0)) {
            k.key = _key;
            k.keyType = _type;
        }

        // 3. Add purpose to key.purposes array and update index mapping
        k.purposes.push(_purpose);
        _purposeIndexInKey[_key][_purpose] = k.purposes.length; // Store 1-based index

        // 4. Add key to _keysByPurpose array and update index mapping
        _keysByPurpose[_purpose].push(_key);
        _keyIndexInPurpose[_purpose][_key] = _keysByPurpose[_purpose].length; // Store 1-based index

        emit KeyAdded(_key, _purpose, _type);
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
        require(_id < _executionNonce, Errors.InvalidRequestId());
        require(!_executions[_id].executed, Errors.RequestAlreadyExecuted());

        // Validate that the sender has the appropriate key purpose
        if (_executions[_id].to == address(this)) {
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
     * @dev Internal method to handle the actual approval logic
     * @param _id The execution ID to approve
     * @param _shouldApprove Whether to approve or reject the execution
     * @return success Whether the execution was successful
     */
    function _approve(
        uint256 _id,
        bool _shouldApprove
    ) internal returns (bool success) {
        emit Approved(_id, _shouldApprove);

        if (_shouldApprove) {
            _executions[_id].approved = true;

            // solhint-disable-next-line avoid-low-level-calls
            (success, ) = _executions[_id].to.call{
                value: (_executions[_id].value)
            }(_executions[_id].data);

            if (success) {
                _executions[_id].executed = true;

                emit Executed(
                    _id,
                    _executions[_id].to,
                    _executions[_id].value,
                    _executions[_id].data
                );

                return true;
            } else {
                emit ExecutionFailed(
                    _id,
                    _executions[_id].to,
                    _executions[_id].value,
                    _executions[_id].data
                );

                return false;
            }
        } else {
            _executions[_id].approved = false;
        }
        return false;
    }

    /**
     * @dev Internal method to check if an execution can be auto-approved based on key purposes
     * @param _to The target address of the execution
     * @param _data The execution data
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
     * @dev See {IERC734-removeKey}.
     * @notice Remove the purpose from a key.
     *
     * @dev This function uses O(1) index mappings and efficient swap-and-pop technique
     * to maintain array consistency without gaps, ensuring optimal gas usage.
     * @param _key The key to remove the purpose from
     * @param _purpose The purpose to remove from the key
     * @return success Returns TRUE if the removal was successful
     */
    function removeKey(
        bytes32 _key,
        uint256 _purpose
    ) public override delegatedOnly onlyManager returns (bool success) {
        // Fetch the key data for efficient access
        Key storage k = _keys[_key];

        // 1. Validate key exists
        require(k.key == _key, Errors.KeyNotRegistered(_key));

        // 2. Validate key has the specified purpose (O(1) lookup)
        uint256 purposeIdxPlusOne = _purposeIndexInKey[_key][_purpose];
        require(
            purposeIdxPlusOne > 0,
            Errors.KeyDoesNotHavePurpose(_key, _purpose)
        );
        uint256 purposeIdx = purposeIdxPlusOne - 1; // Convert to 0-based index

        // ===========================================
        // STEP 1: REMOVE PURPOSE FROM KEY STRUCT
        // ===========================================

        uint256 lastPurposeIdx = k.purposes.length - 1;

        if (purposeIdx != lastPurposeIdx) {
            // Swap-and-pop: Move last element to current position to maintain array consistency
            uint256 lastPurpose = k.purposes[lastPurposeIdx];
            k.purposes[purposeIdx] = lastPurpose;

            // Update index mapping for the swapped purpose
            _purposeIndexInKey[_key][lastPurpose] = purposeIdx + 1;
        }

        // Remove the last element (either the target or the swapped element)
        k.purposes.pop();

        // Clean up the index mapping for the removed purpose
        delete _purposeIndexInKey[_key][_purpose];

        // ===========================================
        // STEP 2: REMOVE KEY FROM PURPOSE INDEX
        // ===========================================

        uint256 keyIdxPlusOne = _keyIndexInPurpose[_purpose][_key];
        uint256 keyIdx = keyIdxPlusOne - 1; // Convert to 0-based index

        uint256 lastKeyIdx = _keysByPurpose[_purpose].length - 1;

        if (keyIdx != lastKeyIdx) {
            // Swap-and-pop: Move last key to current position
            bytes32 lastKey = _keysByPurpose[_purpose][lastKeyIdx];
            _keysByPurpose[_purpose][keyIdx] = lastKey;

            // Update index mapping for the swapped key
            _keyIndexInPurpose[_purpose][lastKey] = keyIdx + 1;
        }

        // Remove the last key (either the target or the swapped key)
        _keysByPurpose[_purpose].pop();

        // Clean up the index mapping for this key in the purpose group
        delete _keyIndexInPurpose[_purpose][_key];

        // ===========================================
        // STEP 3: EMIT EVENT AND CLEANUP
        // ===========================================

        emit KeyRemoved(_key, _purpose, k.keyType);

        // If key has no more purposes, delete the entire key struct to save gas
        if (k.purposes.length == 0) {
            delete _keys[_key];
        }

        return true;
    }

    /**
     * @dev See {IERC735-addClaim}.
     * @notice Implementation of the addClaim function from the ERC-735 standard
     *  Require that the msg.sender has claim signer key.
     *
     * @dev This function uses O(1) index mappings for efficient claim management.
     * @param _topic The type of claim
     * @param _scheme The scheme with which this claim SHOULD be verified or how it should be processed.
     * @param _issuer The issuers identity contract address, or the address used to sign the above signature.
     * @param _signature Signature which is the proof that the claim issuer issued a claim of topic for this identity.
     * it MUST be a signed message of the following structure:
     * keccak256(abi.encode(address identityHolder_address, uint256 _ topic, bytes data))
     * @param _data The hash of the claim data, sitting in another
     * location, a bit-mask, call data, or actual data based on the claim scheme.
     * @param _uri The location of the claim, this can be HTTP links, swarm hashes, IPFS hashes, and such.
     *
     * @return claimRequestId Returns claimRequestId: COULD be
     * send to the approve function, to approve or reject this claim.
     * triggers ClaimAdded event.
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

        bytes32 claimId = keccak256(abi.encode(_issuer, _topic));
        Claim storage c = _claims[claimId];

        // 2. New claim or update existing
        bool isNew = !_claimExists[claimId];
        c.topic = _topic;
        c.scheme = _scheme;
        c.signature = _signature;
        c.data = _data;
        c.uri = _uri;

        if (isNew) {
            // Track claim for topic
            _claimsByTopic[_topic].push(claimId);
            _claimIndexInTopic[_topic][claimId] = _claimsByTopic[_topic].length; // index+1
            _claimExists[claimId] = true;
            c.issuer = _issuer;

            emit ClaimAdded(
                claimId,
                _topic,
                _scheme,
                _issuer,
                _signature,
                _data,
                _uri
            );
        } else {
            emit ClaimChanged(
                claimId,
                _topic,
                _scheme,
                _issuer,
                _signature,
                _data,
                _uri
            );
        }
        return claimId;
    }

    /**
     * @dev See {IERC735-removeClaim}.
     * @notice Implementation of the removeClaim function from the ERC-735 standard
     * Require that the msg.sender has management key.
     * Can only be removed by the claim issuer, or the claim holder itself.
     *
     * @dev This function uses O(1) index mappings and efficient swap-and-pop technique
     * to maintain array consistency without gaps, ensuring optimal gas usage.
     * @param _claimId The identity of the claim i.e. keccak256(abi.encode(_issuer, _topic))
     *
     * @return success Returns TRUE when the claim was removed.
     * triggers ClaimRemoved event
     */
    function removeClaim(
        bytes32 _claimId
    ) public override delegatedOnly onlyClaimKey returns (bool success) {
        // 1. Validate claim exists and get topic
        Claim storage c = _claims[_claimId];
        uint256 topic = c.topic;
        require(topic != 0, Errors.ClaimNotRegistered(_claimId));

        // 2. Get claim index using O(1) lookup
        uint256 claimIdxPlusOne = _claimIndexInTopic[topic][_claimId];
        require(claimIdxPlusOne > 0, "Claim index missing");
        uint256 claimIdx = claimIdxPlusOne - 1; // Convert to 0-based index

        // ===========================================
        // STEP 1: REMOVE CLAIM FROM TOPIC INDEX
        // ===========================================

        uint256 lastClaimIdx = _claimsByTopic[topic].length - 1;

        if (claimIdx != lastClaimIdx) {
            // Swap-and-pop: Move last element to current position to maintain array consistency
            bytes32 lastClaimId = _claimsByTopic[topic][lastClaimIdx];
            _claimsByTopic[topic][claimIdx] = lastClaimId;

            // Update index mapping for the swapped claim
            _claimIndexInTopic[topic][lastClaimId] = claimIdx + 1;
        }

        // Remove the last element (either the target or the swapped element)
        _claimsByTopic[topic].pop();

        // Clean up the index mapping for the removed claim
        delete _claimIndexInTopic[topic][_claimId];
        delete _claimExists[_claimId];

        // ===========================================
        // STEP 2: EMIT EVENT AND CLEAN UP CLAIM
        // ===========================================

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
        delete _claims[_claimId];

        return true;
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
        Claim storage c = _claims[_claimId];
        return (c.topic, c.scheme, c.issuer, c.signature, c.data, c.uri);
    }

    /**
     * @dev See {IERC734-keyHasPurpose}.
     * @notice Returns true if the key has MANAGEMENT purpose or the specified purpose.
     *
     * @dev This function uses O(1) index mappings for efficient lookups instead of
     * linear search through the purposes array. MANAGEMENT keys have universal
     * permissions, so any key with MANAGEMENT purpose will return true for any purpose.
     * @param _key The key to check
     * @param _purpose The purpose to check for
     * @return result True if the key has the specified purpose or MANAGEMENT purpose
     */
    function keyHasPurpose(
        bytes32 _key,
        uint256 _purpose
    ) public view override returns (bool result) {
        // Early return if key doesn't exist
        if (_keys[_key].key == 0) return false;

        // O(1) lookup: Check if key has the specific purpose OR MANAGEMENT purpose
        // MANAGEMENT keys have universal permissions in the ERC-734 standard
        return
            _purposeIndexInKey[_key][_purpose] > 0 ||
            _purposeIndexInKey[_key][KeyPurposes.MANAGEMENT] > 0;
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
     * @notice Initializer internal function for the Identity contract.
     *
     * @dev This function sets up the initial management key and initializes all
     * storage mappings including the new index mappings for efficient key management.
     * @param initialManagementKey The ethereum address to be set as the management key of the ONCHAINID.
     */
    // solhint-disable-next-line func-name-mixedcase
    function __Identity_init(address initialManagementKey) internal {
        require(
            !_initialized || _isConstructor(),
            Errors.InitialKeyAlreadySetup()
        );
        _initialized = true;
        _canInteract = true;

        // Set up the initial management key
        bytes32 _key = keccak256(abi.encode(initialManagementKey));
        _keys[_key].key = _key;
        _keys[_key].purposes = [1]; // MANAGEMENT purpose
        _keys[_key].keyType = 1; // ECDSA key type
        _keysByPurpose[1].push(_key);

        // Initialize index mappings for O(1) lookups
        // Store 1-based indices (0 means not found, 1+ means found at index-1)
        _purposeIndexInKey[_key][1] = 1; // First purpose at index 0 + 1
        _keyIndexInPurpose[1][_key] = 1; // First key at index 0 + 1

        emit KeyAdded(_key, 1, 1);
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
