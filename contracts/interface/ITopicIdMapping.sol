// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

interface ITopicIdMapping {
    /**
     * @dev Definition of the structure of a Topic.
     *
     * Specification: Topics are information an issuer has about the identity holder.
     * The structure should be as follows:
     * format: A uint256 number which represents the format of the topic. The convention for what every format means will be shown in the documentation.
     * name: A string which represents the name of the topic.
     */
    struct Topic {
        uint256 format;
        string name;
    }

    event TopicAdded(uint256 indexed topic, uint256 format, string name);
    event TopicRemoved(uint256 indexed topic);
    event TopicChanged(uint256 indexed topic, uint256 format, string name);

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

    function topicInfo(
        uint256 _topic
    ) external view returns (Topic memory _topicInfo);
}
