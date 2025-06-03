import { expect } from "chai";
import { ethers } from "hardhat";
import { BaseContract, ContractFactory } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployIdentityFixture } from "../fixtures";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

interface IClaimIssuer extends BaseContract {
  addClaimTo(
    topic: number,
    scheme: number,
    issuer: string,
    signature: string,
    data: string,
    uri: string,
    identity: string
  ): Promise<any>;
  addKey(key: string, purpose: number, keyType: number): Promise<any>;
  isClaimValid(identity: string, topic: number, signature: string, data: string): Promise<boolean>;
}

interface IIdentity extends BaseContract {
  getClaim(claimId: string): Promise<{
    topic: number;
    scheme: number;
    issuer: string;
    signature: string;
    data: string;
    uri: string;
  }>;
  execute(to: string, value: number, data: string): Promise<any>;
  addKey(key: string, purpose: number, keyType: number): Promise<any>;
}

describe("ClaimIssuer", function () {
  let claimIssuer: IClaimIssuer;
  let identity: IIdentity;
  let owner: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy Identity contract
    const Identity: ContractFactory = await ethers.getContractFactory("Identity");
    identity = await Identity.deploy(owner.address, false) as unknown as IIdentity;
    await identity.waitForDeployment();

    // Deploy ClaimIssuer contract
    const ClaimIssuer: ContractFactory = await ethers.getContractFactory("ClaimIssuer");
   
    const { claimIssuer, aliceWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);


    // Add MANAGEMENT key to the identity
    const claimIssuerKey = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await claimIssuer.getAddress()]));

    // Add CLAIM key to the identity
    await identity.addKey(claimIssuerKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
    await identity.addKey(claimIssuerKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type

    const identityKey = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await identity.getAddress()]));

    await claimIssuer.addKey(identityKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type
    await claimIssuer.addKey(identityKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
    // Add CLAIM key to the ClaimIssuer
    const ownerKey = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [owner.address]));
    await claimIssuer.addKey(ownerKey, 3, 1); // Add CLAIM key to ClaimIssuer

    // Hash the address before adding as key
    const aliceKey = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [aliceWallet.address]));
    await identity.addKey(aliceKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
    await identity.addKey(aliceKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type
  });

  describe("addClaimTo", function () {
    it("should add a claim using nested execute calls", async function () {
      const topic = 1;
      const scheme = 1;
   //   const issuer = await claimIssuer.getAddress();
      const data = "0x5678";
      const uri = "https://example.com/claim";

       const dataHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256', 'bytes'],
          [await identity.getAddress(), topic, data]
        )
      );
      //bytes32 prefixedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash));
      
      console.log("owner address", await owner.getAddress());
     // const signature = await owner.signMessage(dataHash);
   //   console.log("getRecoveredAddress", await identity.getRecoveredAddress(signature, prefixedHash));
   //   expect(await identity.getRecoveredAddress(signature, prefixedHash)).to.equal(await owner.getAddress());

   const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } = await loadFixture(deployIdentityFixture);

   const aliceKey = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [aliceWallet.address]));

   await identity.addKey(aliceKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
  await identity.addKey(aliceKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type

   // Encode the claim data properly
   const claimDataHash = ethers.keccak256(
     ethers.AbiCoder.defaultAbiCoder().encode(
       ['address', 'uint256', 'bytes'],
       [aliceClaim666.identity, aliceClaim666.topic, aliceClaim666.data]
     )
   );

   const signature = await aliceWallet.signMessage(ethers.getBytes(claimDataHash));
   const claimIssuerKey = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await claimIssuer.getAddress()]));
   await identity.addKey(
    claimIssuerKey, 1, 1
   )
   await identity.addKey(
    claimIssuerKey, 3, 1
   )

   await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 1, 1);
   await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 3, 1);
   console.log("claimIssuerKey", claimIssuerKey);
   console.log("keyHasPurposeTest", await identity.keyHasPurpose(claimIssuerKey, 3));
   console.log("keyHasPurposeTest", await identity.keyHasPurpose(claimIssuerKey, 1));

   console.log("aliceClaim666.signature", aliceClaim666.signature);

      // Get the transaction
      const tx = await claimIssuer.addClaimTo(
        aliceClaim666.topic,
        aliceClaim666.scheme,
        aliceClaim666.issuer,
        aliceClaim666.signature,
        aliceClaim666.data,
        aliceClaim666.uri,
        aliceClaim666.identity
      );

      // Wait for the transaction to be mined and get the receipt
      const receipt = await tx.wait();
      console.log("receiptLogs", receipt.logs);
      // Find the ClaimAdded event
      const claimAddedEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === 'ClaimChanged'
      );
      
      // Get the claimId from the event using proper type casting
      const claimId = (claimAddedEvent as any)?.args?.[0];
      console.log("Claim ID from event:", claimId);

      const claim = await aliceIdentity.getClaim(claimId);
      console.log("Claim data:", claim);
      expect(claim.topic).to.equal(aliceClaim666.topic);
      expect(claim.scheme).to.equal(aliceClaim666.scheme);
      expect(claim.issuer).to.equal(aliceClaim666.issuer);
      expect(claim.signature).to.equal(aliceClaim666.signature);
      expect(claim.data).to.equal(aliceClaim666.data);
      expect(claim.uri).to.equal(aliceClaim666.uri);
    });
/*
    it("should revert if not called by manager", async function () {
      const topic = 1;
      const scheme = 1;
 //     const issuer = await claimIssuer.getAddress();
      const data = "0x5678";
      const uri = "https://example.com/claim";

      const dataHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256', 'bytes'],
          [await identity.getAddress(), topic, data]
        )
      );
      const prefixedHash = ethers.keccak256(
        ethers.concat([
          ethers.toUtf8Bytes("\x19Ethereum Signed Message:\n32"),
          ethers.getBytes(dataHash)
        ])
      );
      const { claimIssuer, aliceWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);
      

      // Encode the claim data properly
      const testDataHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256', 'bytes'],
          [await identity.getAddress(), aliceClaim666.topic, aliceClaim666.data]
        )
      );

      const signature = await aliceWallet.signMessage(ethers.getBytes(testDataHash));
      await expect(
        claimIssuer.connect(other).addClaimTo(
          aliceClaim666.topic,
          aliceClaim666.scheme,
          aliceClaim666.issuer,
          signature,
          aliceClaim666.data,
          aliceClaim666.uri,
          await identity.getAddress()
        )
      ).to.be.revertedWithCustomError(claimIssuer, 'SenderDoesNotHaveManagementKey');
    });
    */
  });
}); 