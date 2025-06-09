// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {ITopicIdMapping} from "./interface/ITopicIdMapping.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Errors } from "./libraries/Errors.sol";

/// @notice This contract is used to map a claim topic id to its name and format
/** @dev this contract stores and returns the names for different topics
 */
contract TopicIdMapping is
    UUPSUpgradeable,
    OwnableUpgradeable,
    ITopicIdMapping
{
    mapping(uint256 => Topic) private _topicToInfo;

    /// @notice Prevents anyone from calling `initialize` on the logic contract
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init();
    }

    /// @notice Adds a new topic with its format and name
    /// @param _topic The unique identifier for the topic
    /// @param _format The format identifier for the topic
    /// @param _name The name of the topic
    function addTopic(
        uint256 _topic,
        uint256 _format,
        string memory _name
    ) external override onlyOwner {
        require(_topic != 0, Errors.EmptyTopic());
        require(_format != 0, Errors.EmptyFormat());
        require(bytes(_name).length > 0, Errors.EmptyName());
        require(_topicToInfo[_topic].format == 0, Errors.TopicAlreadyExists(_topic));
        _topicToInfo[_topic] = Topic({format: _format, name: _name});

        emit TopicAdded(_topic, _format, _name);
    }

    /// @notice Updates an existing topic's format and name
    /// @param _topic The unique identifier of the topic to update
    /// @param _format The new format identifier for the topic
    /// @param _name The new name for the topic
    function updateTopic(
        uint256 _topic,
        uint256 _format,
        string memory _name
    ) external override onlyOwner {
        require(_topicToInfo[_topic].format != 0, Errors.TopicNotFound(_topic));
        require(_format != 0, Errors.EmptyFormat());
        require(bytes(_name).length > 0, Errors.EmptyName());
        _topicToInfo[_topic] = Topic({format: _format, name: _name});

        emit TopicChanged(_topic, _format, _name);
    }

    /// @notice Removes a topic from the mapping
    /// @param _topic The unique identifier of the topic to remove
    function removeTopic(uint256 _topic) external override onlyOwner {
        require(_topicToInfo[_topic].format != 0, Errors.TopicNotFound(_topic));
        delete _topicToInfo[_topic];
        emit TopicRemoved(_topic);
    }

    /// @notice Returns the topic information for a given topic ID
    /// @param _topic The unique identifier of the topic to query
    /// @return The Topic struct containing topic info
    function topicInfo(
        uint256 _topic
    ) external view override returns (Topic memory) {
        return _topicToInfo[_topic];
    }

    function _authorizeUpgrade(
        address _newImplementation
    ) internal override onlyOwner {}

    // leave space for future variables
    uint256[50] private __gap;
}
