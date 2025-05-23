// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {ITopicIdMapping} from "./interface/ITopicIdMapping.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @notice This contract is used to map a claim topic id to its name and format
/** @dev this contract stores and returns the names for different topics
 */
contract TopicIdMapping is
    UUPSUpgradeable,
    OwnableUpgradeable,
    ITopicIdMapping
{
    mapping(uint256 => Topic) public topicToInfo;

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
        topicToInfo[_topic] = Topic({format: _format, name: _name});

        emit TopicAdded(_topic, _format);
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
        topicToInfo[_topic] = Topic({format: _format, name: _name});

        emit TopicChanged(_topic, _format);
    }

    /// @notice Removes a topic from the mapping
    /// @param _topic The unique identifier of the topic to remove
    function removeTopic(uint256 _topic) external override onlyOwner {
        Topic memory topic = topicToInfo[_topic];
        delete topicToInfo[_topic];
        emit TopicRemoved(_topic, topic.format);
    }

    /// @notice Returns the topic information for a given topic ID
    /// @param _topic The unique identifier of the topic to query
    /// @return _topicInfo The Topic struct containing topic info
    function getTopicInfo(
        uint256 _topic
    ) external view override returns (Topic memory _topicInfo) {
        return topicToInfo[_topic];
    }

    function _authorizeUpgrade(
        address _newImplementation
    ) internal override onlyOwner {}
}
