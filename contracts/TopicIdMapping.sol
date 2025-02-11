// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TopicIdMapping is Ownable {
    mapping(uint256 => string) public topicToStringMapping;

    constructor(address _owner) Ownable() {}

    function setTopicIdMapping(
        uint256 _topic,
        string memory _string
    ) public onlyOwner {
        topicToStringMapping[_topic] = _string;
    }

    function getTopicIdMapping(
        uint256 _topic
    ) public view returns (string memory) {
        return topicToStringMapping[_topic];
    }
}
