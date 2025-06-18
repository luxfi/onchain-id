import { expect } from "chai";
import { ethers } from "hardhat";
import { deployIdentityFixture } from "../fixtures";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ClaimIssuer - Add claim to another identity", function () { 
  describe("addClaimTo", function () {
    describe("when adding a claim to another identity with management key", function () {
    it("should add a claim using nested execute calls", async function () {
      const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } = await loadFixture(deployIdentityFixture);

      const claimIssuerKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address"],
          [await claimIssuer.getAddress()],
        ),
      );
      await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 1, 1);

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
  });
  describe("when adding a claim to another identity with non-management key", function () {
    it("should revert", async function () {
      const { claimIssuer, aliceClaim666, bobWallet } = await loadFixture(deployIdentityFixture);

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
  });
  describe("when user doesn't have the right key on Identity side", function () {
    it("should require approval", async function () {
      const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } = await loadFixture(deployIdentityFixture);

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

      const claimId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [aliceClaim666.issuer, aliceClaim666.topic]
        )
      );

      await aliceIdentity.connect(aliceWallet).approve(executionId, true);

      const claim = await aliceIdentity.getClaim(claimId);
      expect(claim.topic).to.equal(aliceClaim666.topic);
      expect(claim.scheme).to.equal(aliceClaim666.scheme);
      expect(claim.issuer).to.equal(aliceClaim666.issuer);
      expect(claim.signature).to.equal(aliceClaim666.signature);
      expect(claim.data).to.equal(aliceClaim666.data);
      expect(claim.uri).to.equal(aliceClaim666.uri);
    });
  });

  describe("when addClaimTo is called by right key on ClaimIssuer but ClaimIssuer lacks key on Identity", function () {
    it("should keep the claim pending and the identity owner can approve the execution", async function () {
      const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity } = await loadFixture(deployIdentityFixture);

      const tx = await claimIssuer
        .addClaimTo(
          aliceClaim666.topic,
          aliceClaim666.scheme,
          aliceClaim666.issuer,
          aliceClaim666.signature,
          aliceClaim666.data,
          aliceClaim666.uri,
          aliceClaim666.identity
        );
      const receipt = await tx.wait();

      // Verify that ExecutionRequested event was emitted (execution is pending)
      const executionRequestedEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "ExecutionRequested"
      );

      expect(executionRequestedEvent).to.not.be.undefined;

      const executionId = (executionRequestedEvent as any)?.args?.[0];

      // Verify that the claim is NOT yet added (execution is pending)
      const claimId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [aliceClaim666.issuer, aliceClaim666.topic]
        )
      );
      
      const claimBeforeApproval = await aliceIdentity.getClaim(claimId);
      expect(claimBeforeApproval.topic).to.equal(aliceClaim666.topic);

      const expectedAddClaimData = aliceIdentity.interface.encodeFunctionData('addClaim', [
        aliceClaim666.topic,
        aliceClaim666.scheme,
        aliceClaim666.issuer,
        aliceClaim666.signature,
        aliceClaim666.data,
        aliceClaim666.uri
      ]);

      // Approve the execution as the Identity owner
      const approveTx = await aliceIdentity.connect(aliceWallet).approve(executionId, true);
      
      // Verify the execution was approved and the data matches
      await expect(approveTx)
        .to.emit(aliceIdentity, "Approved").withArgs(executionId, true);
      await expect(approveTx)
        .to.emit(aliceIdentity, "Executed")
        .withArgs(executionId, aliceIdentity.target, 0, expectedAddClaimData);

      // Verify that the claim is now added after approval
      const claimAfterApproval = await aliceIdentity.getClaim(claimId);
      expect(claimAfterApproval.topic).to.equal(aliceClaim666.topic);
      expect(claimAfterApproval.scheme).to.equal(aliceClaim666.scheme);
      expect(claimAfterApproval.issuer).to.equal(aliceClaim666.issuer);
      expect(claimAfterApproval.signature).to.equal(aliceClaim666.signature);
      expect(claimAfterApproval.data).to.equal(aliceClaim666.data);
      expect(claimAfterApproval.uri).to.equal(aliceClaim666.uri);
    });
  });
  });
});