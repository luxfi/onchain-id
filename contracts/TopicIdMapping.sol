// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {ITopicIdMapping} from "./interface/ITopicIdMapping.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title TopicIdMapping
 * @notice Contract for registering and retrieving structured topic schemas using encoded string arrays.
 * @dev Inherits from AccessControl and supports UUPS upgrades. Topics define field names and types using ABI-encoded `string[]` arrays.
 */
contract TopicIdMapping is
    ITopicIdMapping,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    /// @notice Role identifier for accounts allowed to manage topics
    bytes32 public constant TOPIC_MANAGER_ROLE =
        keccak256("TOPIC_MANAGER_ROLE");

    /// @dev Mapping from topic ID to Topic struct
    mapping(uint256 => Topic) private _topics;

    /// @notice Disables initializers on the implementation contract
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract and sets the admin and topic manager roles.
     * @param admin Address to receive DEFAULT_ADMIN_ROLE and TOPIC_MANAGER_ROLE
     */
    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TOPIC_MANAGER_ROLE, admin);
    }

    /**
     * @inheritdoc ITopicIdMapping
     */
    function addTopic(
        uint256 topicId,
        string calldata name,
        bytes calldata encodedFieldNames,
        bytes calldata encodedFieldTypes
    ) external override onlyRole(TOPIC_MANAGER_ROLE) {
        require(bytes(name).length > 0, "Empty topic name");
        require(
            _topics[topicId].encodedFieldNames.length == 0,
            "Topic already exists"
        );
        _validateFieldArrays(encodedFieldNames, encodedFieldTypes);

        _topics[topicId] = Topic({
            name: name,
            encodedFieldNames: encodedFieldNames,
            encodedFieldTypes: encodedFieldTypes
        });

        emit TopicAdded(topicId, name, encodedFieldNames, encodedFieldTypes);
    }

    /**
     * @inheritdoc ITopicIdMapping
     */
    function updateTopic(
        uint256 topicId,
        string calldata name,
        bytes calldata encodedFieldNames,
        bytes calldata encodedFieldTypes
    ) external override onlyRole(TOPIC_MANAGER_ROLE) {
        require(
            _topics[topicId].encodedFieldNames.length != 0,
            "Topic does not exist"
        );
        require(bytes(name).length > 0, "Empty topic name");
        _validateFieldArrays(encodedFieldNames, encodedFieldTypes);

        _topics[topicId] = Topic({
            name: name,
            encodedFieldNames: encodedFieldNames,
            encodedFieldTypes: encodedFieldTypes
        });

        emit TopicUpdated(topicId, name, encodedFieldNames, encodedFieldTypes);
    }

    /**
     * @inheritdoc ITopicIdMapping
     */
    function removeTopic(
        uint256 topicId
    ) external override onlyRole(TOPIC_MANAGER_ROLE) {
        require(
            _topics[topicId].encodedFieldNames.length != 0,
            "Topic does not exist"
        );
        delete _topics[topicId];
        emit TopicRemoved(topicId);
    }

    /**
     * @inheritdoc ITopicIdMapping
     */
    function getTopic(
        uint256 topicId
    ) external view override returns (Topic memory) {
        require(
            _topics[topicId].encodedFieldNames.length != 0,
            "Topic not found"
        );
        return _topics[topicId];
    }

    /**
     * @inheritdoc ITopicIdMapping
     */
    function getSchema(
        uint256 topicId
    )
        external
        view
        override
        returns (string[] memory fieldNames, string[] memory fieldTypes)
    {
        require(
            _topics[topicId].encodedFieldNames.length != 0,
            "Topic not found"
        );
        fieldNames = abi.decode(_topics[topicId].encodedFieldNames, (string[]));
        fieldTypes = abi.decode(_topics[topicId].encodedFieldTypes, (string[]));
    }

    /**
     * @notice Returns decoded field names for a given topic ID
     * @param topicId The ID of the topic
     * @return string[] Array of field names
     */
    function getFieldNames(
        uint256 topicId
    ) external view returns (string[] memory) {
        require(
            _topics[topicId].encodedFieldNames.length != 0,
            "Topic not found"
        );
        return abi.decode(_topics[topicId].encodedFieldNames, (string[]));
    }

    /**
     * @notice Returns decoded field types for a given topic ID
     * @param topicId The ID of the topic
     * @return string[] Array of field types
     */
    function getFieldTypes(
        uint256 topicId
    ) external view returns (string[] memory) {
        require(
            _topics[topicId].encodedFieldTypes.length != 0,
            "Topic not found"
        );
        return abi.decode(_topics[topicId].encodedFieldTypes, (string[]));
    }

    /**
     * @notice Returns an array of Topic structs for the given topic IDs
     * @param topicIds Array of topic IDs to get Topic structs for
     * @return Topic[] Array of Topic structs corresponding to the input topic IDs
     */
    function getTopics(
        uint256[] calldata topicIds
    ) external view returns (Topic[] memory) {
        Topic[] memory topics = new Topic[](topicIds.length);
        
        for (uint256 i = 0; i < topicIds.length; i++) {
            Topic storage persistedTopic = _topics[topicIds[i]];
            require(
                persistedTopic.encodedFieldNames.length != 0,
                "Topic not found"
            );
            topics[i] = persistedTopic;
        }

        return topics;
    }

    /**
     * @dev Validates that encoded field names/types match in length and content.
     * @param encodedNames ABI-encoded string[] of field names
     * @param encodedTypes ABI-encoded string[] of field types
     */
    function _validateFieldArrays(
        bytes memory encodedNames,
        bytes memory encodedTypes
    ) internal pure {
        string[] memory names = abi.decode(encodedNames, (string[]));
        string[] memory types_ = abi.decode(encodedTypes, (string[]));
        require(
            names.length == types_.length,
            "Field name/type count mismatch"
        );

        for (uint256 i = 0; i < names.length; i++) {
            require(bytes(names[i]).length > 0, "Empty field name");
            require(bytes(types_[i]).length > 0, "Empty field type");
        }
    }

    /**
     * @dev Required override for UUPS upgradability authorization
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Reserved storage space to allow future layout changes
    uint256[50] private __gap;
}
