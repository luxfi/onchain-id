import { ethers } from "hardhat";
import { expect } from "chai";

describe("TopicIdMapping", () => {
    const TEST_TOPIC_ID = 10101000100000;
    const TEST_TOPIC_NAME = "INDIVIDUAL_INVESTOR";
    const TEST_TOPIC_FORMAT = 1;

    let implementation: any;
    let proxy: any;
    let topicIdMapping: any;
    let topicIdMappingProxy: any;

    beforeEach(async () => {        
        // Deploy implementation
        const TopicIdMapping = await ethers.getContractFactory("TopicIdMapping");
        implementation = await TopicIdMapping.deploy();
        await implementation.waitForDeployment();

        // Deploy proxy
        const TopicIdMappingProxy = await ethers.getContractFactory("TopicIdMappingProxy");
        proxy = await TopicIdMappingProxy.deploy(
            await implementation.getAddress(),
            implementation.interface.encodeFunctionData("initialize")
        );
        await proxy.waitForDeployment();

        // Get proxy contract with implementation ABI
        topicIdMapping = TopicIdMapping.attach(await proxy.getAddress());
        // Get proxy contract with proxy ABI
        topicIdMappingProxy = TopicIdMappingProxy.attach(await proxy.getAddress());
    });

    describe("Proxy functionality", () => {
        it("should allow owner to upgrade implementation", async () => {
            const [deployerWallet] = await ethers.getSigners();
            
            // Deploy new implementation
            const TopicIdMapping = await ethers.getContractFactory("TopicIdMapping");
            const newImplementation = await TopicIdMapping.deploy();
            await newImplementation.waitForDeployment();

            // Upgrade implementation
            await expect(
                topicIdMapping.connect(deployerWallet).upgradeTo(await newImplementation.getAddress())
            ).to.not.be.reverted;
        });

        it("should not allow non-owner to upgrade implementation", async () => {
            const [, otherWallet] = await ethers.getSigners();
            
            // Deploy new implementation
            const TopicIdMapping = await ethers.getContractFactory("TopicIdMapping");
            const newImplementation = await TopicIdMapping.deploy();
            await newImplementation.waitForDeployment();

            // Try to upgrade implementation
            await expect(
                topicIdMapping.connect(otherWallet).upgradeTo(await newImplementation.getAddress())
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    it("should deploy and initialize", async () => {
        expect(await topicIdMapping.getAddress()).to.not.be.undefined;
    });

    it("deployer should be owner", async () => {
        const [deployerWallet] = await ethers.getSigners();
        expect(await topicIdMapping.owner()).to.equal(deployerWallet.address);
    });

    it("only owner can add/modify topic", async () => {
        const [deployerWallet, otherWallet] = await ethers.getSigners();

        // Test that non-owner cannot add topic
        await expect(
            topicIdMapping.connect(otherWallet).addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        // Test that owner can add topic
        await expect(
            topicIdMapping
                .connect(deployerWallet)
                .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME)
        ).to.not.be.reverted;

        // Verify msg.sender is preserved through delegatecall
        const topicInfo = await topicIdMapping.getTopicInfo(TEST_TOPIC_ID);
        expect(topicInfo.name).to.equal(TEST_TOPIC_NAME);
        expect(topicInfo.format).to.equal(TEST_TOPIC_FORMAT);
    });

    it("should emit TopicAdded event with correct data", async () => {
        const [deployerWallet] = await ethers.getSigners();

        await expect(
            topicIdMapping
                .connect(deployerWallet)
                .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME)
        )
            .to.emit(topicIdMapping, "TopicAdded")
            .withArgs(TEST_TOPIC_ID, TEST_TOPIC_FORMAT);
    });

    it("should emit TopicChanged event with correct data", async () => {
        const [deployerWallet] = await ethers.getSigners();
        const NEW_NAME = "NEW_NAME";
        const NEW_FORMAT = 2;

        // Add initial topic
        await topicIdMapping
            .connect(deployerWallet)
            .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME);

        // Update topic and verify event
        await expect(
            topicIdMapping
                .connect(deployerWallet)
                .updateTopic(TEST_TOPIC_ID, NEW_FORMAT, NEW_NAME)
        )
            .to.emit(topicIdMapping, "TopicChanged")
            .withArgs(TEST_TOPIC_ID, NEW_FORMAT);
    });

    it("should emit TopicRemoved event with correct data", async () => {
        const [deployerWallet] = await ethers.getSigners();

        // Add topic first
        await topicIdMapping
            .connect(deployerWallet)
            .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME);

        // Remove topic and verify event
        await expect(
            topicIdMapping
                .connect(deployerWallet)
                .removeTopic(TEST_TOPIC_ID)
        )
            .to.emit(topicIdMapping, "TopicRemoved")
            .withArgs(TEST_TOPIC_ID, TEST_TOPIC_FORMAT);
    });

    it("should set and get topic content correctly", async () => {
        const [deployerWallet] = await ethers.getSigners();

        // Add topic as owner
        await topicIdMapping
            .connect(deployerWallet)
            .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME);

        // Anyone can read the topic
        const topicInfo = await topicIdMapping.getTopicInfo(TEST_TOPIC_ID);
        expect(topicInfo.name).to.equal(TEST_TOPIC_NAME);
        expect(topicInfo.format).to.equal(TEST_TOPIC_FORMAT);
    });

    it("should update topic correctly", async () => {
        const [deployerWallet] = await ethers.getSigners();
        const NEW_NAME = "NEW_NAME";
        const NEW_FORMAT = 2;

        // Add initial topic
        await topicIdMapping
            .connect(deployerWallet)
            .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME);

        // Update topic
        await topicIdMapping
            .connect(deployerWallet)
            .updateTopic(TEST_TOPIC_ID, NEW_FORMAT, NEW_NAME);

        // Verify update
        const topicInfo = await topicIdMapping.getTopicInfo(TEST_TOPIC_ID);
        expect(topicInfo.name).to.equal(NEW_NAME);
        expect(topicInfo.format).to.equal(NEW_FORMAT);
    });

    it("should remove topic correctly", async () => {
        const [deployerWallet] = await ethers.getSigners();

        // Add topic first
        await topicIdMapping
            .connect(deployerWallet)
            .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME);

        // Remove topic
        await topicIdMapping
            .connect(deployerWallet)
            .removeTopic(TEST_TOPIC_ID);

        // Verify removal
        const topicInfo = await topicIdMapping.getTopicInfo(TEST_TOPIC_ID);
        expect(topicInfo.name).to.equal("");
        expect(topicInfo.format).to.equal(0);
    });

    it("should preserve msg.sender through delegatecall", async () => {
        const [deployerWallet, otherWallet] = await ethers.getSigners();

        // Add topic as owner
        await topicIdMapping
            .connect(deployerWallet)
            .addTopic(TEST_TOPIC_ID, TEST_TOPIC_FORMAT, TEST_TOPIC_NAME);

        // Try to update as non-owner (should fail)
        await expect(
            topicIdMapping
                .connect(otherWallet)
                .updateTopic(TEST_TOPIC_ID, 2, "NEW_NAME")
        ).to.be.revertedWith("Ownable: caller is not the owner");

        // Verify topic wasn't changed
        const topicInfo = await topicIdMapping.getTopicInfo(TEST_TOPIC_ID);
        expect(topicInfo.name).to.equal(TEST_TOPIC_NAME);
        expect(topicInfo.format).to.equal(TEST_TOPIC_FORMAT);
    });
});
