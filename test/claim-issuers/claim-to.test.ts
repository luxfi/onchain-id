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
  approve(id: bigint, approve: boolean): Promise<any>;
  getPendingClaim(claimId: string): Promise<{
    topic: number;
    scheme: number;
    issuer: string;
    signature: string;
    data: string;
    uri: string;
  }>;
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

    const { claimIssuer } = await loadFixture(
      deployIdentityFixture,
    );

    // Add MANAGEMENT key (type 1) to the identity for the claim issuer
    const claimIssuerKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [await claimIssuer.getAddress()],
      ),
    );
    await identity.addKey(claimIssuerKey, 1, 1); // Only need type 1 (MANAGEMENT) key

    // Add MANAGEMENT key (type 1) to the claim issuer for the identity
    const identityKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [await identity.getAddress()],
      ),
    );
    await claimIssuer.addKey(identityKey, 1, 1); // Only need type 1 (MANAGEMENT) key
  });

  describe("addClaimTo", function () {
    it("should add a claim using nested execute calls", async function () {
      const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } = await loadFixture(deployIdentityFixture);

      // Add MANAGEMENT key (type 1) to aliceIdentity for the claim issuer
      const claimIssuerKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address"],
          [await claimIssuer.getAddress()],
        ),
      );
      await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 1, 1);

      // Add the claim
      const tx = await claimIssuer.addClaimTo(
        aliceClaim666.topic,
        aliceClaim666.scheme,
        aliceClaim666.issuer,
        aliceClaim666.signature,
        aliceClaim666.data,
        aliceClaim666.uri,
        aliceClaim666.identity
      );
      const receipt = await tx.wait();

      // Find the ClaimChanged event
      const claimChangedEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "ClaimChanged"
      );
      const claimId = (claimChangedEvent as any)?.args?.[0];

      const claim = await aliceIdentity.getClaim(claimId);
      expect(claim.topic).to.equal(aliceClaim666.topic);
      expect(claim.scheme).to.equal(aliceClaim666.scheme);
      expect(claim.issuer).to.equal(aliceClaim666.issuer);
      expect(claim.signature).to.equal(aliceClaim666.signature);
      expect(claim.data).to.equal(aliceClaim666.data);
      expect(claim.uri).to.equal(aliceClaim666.uri);
    });

    it("should revert if not called by manager", async function () {
      const { claimIssuer, aliceClaim666, aliceIdentity, aliceWallet, bobWallet } = await loadFixture(deployIdentityFixture);

      await expect(
        claimIssuer
          .connect(bobWallet)
          .addClaimTo(
            aliceClaim666.topic,
            aliceClaim666.scheme,
            aliceClaim666.issuer,
            aliceClaim666.signature,
            aliceClaim666.data,
            aliceClaim666.uri,
            aliceClaim666.identity
          )
      ).to.be.revertedWithCustomError(claimIssuer, "SenderDoesNotHaveManagementKey");
    });

    it("should require approval when ClaimIssuer doesn't have the right key on Identity side", async function () {
      const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } = await loadFixture(deployIdentityFixture);

      // Add the claim - this should create a pending execution since ClaimIssuer doesn't have the right key
      const tx = await claimIssuer.addClaimTo(
        aliceClaim666.topic,
        aliceClaim666.scheme,
        aliceClaim666.issuer,
        aliceClaim666.signature,
        aliceClaim666.data,
        aliceClaim666.uri,
        aliceClaim666.identity
      );
      const receipt = await tx.wait();

      // Find the execution ID from the event
      const executionEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "ExecutionRequested"
      );
      const executionId = (executionEvent as any)?.args?.[0];

      // Verify the execution is pending by checking the event
      const executionRequestedEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "ExecutionRequested"
      );
      expect(executionRequestedEvent).to.not.be.undefined;
      expect((executionRequestedEvent as any)?.args?.[0]).to.equal(executionId);
      expect((executionRequestedEvent as any)?.args?.[1]).to.equal(aliceIdentity.target);
      expect((executionRequestedEvent as any)?.args?.[2]).to.equal(0);

      // DEBUG: Fetch the claim before approval/rejection
      const claimId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [aliceClaim666.issuer, aliceClaim666.topic]
        )
      );

      // Approve the execution as the Identity owner
      await aliceIdentity.connect(aliceWallet).approve(executionId, true);

      // Verify the claim was added
      const claim = await aliceIdentity.getClaim(claimId);
      expect(claim.topic).to.equal(aliceClaim666.topic);
      expect(claim.scheme).to.equal(aliceClaim666.scheme);
      expect(claim.issuer).to.equal(aliceClaim666.issuer);
      expect(claim.signature).to.equal(aliceClaim666.signature);
      expect(claim.data).to.equal(aliceClaim666.data);
      expect(claim.uri).to.equal(aliceClaim666.uri);
    });

    it("should allow rejection of pending execution", async function () {
      const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } = await loadFixture(deployIdentityFixture);

      // Add the claim - this should create a pending execution
      const tx = await claimIssuer.addClaimTo(
        aliceClaim666.topic,
        aliceClaim666.scheme,
        aliceClaim666.issuer,
        aliceClaim666.signature,
        aliceClaim666.data,
        aliceClaim666.uri,
        aliceClaim666.identity
      );
      const receipt = await tx.wait();

      // Find the execution ID from the event
      const executionEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "ExecutionRequested"
      );
      const executionId = (executionEvent as any)?.args?.[0];

      // Reject the execution as the Identity owner
      const rejectTx = await aliceIdentity.connect(aliceWallet).approve(executionId, false);
      
      // Verify the execution was rejected by checking the Approved event
      await expect(rejectTx).to.emit(aliceIdentity, "Approved").withArgs(executionId, false);

      // Verify the execution was not executed by checking that Executed event was not emitted
      await expect(rejectTx).to.not.emit(aliceIdentity, "Executed");
    });
  });
});
