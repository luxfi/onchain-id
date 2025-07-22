import { expect } from "chai";
import { ethers } from "hardhat";

const abi = ethers.AbiCoder.defaultAbiCoder();

describe("IdentityUtilities", () => {
  let contract: any;
  let proxy: any;
  let implementation: any;
  let admin: any;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();
    admin = deployer;

    // Deploy implementation
    const ImplFactory = await ethers.getContractFactory("IdentityUtilities");
    implementation = await ImplFactory.deploy();
    await implementation.waitForDeployment();

    // Deploy proxy
    const ProxyFactory = await ethers.getContractFactory(
      "IdentityUtilitiesProxy",
    );
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

describe("IdentityUtilities adding topics", () => {
  let contract: any;
  let proxy: any;
  let implementation: any;
  let admin: any;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();
    admin = deployer;

    const ImplFactory = await ethers.getContractFactory("IdentityUtilities");
    implementation = await ImplFactory.deploy();
    await implementation.waitForDeployment();

    const ProxyFactory = await ethers.getContractFactory(
      "IdentityUtilitiesProxy",
    );
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

  it("returns an array of Topic structs for the given topic IDs", async () => {
    // Add topics
    const topics = [
      { id: 10, name: "A", fieldNames: ["f1"], fieldTypes: ["string"] },
      { id: 20, name: "B", fieldNames: ["f2"], fieldTypes: ["uint256"] },
    ];

    for (const topic of topics) {
      const encodedFieldNames = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string[]"],
        [topic.fieldNames],
      );
      const encodedFieldTypes = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string[]"],
        [topic.fieldTypes],
      );
      await contract
        .connect(admin)
        .addTopic(topic.id, topic.name, encodedFieldNames, encodedFieldTypes);
    }

    // Call getTopicInfos
    const ids = [10, 20];
    const result = await contract.getTopicInfos(ids);

    expect(result.length).to.equal(2);
    expect(result[0].name).to.equal("A");
    expect(result[1].name).to.equal("B");
    expect(result[0].encodedFieldNames).to.equal(
      ethers.AbiCoder.defaultAbiCoder().encode(["string[]"], [["f1"]]),
    );
    expect(result[1].encodedFieldTypes).to.equal(
      ethers.AbiCoder.defaultAbiCoder().encode(["string[]"], [["uint256"]]),
    );
  });
});

describe("IdentityUtilities getClaimsWithTopicInfo", () => {
  let contract: any;
  let proxy: any;
  let implementation: any;
  let admin: any;
  let identity: any;
  let claimIssuer: any;

  beforeEach(async () => {
    const [deployer, claimIssuerWallet, aliceWallet] =
      await ethers.getSigners();
    admin = deployer;

    // Deploy IdentityUtilities
    const ImplFactory = await ethers.getContractFactory("IdentityUtilities");
    implementation = await ImplFactory.deploy();
    await implementation.waitForDeployment();

    const ProxyFactory = await ethers.getContractFactory(
      "IdentityUtilitiesProxy",
    );
    proxy = await ProxyFactory.deploy(
      await implementation.getAddress(),
      implementation.interface.encodeFunctionData("initialize", [
        admin.address,
      ]),
    );
    await proxy.waitForDeployment();

    contract = ImplFactory.attach(await proxy.getAddress());

    // Deploy ClaimIssuer
    const ClaimIssuerFactory = await ethers.getContractFactory("ClaimIssuer");
    claimIssuer = await ClaimIssuerFactory.deploy(claimIssuerWallet.address);
    await claimIssuer.waitForDeployment();

    // Deploy Identity using the factory pattern
    const Identity = await ethers.getContractFactory("Identity");
    const identityImplementation = await Identity.deploy(
      deployer.address,
      true,
    );

    const ImplementationAuthority = await ethers.getContractFactory(
      "ImplementationAuthority",
    );
    const implementationAuthority = await ImplementationAuthority.deploy(
      identityImplementation.target,
    );

    const IdFactory = await ethers.getContractFactory("IdFactory");
    const identityFactory = await IdFactory.deploy(
      implementationAuthority.target,
    );

    await identityFactory.createIdentity(aliceWallet.address, "test");
    const identityAddress = await identityFactory.getIdentity(
      aliceWallet.address,
    );
    identity = await ethers.getContractAt("Identity", identityAddress);
  });

  it("should return claim information with topic info for given identity and topic IDs", async () => {
    const [deployer, claimIssuerWallet, aliceWallet] =
      await ethers.getSigners();

    // Add topics to the mapping
    const topics = [
      { id: 1001, name: "KYC", fieldNames: ["status"], fieldTypes: ["string"] },
      { id: 1002, name: "AML", fieldNames: ["level"], fieldTypes: ["uint8"] },
    ];

    for (const topic of topics) {
      const encodedFieldNames = abi.encode(["string[]"], [topic.fieldNames]);
      const encodedFieldTypes = abi.encode(["string[]"], [topic.fieldTypes]);
      await contract.addTopic(
        topic.id,
        topic.name,
        encodedFieldNames,
        encodedFieldTypes,
      );
    }

    // Add claim signer key to the claim issuer
    await claimIssuer.connect(claimIssuerWallet).addKey(
      ethers.keccak256(abi.encode(["address"], [claimIssuerWallet.address])),
      3, // CLAIM_SIGNER
      1, // ECDSA
    );

    // Add claim signer key to the identity
    await identity.connect(aliceWallet).addKey(
      ethers.keccak256(abi.encode(["address"], [aliceWallet.address])),
      3, // CLAIM_SIGNER
      1, // ECDSA
    );

    // Create and add claims to the identity
    const claimData1 = abi.encode(["string"], ["verified"]);
    const claimData2 = abi.encode(["uint8"], [2]); // AML level 2

    const claim1: any = {
      topic: 1001,
      scheme: 1,
      issuer: claimIssuer.target,
      data: claimData1,
      uri: "https://example.com/kyc",
    };

    const claim2: any = {
      topic: 1002,
      scheme: 1,
      issuer: claimIssuer.target,
      data: claimData2,
      uri: "https://example.com/aml",
    };

    // Sign the claims
    const hash1 = ethers.keccak256(
      abi.encode(
        ["address", "uint256", "bytes"],
        [identity.target, claim1.topic, claim1.data],
      ),
    );
    const hash2 = ethers.keccak256(
      abi.encode(
        ["address", "uint256", "bytes"],
        [identity.target, claim2.topic, claim2.data],
      ),
    );

    claim1.signature = await claimIssuerWallet.signMessage(
      ethers.getBytes(hash1),
    );
    claim2.signature = await claimIssuerWallet.signMessage(
      ethers.getBytes(hash2),
    );

    // Add claims to identity
    await identity
      .connect(aliceWallet)
      .addClaim(
        claim1.topic,
        claim1.scheme,
        claim1.issuer,
        claim1.signature,
        claim1.data,
        claim1.uri,
      );

    await identity
      .connect(aliceWallet)
      .addClaim(
        claim2.topic,
        claim2.scheme,
        claim2.issuer,
        claim2.signature,
        claim2.data,
        claim2.uri,
      );

    // Call getClaimsWithTopicInfo
    const topicIds = [1001, 1002];
    const result = await contract.getClaimsWithTopicInfo(
      identity.target,
      topicIds,
    );

    // Verify the structure and values of the result
    expect(Array.isArray(result)).to.be.true;
    expect(result.length).to.equal(2);

    // Verify first claim (KYC)
    const kycClaim = result.find((claim: any) => claim.topic.name === "KYC");
    expect(kycClaim).to.not.be.undefined;
    expect(kycClaim.isValid).to.be.true;
    expect(kycClaim.scheme).to.equal(1);
    expect(kycClaim.issuer).to.equal(claimIssuer.target);
    expect(kycClaim.signature).to.equal(claim1.signature);
    expect(kycClaim.data).to.equal(claimData1);
    expect(kycClaim.uri).to.equal("https://example.com/kyc");
    expect(kycClaim.topic.name).to.equal("KYC");
    expect(kycClaim.topic.encodedFieldNames).to.equal(
      abi.encode(["string[]"], [["status"]]),
    );
    expect(kycClaim.topic.encodedFieldTypes).to.equal(
      abi.encode(["string[]"], [["string"]]),
    );
    // Decode and verify KYC claim data
    const decodedKycData = abi.decode(["string"], kycClaim.data);
    expect(decodedKycData[0]).to.equal("verified");

    // Verify second claim (AML)
    const amlClaim = result.find((claim: any) => claim.topic.name === "AML");
    expect(amlClaim).to.not.be.undefined;
    expect(amlClaim.isValid).to.be.true;
    expect(amlClaim.scheme).to.equal(1);
    expect(amlClaim.issuer).to.equal(claimIssuer.target);
    expect(amlClaim.signature).to.equal(claim2.signature);
    expect(amlClaim.data).to.equal(claimData2);
    expect(amlClaim.uri).to.equal("https://example.com/aml");
    expect(amlClaim.topic.name).to.equal("AML");
    expect(amlClaim.topic.encodedFieldNames).to.equal(
      abi.encode(["string[]"], [["level"]]),
    );
    expect(amlClaim.topic.encodedFieldTypes).to.equal(
      abi.encode(["string[]"], [["uint8"]]),
    );
    // Decode and verify AML claim data
    const decodedAmlData = abi.decode(["uint8"], amlClaim.data);
    expect(decodedAmlData[0]).to.equal(2);
  });
});

describe("IdentityUtilities - Additional Test Coverage", () => {
  let contract: any;
  let proxy: any;
  let implementation: any;
  let admin: any;
  let user: any;

  beforeEach(async () => {
    const [deployer, userWallet] = await ethers.getSigners();
    admin = deployer;
    user = userWallet;

    // Deploy implementation
    const ImplFactory = await ethers.getContractFactory("IdentityUtilities");
    implementation = await ImplFactory.deploy();
    await implementation.waitForDeployment();

    // Deploy proxy
    const ProxyFactory = await ethers.getContractFactory(
      "IdentityUtilitiesProxy",
    );
    proxy = await ProxyFactory.deploy(
      await implementation.getAddress(),
      implementation.interface.encodeFunctionData("initialize", [
        admin.address,
      ]),
    );
    await proxy.waitForDeployment();

    contract = ImplFactory.attach(await proxy.getAddress());
  });

  describe("updateTopic function", () => {
    const topicId = 1001;
    const initialName = "Initial Topic";
    const initialFieldNames = ["field1"];
    const initialFieldTypes = ["string"];

    beforeEach(async () => {
      // Add a topic first
      const encodedNames = abi.encode(["string[]"], [initialFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [initialFieldTypes]);
      await contract.addTopic(topicId, initialName, encodedNames, encodedTypes);
    });

    it("should successfully update an existing topic", async () => {
      const newName = "Updated Topic";
      const newFieldNames = ["field1", "field2"];
      const newFieldTypes = ["string", "uint256"];
      const encodedNames = abi.encode(["string[]"], [newFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await expect(
        contract.updateTopic(topicId, newName, encodedNames, encodedTypes),
      )
        .to.emit(contract, "TopicUpdated")
        .withArgs(topicId, newName, encodedNames, encodedTypes);

      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal(newName);
      expect(topic.encodedFieldNames).to.equal(encodedNames);
      expect(topic.encodedFieldTypes).to.equal(encodedTypes);
    });

    it("should revert when updating non-existent topic", async () => {
      const nonExistentTopicId = 9999;
      const newName = "Updated Topic";
      const newFieldNames = ["field1"];
      const newFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [newFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await expect(
        contract.updateTopic(
          nonExistentTopicId,
          newName,
          encodedNames,
          encodedTypes,
        ),
      ).to.be.revertedWith("Topic does not exist");
    });

    it("should revert when updating topic with empty name", async () => {
      const newName = "";
      const newFieldNames = ["field1"];
      const newFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [newFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await expect(
        contract.updateTopic(topicId, newName, encodedNames, encodedTypes),
      ).to.be.revertedWith("Empty topic name");
    });

    it("should revert when updating topic with mismatched field arrays", async () => {
      const newName = "Updated Topic";
      const newFieldNames = ["field1"];
      const newFieldTypes = ["string", "uint256"]; // Mismatch
      const encodedNames = abi.encode(["string[]"], [newFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await expect(
        contract.updateTopic(topicId, newName, encodedNames, encodedTypes),
      ).to.be.revertedWith("Field name/type count mismatch");
    });

    it("should revert when updating topic with empty field names", async () => {
      const newName = "Updated Topic";
      const newFieldNames = [""]; // Empty field name
      const newFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [newFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await expect(
        contract.updateTopic(topicId, newName, encodedNames, encodedTypes),
      ).to.be.revertedWith("Empty field name");
    });

    it("should revert when updating topic with empty field types", async () => {
      const newName = "Updated Topic";
      const newFieldNames = ["field1"];
      const newFieldTypes = [""]; // Empty field type
      const encodedNames = abi.encode(["string[]"], [newFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await expect(
        contract.updateTopic(topicId, newName, encodedNames, encodedTypes),
      ).to.be.revertedWith("Empty field type");
    });

    it("should not allow non-TOPIC_MANAGER_ROLE to update topics", async () => {
      const newName = "Updated Topic";
      const newFieldNames = ["field1"];
      const newFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [newFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await expect(
        contract
          .connect(user)
          .updateTopic(topicId, newName, encodedNames, encodedTypes),
      ).to.be.revertedWith(
        `AccessControl: account ${user.address.toLowerCase()} is missing role ${await contract.TOPIC_MANAGER_ROLE()}`,
      );
    });
  });

  describe("removeTopic function", () => {
    const topicId = 1001;
    const name = "Test Topic";
    const fieldNames = ["field1"];
    const fieldTypes = ["string"];

    beforeEach(async () => {
      // Add a topic first
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);
      await contract.addTopic(topicId, name, encodedNames, encodedTypes);
    });

    it("should successfully remove an existing topic and emit event", async () => {
      await expect(contract.removeTopic(topicId))
        .to.emit(contract, "TopicRemoved")
        .withArgs(topicId);

      // Verify topic is removed
      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal("");
      expect(topic.encodedFieldNames).to.equal("0x");
      expect(topic.encodedFieldTypes).to.equal("0x");
    });

    it("should revert when removing non-existent topic", async () => {
      const nonExistentTopicId = 9999;
      await expect(contract.removeTopic(nonExistentTopicId)).to.be.revertedWith(
        "Topic does not exist",
      );
    });

    it("should not allow non-TOPIC_MANAGER_ROLE to remove topics", async () => {
      await expect(
        contract.connect(user).removeTopic(topicId),
      ).to.be.revertedWith(
        `AccessControl: account ${user.address.toLowerCase()} is missing role ${await contract.TOPIC_MANAGER_ROLE()}`,
      );
    });

    it("should allow removing and re-adding the same topic", async () => {
      // Remove the topic
      await contract.removeTopic(topicId);

      // Re-add the same topic
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);
      await expect(contract.addTopic(topicId, name, encodedNames, encodedTypes))
        .to.emit(contract, "TopicAdded")
        .withArgs(topicId, name, encodedNames, encodedTypes);

      // Verify topic is properly added
      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal(name);
      expect(topic.encodedFieldNames).to.equal(encodedNames);
      expect(topic.encodedFieldTypes).to.equal(encodedTypes);
    });
  });

  describe("getTopic function", () => {
    it("should return empty TopicInfo for non-existent topic", async () => {
      const nonExistentTopicId = 9999;
      const topic = await contract.getTopic(nonExistentTopicId);

      expect(topic.name).to.equal("");
      expect(topic.encodedFieldNames).to.equal("0x");
      expect(topic.encodedFieldTypes).to.equal("0x");
    });

    it("should return correct TopicInfo for existing topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1", "field2", "field3"];
      const fieldTypes = ["string", "uint256", "bool"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal(name);
      expect(topic.encodedFieldNames).to.equal(encodedNames);
      expect(topic.encodedFieldTypes).to.equal(encodedTypes);
    });

    it("should return correct TopicInfo after topic update", async () => {
      const topicId = 1001;
      const initialName = "Initial Topic";
      const initialFieldNames = ["field1"];
      const initialFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [initialFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [initialFieldTypes]);

      await contract.addTopic(topicId, initialName, encodedNames, encodedTypes);

      // Update the topic
      const newName = "Updated Topic";
      const newFieldNames = ["field1", "field2"];
      const newFieldTypes = ["string", "uint256"];
      const newEncodedNames = abi.encode(["string[]"], [newFieldNames]);
      const newEncodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await contract.updateTopic(
        topicId,
        newName,
        newEncodedNames,
        newEncodedTypes,
      );

      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal(newName);
      expect(topic.encodedFieldNames).to.equal(newEncodedNames);
      expect(topic.encodedFieldTypes).to.equal(newEncodedTypes);
    });
  });

  describe("getFieldNames function", () => {
    it("should return empty array for non-existent topic", async () => {
      const nonExistentTopicId = 9999;
      const fieldNames = await contract.getFieldNames(nonExistentTopicId);
      expect(fieldNames).to.deep.equal([]);
    });

    it("should return correct field names for existing topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1", "field2", "field3"];
      const fieldTypes = ["string", "uint256", "bool"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const retrievedFieldNames = await contract.getFieldNames(topicId);
      expect(retrievedFieldNames).to.deep.equal(fieldNames);
    });

    it("should return updated field names after topic update", async () => {
      const topicId = 1001;
      const initialName = "Initial Topic";
      const initialFieldNames = ["field1"];
      const initialFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [initialFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [initialFieldTypes]);

      await contract.addTopic(topicId, initialName, encodedNames, encodedTypes);

      // Update the topic
      const newName = "Updated Topic";
      const newFieldNames = ["newField1", "newField2"];
      const newFieldTypes = ["string", "uint256"];
      const newEncodedNames = abi.encode(["string[]"], [newFieldNames]);
      const newEncodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await contract.updateTopic(
        topicId,
        newName,
        newEncodedNames,
        newEncodedTypes,
      );

      const retrievedFieldNames = await contract.getFieldNames(topicId);
      expect(retrievedFieldNames).to.deep.equal(newFieldNames);
    });

    it("should return empty array for removed topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);
      await contract.removeTopic(topicId);

      const retrievedFieldNames = await contract.getFieldNames(topicId);
      expect(retrievedFieldNames).to.deep.equal([]);
    });
  });

  describe("getFieldTypes function", () => {
    it("should return empty array for non-existent topic", async () => {
      const nonExistentTopicId = 9999;
      const fieldTypes = await contract.getFieldTypes(nonExistentTopicId);
      expect(fieldTypes).to.deep.equal([]);
    });

    it("should return correct field types for existing topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1", "field2", "field3"];
      const fieldTypes = ["string", "uint256", "bool"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const retrievedFieldTypes = await contract.getFieldTypes(topicId);
      expect(retrievedFieldTypes).to.deep.equal(fieldTypes);
    });

    it("should return updated field types after topic update", async () => {
      const topicId = 1001;
      const initialName = "Initial Topic";
      const initialFieldNames = ["field1"];
      const initialFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [initialFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [initialFieldTypes]);

      await contract.addTopic(topicId, initialName, encodedNames, encodedTypes);

      // Update the topic
      const newName = "Updated Topic";
      const newFieldNames = ["newField1", "newField2"];
      const newFieldTypes = ["string", "uint256"];
      const newEncodedNames = abi.encode(["string[]"], [newFieldNames]);
      const newEncodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await contract.updateTopic(
        topicId,
        newName,
        newEncodedNames,
        newEncodedTypes,
      );

      const retrievedFieldTypes = await contract.getFieldTypes(topicId);
      expect(retrievedFieldTypes).to.deep.equal(newFieldTypes);
    });

    it("should return empty array for removed topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);
      await contract.removeTopic(topicId);

      const retrievedFieldTypes = await contract.getFieldTypes(topicId);
      expect(retrievedFieldTypes).to.deep.equal([]);
    });
  });

  describe("getTopicInfos function", () => {
    it("should return empty array for empty input", async () => {
      const result = await contract.getTopicInfos([]);
      expect(result).to.deep.equal([]);
    });

    it("should return TopicInfo for single existing topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const result = await contract.getTopicInfos([topicId]);
      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal(name);
      expect(result[0].encodedFieldNames).to.equal(encodedNames);
      expect(result[0].encodedFieldTypes).to.equal(encodedTypes);
    });

    it("should return TopicInfo for multiple existing topics", async () => {
      const topics = [
        {
          id: 1001,
          name: "Topic 1",
          fieldNames: ["field1"],
          fieldTypes: ["string"],
        },
        {
          id: 1002,
          name: "Topic 2",
          fieldNames: ["field2"],
          fieldTypes: ["uint256"],
        },
        {
          id: 1003,
          name: "Topic 3",
          fieldNames: ["field3"],
          fieldTypes: ["bool"],
        },
      ];

      for (const topic of topics) {
        const encodedNames = abi.encode(["string[]"], [topic.fieldNames]);
        const encodedTypes = abi.encode(["string[]"], [topic.fieldTypes]);
        await contract.addTopic(
          topic.id,
          topic.name,
          encodedNames,
          encodedTypes,
        );
      }

      const topicIds = [1001, 1002, 1003];
      const result = await contract.getTopicInfos(topicIds);

      expect(result.length).to.equal(3);
      for (let i = 0; i < topics.length; i++) {
        expect(result[i].name).to.equal(topics[i].name);
        expect(result[i].encodedFieldNames).to.equal(
          abi.encode(["string[]"], [topics[i].fieldNames]),
        );
        expect(result[i].encodedFieldTypes).to.equal(
          abi.encode(["string[]"], [topics[i].fieldTypes]),
        );
      }
    });

    it("should return empty TopicInfo for non-existent topics", async () => {
      const nonExistentTopicIds = [9999, 8888, 7777];
      const result = await contract.getTopicInfos(nonExistentTopicIds);

      expect(result.length).to.equal(3);
      for (const topicInfo of result) {
        expect(topicInfo.name).to.equal("");
        expect(topicInfo.encodedFieldNames).to.equal("0x");
        expect(topicInfo.encodedFieldTypes).to.equal("0x");
      }
    });

    it("should return mixed results for existing and non-existent topics", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const topicIds = [topicId, 9999]; // One existing, one non-existent
      const result = await contract.getTopicInfos(topicIds);

      expect(result.length).to.equal(2);
      expect(result[0].name).to.equal(name);
      expect(result[0].encodedFieldNames).to.equal(encodedNames);
      expect(result[0].encodedFieldTypes).to.equal(encodedTypes);
      expect(result[1].name).to.equal("");
      expect(result[1].encodedFieldNames).to.equal("0x");
      expect(result[1].encodedFieldTypes).to.equal("0x");
    });
  });

  describe("addTopic function - additional validation", () => {
    it("should revert when adding topic with empty name", async () => {
      const topicId = 1001;
      const name = "";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(
        contract.addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith("Empty topic name");
    });

    it("should revert when adding topic that already exists", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      await expect(
        contract.addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith("Topic already exists");
    });

    it("should revert when adding topic with empty field names array", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames: string[] = [];
      const fieldTypes: string[] = ["string"]; // Different lengths
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(
        contract.addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith("Field name/type count mismatch");
    });

    it("should allow adding topic with empty field names and types arrays (same length)", async () => {
      const topicId = 1001;
      const name = "Empty Arrays Topic";
      const fieldNames: string[] = [];
      const fieldTypes: string[] = [];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(contract.addTopic(topicId, name, encodedNames, encodedTypes))
        .to.emit(contract, "TopicAdded")
        .withArgs(topicId, name, encodedNames, encodedTypes);

      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal(name);
      expect(topic.encodedFieldNames).to.equal(encodedNames);
      expect(topic.encodedFieldTypes).to.equal(encodedTypes);
    });

    it("should revert when adding topic with empty field name", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = [""]; // Empty field name
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(
        contract.addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith("Empty field name");
    });

    it("should revert when adding topic with empty field type", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = [""]; // Empty field type
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(
        contract.addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith("Empty field type");
    });

    it("should successfully add topic with complex field types", async () => {
      const topicId = 1001;
      const name = "Complex Topic";
      const fieldNames = ["address", "uint256", "bool", "string", "bytes"];
      const fieldTypes = ["address", "uint256", "bool", "string", "bytes"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(contract.addTopic(topicId, name, encodedNames, encodedTypes))
        .to.emit(contract, "TopicAdded")
        .withArgs(topicId, name, encodedNames, encodedTypes);

      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal(name);
      expect(topic.encodedFieldNames).to.equal(encodedNames);
      expect(topic.encodedFieldTypes).to.equal(encodedTypes);
    });
  });

  describe("getSchema function - additional coverage", () => {
    it("should return empty arrays for non-existent topic", async () => {
      const nonExistentTopicId = 9999;
      const schema = await contract.getSchema(nonExistentTopicId);

      expect(schema[0]).to.deep.equal([]);
      expect(schema[1]).to.deep.equal([]);
    });

    it("should return correct schema for existing topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1", "field2", "field3"];
      const fieldTypes = ["string", "uint256", "bool"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const schema = await contract.getSchema(topicId);
      expect(schema[0]).to.deep.equal(fieldNames);
      expect(schema[1]).to.deep.equal(fieldTypes);
    });

    it("should return updated schema after topic update", async () => {
      const topicId = 1001;
      const initialName = "Initial Topic";
      const initialFieldNames = ["field1"];
      const initialFieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [initialFieldNames]);
      const encodedTypes = abi.encode(["string[]"], [initialFieldTypes]);

      await contract.addTopic(topicId, initialName, encodedNames, encodedTypes);

      // Update the topic
      const newName = "Updated Topic";
      const newFieldNames = ["newField1", "newField2"];
      const newFieldTypes = ["string", "uint256"];
      const newEncodedNames = abi.encode(["string[]"], [newFieldNames]);
      const newEncodedTypes = abi.encode(["string[]"], [newFieldTypes]);

      await contract.updateTopic(
        topicId,
        newName,
        newEncodedNames,
        newEncodedTypes,
      );

      const schema = await contract.getSchema(topicId);
      expect(schema[0]).to.deep.equal(newFieldNames);
      expect(schema[1]).to.deep.equal(newFieldTypes);
    });

    it("should return empty arrays for removed topic", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);
      await contract.removeTopic(topicId);

      const schema = await contract.getSchema(topicId);
      expect(schema[0]).to.deep.equal([]);
      expect(schema[1]).to.deep.equal([]);
    });
  });

  describe("Access control and permissions", () => {
    it("should not allow non-TOPIC_MANAGER_ROLE to add topics", async () => {
      const topicId = 1001;
      const name = "Unauthorized Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await expect(
        contract
          .connect(user)
          .addTopic(topicId, name, encodedNames, encodedTypes),
      ).to.be.revertedWith(
        `AccessControl: account ${user.address.toLowerCase()} is missing role ${await contract.TOPIC_MANAGER_ROLE()}`,
      );
    });

    it("should not allow non-TOPIC_MANAGER_ROLE to update topics", async () => {
      // First add a topic as admin
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      // Try to update as non-admin
      const newName = "Updated Topic";
      await expect(
        contract
          .connect(user)
          .updateTopic(topicId, newName, encodedNames, encodedTypes),
      ).to.be.revertedWith(
        `AccessControl: account ${user.address.toLowerCase()} is missing role ${await contract.TOPIC_MANAGER_ROLE()}`,
      );
    });

    it("should not allow non-TOPIC_MANAGER_ROLE to remove topics", async () => {
      // First add a topic as admin
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      // Try to remove as non-admin
      await expect(
        contract.connect(user).removeTopic(topicId),
      ).to.be.revertedWith(
        `AccessControl: account ${user.address.toLowerCase()} is missing role ${await contract.TOPIC_MANAGER_ROLE()}`,
      );
    });

    it("should allow TOPIC_MANAGER_ROLE to perform all operations", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      // Add topic
      await expect(contract.addTopic(topicId, name, encodedNames, encodedTypes))
        .to.emit(contract, "TopicAdded")
        .withArgs(topicId, name, encodedNames, encodedTypes);

      // Update topic
      const newName = "Updated Topic";
      await expect(
        contract.updateTopic(topicId, newName, encodedNames, encodedTypes),
      )
        .to.emit(contract, "TopicUpdated")
        .withArgs(topicId, newName, encodedNames, encodedTypes);

      // Remove topic
      await expect(contract.removeTopic(topicId))
        .to.emit(contract, "TopicRemoved")
        .withArgs(topicId);
    });
  });

  describe("Edge cases and stress testing", () => {
    it("should handle multiple topics with same field names but different types", async () => {
      const topics = [
        {
          id: 1001,
          name: "Topic 1",
          fieldNames: ["field1"],
          fieldTypes: ["string"],
        },
        {
          id: 1002,
          name: "Topic 2",
          fieldNames: ["field1"],
          fieldTypes: ["uint256"],
        },
        {
          id: 1003,
          name: "Topic 3",
          fieldNames: ["field1"],
          fieldTypes: ["bool"],
        },
      ];

      for (const topic of topics) {
        const encodedNames = abi.encode(["string[]"], [topic.fieldNames]);
        const encodedTypes = abi.encode(["string[]"], [topic.fieldTypes]);
        await contract.addTopic(
          topic.id,
          topic.name,
          encodedNames,
          encodedTypes,
        );
      }

      // Verify all topics exist and are correct
      for (const topic of topics) {
        const retrievedTopic = await contract.getTopic(topic.id);
        expect(retrievedTopic.name).to.equal(topic.name);

        const fieldNames = await contract.getFieldNames(topic.id);
        const fieldTypes = await contract.getFieldTypes(topic.id);
        expect(fieldNames).to.deep.equal(topic.fieldNames);
        expect(fieldTypes).to.deep.equal(topic.fieldTypes);
      }
    });

    it("should handle topic with many fields", async () => {
      const topicId = 1001;
      const name = "Large Topic";
      const fieldNames = [];
      const fieldTypes = [];

      // Create 10 fields
      for (let i = 0; i < 10; i++) {
        fieldNames.push(`field${i}`);
        fieldTypes.push(i % 2 === 0 ? "string" : "uint256");
      }

      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const retrievedFieldNames = await contract.getFieldNames(topicId);
      const retrievedFieldTypes = await contract.getFieldTypes(topicId);

      expect(retrievedFieldNames).to.deep.equal(fieldNames);
      expect(retrievedFieldTypes).to.deep.equal(fieldTypes);
    });

    it("should handle topic with very long field names and types", async () => {
      const topicId = 1001;
      const name = "Long Names Topic";
      const longFieldName =
        "this_is_a_very_long_field_name_that_might_be_used_in_real_world_scenarios";
      const longFieldType =
        "this_is_a_very_long_field_type_that_might_be_used_in_real_world_scenarios";

      const fieldNames = [longFieldName];
      const fieldTypes = [longFieldType];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      const retrievedFieldNames = await contract.getFieldNames(topicId);
      const retrievedFieldTypes = await contract.getFieldTypes(topicId);

      expect(retrievedFieldNames[0]).to.equal(longFieldName);
      expect(retrievedFieldTypes[0]).to.equal(longFieldType);
    });

    it("should handle rapid add/update/remove operations", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      // Add topic
      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      // Update immediately
      const newName = "Updated Topic";
      await contract.updateTopic(topicId, newName, encodedNames, encodedTypes);

      // Remove immediately
      await contract.removeTopic(topicId);

      // Verify topic is removed
      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal("");
      expect(topic.encodedFieldNames).to.equal("0x");
      expect(topic.encodedFieldTypes).to.equal("0x");
    });

    it("should handle rapid add/update/remove operations", async () => {
      const topicId = 1001;
      const name = "Test Topic";
      const fieldNames = ["field1"];
      const fieldTypes = ["string"];
      const encodedNames = abi.encode(["string[]"], [fieldNames]);
      const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

      // Add topic
      await contract.addTopic(topicId, name, encodedNames, encodedTypes);

      // Update immediately
      const newName = "Updated Topic";
      await contract.updateTopic(topicId, newName, encodedNames, encodedTypes);

      // Remove immediately
      await contract.removeTopic(topicId);

      // Verify topic is removed
      const topic = await contract.getTopic(topicId);
      expect(topic.name).to.equal("");
      expect(topic.encodedFieldNames).to.equal("0x");
      expect(topic.encodedFieldTypes).to.equal("0x");
    });
  });
});

describe("IdentityUtilities - Simple Upgradeability Test", () => {
  let contract: any;
  let proxy: any;
  let implementation: any;
  let newImplementation: any;
  let admin: any;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();
    admin = deployer;

    // Deploy initial implementation
    const ImplFactory = await ethers.getContractFactory("IdentityUtilities");
    implementation = await ImplFactory.deploy();
    await implementation.waitForDeployment();

    // Deploy proxy
    const ProxyFactory = await ethers.getContractFactory(
      "IdentityUtilitiesProxy",
    );
    const proxyContract = await ProxyFactory.deploy(
      await implementation.getAddress(),
      implementation.interface.encodeFunctionData("initialize", [
        admin.address,
      ]),
    );
    await proxyContract.waitForDeployment();

    // Get contract interface for IdentityUtilities functions
    contract = ImplFactory.attach(await proxyContract.getAddress());

    // Get proxy for upgrade functions - use the same contract but call upgradeTo directly
    proxy = contract;

    // Deploy new implementation for upgrade testing
    newImplementation = await ImplFactory.deploy();
    await newImplementation.waitForDeployment();
  });

  it("should upgrade implementation and preserve data", async () => {
    // Add a topic before upgrade
    const topicId = 1001;
    const name = "Test Topic";
    const fieldNames = ["field1", "field2"];
    const fieldTypes = ["string", "uint256"];
    const encodedNames = abi.encode(["string[]"], [fieldNames]);
    const encodedTypes = abi.encode(["string[]"], [fieldTypes]);

    await contract.addTopic(topicId, name, encodedNames, encodedTypes);

    // Verify topic exists before upgrade
    const topicBefore = await contract.getTopic(topicId);
    expect(topicBefore.name).to.equal(name);

    // Upgrade to new implementation using upgradeToAndCall with empty data
    await contract.upgradeToAndCall(await newImplementation.getAddress(), "0x");

    // Verify topic still exists after upgrade
    const topicAfter = await contract.getTopic(topicId);
    expect(topicAfter.name).to.equal(name);
    expect(topicAfter.encodedFieldNames).to.equal(encodedNames);
    expect(topicAfter.encodedFieldTypes).to.equal(encodedTypes);

    // Verify field names and types are still accessible
    const retrievedFieldNames = await contract.getFieldNames(topicId);
    const retrievedFieldTypes = await contract.getFieldTypes(topicId);
    expect(retrievedFieldNames).to.deep.equal(fieldNames);
    expect(retrievedFieldTypes).to.deep.equal(fieldTypes);
  });
});
