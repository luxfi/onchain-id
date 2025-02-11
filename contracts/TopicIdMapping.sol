// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title A title that should describe the contract/interface
/// @notice This contract is used to map a claim topic id to its content
/** @dev this contract stores and returns the stringified version of the content for different topics
please, check the following link for reference https://docs.onchainid.com/docs/developers/sdk/constants/
*/
contract TopicIdMapping is Ownable {
    mapping(uint256 => string) public topicToContent;

    /// @notice Saves the content for a given topic
    /// @dev Stores the stringified content for a given topic
    function setTopicContent(
        uint256 _topic,
        string memory _content
    ) external onlyOwner {
        topicToContent[_topic] = _content;
    }

    /// @notice Returns the content for a given topic
    /// @dev Retrieves the stringified content for a given topic
    function getTopicContent(
        uint256 _topic
    ) external view returns (string memory) {
        return topicToContent[_topic];
    }
}
