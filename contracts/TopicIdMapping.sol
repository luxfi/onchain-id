// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

error TopicIdMapping__TopicAlreadyExists();

contract TopicIdMapping is Ownable {
    mapping(uint256 => string) public topicToContent;

    constructor() Ownable() {}

    function setTopicContent(
        uint256 _topic,
        string memory _content
    ) external onlyOwner {
        topicToContent[_topic] = _content;
    }

    function getTopicContent(
        uint256 _topic
    ) external view returns (string memory) {
        return topicToContent[_topic];
    }
}
