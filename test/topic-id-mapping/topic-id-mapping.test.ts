import { ethers } from "hardhat";
import { expect } from "chai";

describe("TopicIdMapping", () => {
  it("should deploy", async () => {
   await ethers.getSigners();
    const topicIdMapping = await ethers.deployContract("TopicIdMapping", []);
    await expect(topicIdMapping.deployed()).to.eventually.be.ok;
  });

  it("deployer should be owner", async () => {
    const [deployerWallet] = await ethers.getSigners();
    const topicIdMapping = await ethers.deployContract("TopicIdMapping", []);
    await expect(topicIdMapping.owner()).to.eventually.equal(
      deployerWallet.address
    );
  });

  it("only owner can add/modify topic", async () => {
    const [deployerWallet, otherWallet] = await ethers.getSigners();
    const topicIdMapping = await ethers.deployContract("TopicIdMapping", []);
    await expect(
      topicIdMapping.connect(otherWallet).setTopicContent(123, "10101000100000")
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      topicIdMapping
        .connect(deployerWallet)
        .setTopicContent(123, "10101000100000")
    ).to.be.ok;
  });

  it("should set and get topic content correctly", async () => {
    const [deployerWallet] = await ethers.getSigners();
    const topicIdMapping = await ethers.deployContract("TopicIdMapping", []);
    await topicIdMapping
      .connect(deployerWallet)
      .setTopicContent(123, "10101000100000");
    await expect(
      topicIdMapping.getTopicContent(123)
    ).to.eventually.equal("10101000100000");
  });
});
