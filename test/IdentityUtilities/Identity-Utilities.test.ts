import { ethers } from "hardhat";
import { expect } from "chai";

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

    // Call getTopics
    const ids = [10, 20];
    const result = await contract.getTopics(ids);

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
