import { expect } from "chai";
import { ethers } from "hardhat";
import { BaseContract, ContractFactory } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployIdentityFixture } from "../fixtures";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


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
  let identity: IIdentity;
  let owner: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy Identity contract
    const Identity: ContractFactory =
      await ethers.getContractFactory("Identity");
    identity = (await Identity.deploy(
      owner.address,
      false,
    )) as unknown as IIdentity;
    await identity.waitForDeployment();

    const { claimIssuer, aliceWallet } = await loadFixture(
      deployIdentityFixture,
    );

    // Add MANAGEMENT key to the identity
    const claimIssuerKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [await claimIssuer.getAddress()],
      ),
    );

    // Add CLAIM key to the identity
    await identity.addKey(claimIssuerKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
    await identity.addKey(claimIssuerKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type

    const identityKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [await identity.getAddress()],
      ),
    );

    await claimIssuer.addKey(identityKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type
    await claimIssuer.addKey(identityKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
    // Add CLAIM key to the ClaimIssuer
    const ownerKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [owner.address]),
    );
    await claimIssuer.addKey(ownerKey, 3, 1); // Add CLAIM key to ClaimIssuer

    // Hash the address before adding as key
    const aliceKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [aliceWallet.address],
      ),
    );
    await identity.addKey(aliceKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
    await identity.addKey(aliceKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type
  });

  describe("addClaimTo", function () {
    it("should add a claim using nested execute calls", async function () {
      const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } =
        await loadFixture(deployIdentityFixture);

      const aliceKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address"],
          [aliceWallet.address],
        ),
      );

      await identity.addKey(aliceKey, 3, 1); // 3 is CLAIM purpose, 1 is ECDSA type
      await identity.addKey(aliceKey, 1, 1); // 1 is MANAGEMENT purpose, 1 is ECDSA type

      const claimIssuerKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address"],
          [await claimIssuer.getAddress()],
        ),
      );
      await identity.addKey(claimIssuerKey, 1, 1);
      await identity.addKey(claimIssuerKey, 3, 1);

      await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 1, 1);
      await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 3, 1);
      // Get the transaction
      const tx = await claimIssuer.addClaimTo(
        aliceClaim666.topic,
        aliceClaim666.scheme,
        aliceClaim666.issuer,
        aliceClaim666.signature,
        aliceClaim666.data,
        aliceClaim666.uri,
        aliceClaim666.identity,
      );

      // Wait for the transaction to be mined and get the receipt
      const receipt = await tx.wait();
      // Find the ClaimAdded event
      const claimAddedEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "ClaimChanged",
      );

      // Get the claimId from the event using proper type casting
      const claimId = (claimAddedEvent as any)?.args?.[0];

      const claim = await aliceIdentity.getClaim(claimId);
      expect(claim.topic).to.equal(aliceClaim666.topic);
      expect(claim.scheme).to.equal(aliceClaim666.scheme);
      expect(claim.issuer).to.equal(aliceClaim666.issuer);
      expect(claim.signature).to.equal(aliceClaim666.signature);
      expect(claim.data).to.equal(aliceClaim666.data);
      expect(claim.uri).to.equal(aliceClaim666.uri);
    });

    it("should revert if not called by manager", async function () {
      const { claimIssuer, aliceClaim666 } = await loadFixture(
        deployIdentityFixture,
      );
      const otherKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [other.address]),
      );
      await claimIssuer.removeKey(otherKey, 1);

      const OtherWallet = await ethers.getSigner(other.address);

      await expect(
        claimIssuer
          .connect(OtherWallet)
          .addClaimTo(
            aliceClaim666.topic,
            aliceClaim666.scheme,
            aliceClaim666.issuer,
            aliceClaim666.signature,
            aliceClaim666.data,
            aliceClaim666.uri,
            await identity.getAddress(),
          ),
      ).to.be.revertedWithCustomError(
        claimIssuer,
        "SenderDoesNotHaveManagementKey",
      );
    });
  });
});
