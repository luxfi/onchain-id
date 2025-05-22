// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

interface ITopicIdMapping {
    struct Topic {
        uint256 format;
        string name;
    }

    event TopicAdded(uint256 indexed topic, uint256 format);
    event TopicRemoved(uint256 indexed topic, uint256 format);
    event TopicChanged(uint256 indexed topic, uint256 format);

    function addTopic(
        uint256 _topic,
        uint256 _format,
        string memory _name
    ) external;

    function updateTopic(
        uint256 _topic,
        uint256 _format,
        string memory _name
    ) external;

    function removeTopic(
        uint256 _topic
    ) external;

    function getTopicInfo(
        uint256 _topic
    ) external view returns (Topic memory _topicInfo);
} 