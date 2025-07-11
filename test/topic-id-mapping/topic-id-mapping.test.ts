import { ethers } from "hardhat";
import { expect } from "chai";

const abi = ethers.AbiCoder.defaultAbiCoder();

describe("TopicIdMapping", () => {
  let contract: any;
  let proxy: any;
  let implementation: any;
  let admin: any;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();
    admin = deployer;

    // Deploy implementation
    const ImplFactory = await ethers.getContractFactory("TopicIdMapping");
    implementation = await ImplFactory.deploy();
    await implementation.waitForDeployment();

    // Deploy proxy
    const ProxyFactory = await ethers.getContractFactory("TopicIdMappingProxy");
    proxy = await ProxyFactory.deploy(
      await implementation.getAddress(),
      implementation.interface.encodeFunctionData("initialize", [
        admin.address,
      ]),
    );
    await proxy.waitForDeployment();

    contract = ImplFactory.attach(await proxy.getAddress());
  });

  describe("Topic schema examples from AssetID spec", () => {
    it("should allow adding and retrieving the NAV Per Share topic (1000003)", async () => {
      const topicId = 1000003;
      const name = "NAV Per Share";
      const fieldNames = ["value", "decimals", "timestamp"];
      const fieldTypes = ["uint256", "uint256", "uint256"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(contract.addTopic(topicId, name, encodedNames, encodedTypes))
        .to.emit(contract, "TopicAdded")
        .withArgs(topicId, name, encodedNames, encodedTypes);

      const schema = await contract.getSchema(topicId);
      expect(schema[0]).to.deep.equal(fieldNames);
      expect(schema[1]).to.deep.equal(fieldTypes);
    });

    it("should allow adding the ISIN topic (1000001)", async () => {
      const topicId = 1000001;
      const name = "ISIN";
      const fieldNames = ["isin"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const schema = await contract.getSchema(topicId);
      expect(schema[0]).to.deep.equal(fieldNames);
      expect(schema[1]).to.deep.equal(fieldTypes);
    });

    it("should allow adding the Qualification URL topic (1000006)", async () => {
      const topicId = 1000006;
      const name = "Qualification URL";
      const fieldNames = ["urls"];
      const fieldTypes = ["string[]"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const schema = await contract.getSchema(topicId);
      expect(schema[0]).to.deep.equal(fieldNames);
      expect(schema[1]).to.deep.equal(fieldTypes);
    });
  });

  describe("Validation and permissioning", () => {
    it("should not allow adding topic with mismatched names/types", async () => {
      const topicId = 1234;
      const name = "BrokenTopic";
      const encodedNames = abi.encode(["string[]"], [["field1"]]);
      const encodedTypes = abi.encode(["string[]"], [["uint256", "uint8"]]);

      await expect(
        contract.addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith("Field name/type count mismatch");
    });

    it("should not allow non-TOPIC_MANAGER_ROLE to add topics", async () => {
      const [, unauthorized] = await ethers.getSigners();

      const topicId = 1000002;
      const name = "LEI";
      const encodedNames = abi.encode(["string[]"], [["lei"]]);
      const encodedTypes = abi.encode(["string[]"], [["string"]]);

      await expect(
        contract
          .connect(unauthorized)
          .addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith(
        `AccessControl: account ${unauthorized.address.toLowerCase()} is missing role ${await contract.TOPIC_MANAGER_ROLE()}`,
      );
    });
  });
});

describe("TopicIdMapping adding topics", () => {
  let contract: any;
  let proxy: any;
  let implementation: any;
  let admin: any;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();
    admin = deployer;

    const ImplFactory = await ethers.getContractFactory("TopicIdMapping");
    implementation = await ImplFactory.deploy();
    await implementation.waitForDeployment();

    const ProxyFactory = await ethers.getContractFactory("TopicIdMappingProxy");
    proxy = await ProxyFactory.deploy(
      await implementation.getAddress(),
      implementation.interface.encodeFunctionData("initialize", [
        admin.address,
      ]),
    );
    await proxy.waitForDeployment();

    contract = ImplFactory.attach(await proxy.getAddress());
  });

  describe("Topic schema examples from AssetID spec", () => {
    const topics = [
      {
        id: 1000001,
        name: "ISIN",
        fields: ["isin"],
        types: ["string"],
        example: ["US1234567890"],
      },
      {
        id: 1000002,
        name: "LEI",
        fields: ["lei"],
        types: ["string"],
        example: ["5493001KJTIIGC8Y1R12"],
      },
      {
        id: 1000003,
        name: "NAV Per Share",
        fields: ["value", "decimals", "timestamp"],
        types: ["uint256", "uint256", "uint256"],
        example: [ethers.toBigInt(1000000), 6, Math.floor(Date.now() / 1000)],
      },
      {
        id: 1000004,
        name: "NAV Global",
        fields: ["value", "decimals", "timestamp"],
        types: ["uint256", "uint256", "uint256"],
        example: [ethers.toBigInt(150000000), 6, Math.floor(Date.now() / 1000)],
      },
      {
        id: 1000005,
        name: "Base Currency",
        fields: ["currencyCode"],
        types: ["uint16"],
        example: [840], // USD (ISO 4217)
      },
      {
        id: 1000006,
        name: "Qualification URL",
        fields: ["urls"],
        types: ["string[]"],
        example: [["https://example.com/kyc", "https://verify.assetid.xyz"]],
      },
      {
        id: 1000007,
        name: "ERC3643 Certificate",
        fields: ["issuer"],
        types: ["address"],
        example: ["0x000000000000000000000000000000000000dEaD"],
      },
    ];

    for (const topic of topics) {
      it(`should add and decode schema and data for topic ${topic.id} (${topic.name})`, async () => {
        const encodedNames = abi.encode(["string[]"], [topic.fields]);
        const encodedTypes = abi.encode(["string[]"], [topic.types]);

        await expect(
          contract.addTopic(topic.id, topic.name, encodedNames, encodedTypes),
        )
          .to.emit(contract, "TopicAdded")
          .withArgs(topic.id, topic.name, encodedNames, encodedTypes);

        const schema = await contract.getSchema(topic.id);
        expect(schema[0]).to.deep.equal(topic.fields);
        expect(schema[1]).to.deep.equal(topic.types);

        const encodedClaim = abi.encode(topic.types, topic.example);
        const decoded = abi.decode(topic.types, encodedClaim);

        for (let i = 0; i < topic.fields.length; i++) {
          expect(decoded[i]).to.deep.equal(topic.example[i]);
        }
      });
    }
  });

  describe("Validation and permissioning", () => {
    it("should not allow adding topic with mismatched names/types", async () => {
      const topicId = 1234;
      const name = "BrokenTopic";
      const encodedNames = abi.encode(["string[]"], [["field1"]]);
      const encodedTypes = abi.encode(["string[]"], [["uint256", "uint8"]]);

      await expect(
        contract.addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith("Field name/type count mismatch");
    });

    it("should not allow non-TOPIC_MANAGER_ROLE to add topics", async () => {
      const [, unauthorized] = await ethers.getSigners();

      const topicId = 1000008;
      const name = "Unauthorized Topic";
      const encodedNames = abi.encode(["string[]"], [["someField"]]);
      const encodedTypes = abi.encode(["string[]"], [["string"]]);

      const role = await contract.TOPIC_MANAGER_ROLE();

      await expect(
        contract
          .connect(unauthorized)
          .addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith(
        `AccessControl: account ${unauthorized.address.toLowerCase()} is missing role ${role}`,
      );
    });
  });
});
