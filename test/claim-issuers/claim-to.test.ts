import { expect } from "chai";
import { ethers } from "hardhat";
import { deployIdentityFixture } from "../fixtures";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ClaimIssuer - Add claim to another identity", function () {
  describe("addClaimTo", function () {
    describe("when adding a claim to another identity with management key", function () {
      it("should add a claim using nested execute calls", async function () {
        const { claimIssuer, aliceWallet, aliceIdentity, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);

        // Create a new claim with a different topic to avoid conflicts with fixture
        const newClaim = {
          identity: aliceIdentity.target,
          issuer: claimIssuer.target,
          topic: 999,
          scheme: 1,
          data: '0x0099',
          signature: '',
          uri: 'https://example.com/new-claim',
        };

        newClaim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [newClaim.identity, newClaim.topic, newClaim.data]
              )
            )
          )
        );

        // Add ClaimIssuer as management key (purpose 1) to aliceIdentity
        const claimIssuerKey = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address"],
            [await claimIssuer.getAddress()],
          ),
        );
        await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 1, 1);

        const tx = await claimIssuer.addClaimTo(
          newClaim.topic,
          newClaim.scheme,
          newClaim.signature,
          newClaim.data,
          newClaim.uri,
          newClaim.identity,
        );

        // Prepare the expected data for event assertions
        const addClaimData = aliceIdentity.interface.encodeFunctionData('addClaim', [
          newClaim.topic,
          newClaim.scheme,
          newClaim.issuer,
          newClaim.signature,
          newClaim.data,
          newClaim.uri
        ]);

        // Events from Alice's identity (outer execution only)
        await expect(tx).to.emit(aliceIdentity, 'ExecutionRequested').withArgs(0, aliceIdentity.target, 0, addClaimData);
        await expect(tx).to.emit(aliceIdentity, 'Approved').withArgs(0, true);
        await expect(tx).to.emit(aliceIdentity, 'Executed').withArgs(0, aliceIdentity.target, 0, addClaimData);

        // Since the ClaimIssuer has management keys (purpose 1), the inner addClaim should be auto-approved
        // and executed immediately, so we should see the ClaimAdded event
        const claimId = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [newClaim.issuer, newClaim.topic],
          ),
        );
        await expect(tx).to.emit(aliceIdentity, 'ClaimAdded').withArgs(claimId, newClaim.topic, newClaim.scheme, newClaim.issuer, newClaim.signature, newClaim.data, newClaim.uri);

        // Check that ClaimAddedTo event is emitted by the ClaimIssuer
        await expect(tx).to.emit(claimIssuer, 'ClaimAddedTo').withArgs(
          newClaim.identity,
          newClaim.topic,
          newClaim.signature,
          newClaim.data
        );

        // Verify the claim was actually added
        const claim = await aliceIdentity.getClaim(claimId);
        expect(claim.topic).to.equal(newClaim.topic);
        expect(claim.scheme).to.equal(newClaim.scheme);
        expect(claim.issuer).to.equal(newClaim.issuer);
        expect(claim.signature).to.equal(newClaim.signature);
        expect(claim.data).to.equal(newClaim.data);
        expect(claim.uri).to.equal(newClaim.uri);
      });
    });
    describe("when adding a claim to another identity with non-management key", function () {
      it("should revert", async function () {
        const { claimIssuer, aliceClaim666, bobWallet } = await loadFixture(
          deployIdentityFixture,
        );

        await expect(
          claimIssuer
            .connect(bobWallet)
            .addClaimTo(
              aliceClaim666.topic,
              aliceClaim666.scheme,
              aliceClaim666.signature,
              aliceClaim666.data,
              aliceClaim666.uri,
              aliceClaim666.identity,
            ),
        ).to.be.revertedWithCustomError(
          claimIssuer,
          "SenderDoesNotHaveManagementKey",
        );
      });
    });
    describe("when signature is invalid", function () {
      it("should revert", async function () {
        const { claimIssuer, aliceWallet, aliceIdentity, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);

        const invalidClaim = {
          identity: aliceIdentity.target,
          issuer: claimIssuer.target,
          topic: 999,
          scheme: 1,
          data: '0x0099',
          signature: '0x1234567890abcdef',
          uri: 'https://example.com/invalid-claim',
        };

        await expect(
          claimIssuer
            .connect(claimIssuerWallet)
            .addClaimTo(
              invalidClaim.topic,
              invalidClaim.scheme,
              invalidClaim.signature,
              invalidClaim.data,
              invalidClaim.uri,
              invalidClaim.identity,
            ),
        ).to.be.revertedWithCustomError(claimIssuer, "InvalidClaim");
      });
    });
    describe("when identity is address zero", function () {
      it("should revert", async function () {
        const { claimIssuer, aliceWallet, aliceIdentity, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);

        // Add management key for aliceWallet on claimIssuer
        await claimIssuer.connect(claimIssuerWallet).addKey(
          ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(['address'], [aliceWallet.address])
          ),
          1,
          1,
        );

        const newClaim = {
          identity: ethers.ZeroAddress,
          issuer: claimIssuer.target,
          topic: 999,
          scheme: 1,
          data: '0x0099',
          signature: '',
          uri: 'https://example.com/new-claim',
        };

        newClaim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [newClaim.identity, newClaim.topic, newClaim.data]
              )
            )
          )
        );

        await expect(
          claimIssuer
            .connect(aliceWallet)
            .addClaimTo(999, 1, '0x0099', '0x0099', 'https://example.com/new-claim', ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(claimIssuer, "InvalidClaim");
      });
    });
    describe("when user doesn't have the right key on Identity side", function () {
      it("should require approval", async function () {
        const { claimIssuer, aliceWallet, aliceClaim666, aliceIdentity, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);

        // Create a new claim with a different topic to avoid conflicts with fixture
        const newClaim = {
          identity: aliceIdentity.target,
          issuer: claimIssuer.target,
          topic: 999,
          scheme: 1,
          data: '0x0099',
          signature: '',
          uri: 'https://example.com/new-claim',
        };

        newClaim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [newClaim.identity, newClaim.topic, newClaim.data]
              )
            )
          )
        );

        const tx = await claimIssuer.addClaimTo(
          newClaim.topic,
          newClaim.scheme,
          newClaim.signature,
          newClaim.data,
          newClaim.uri,
          newClaim.identity,
        );
        const receipt = await tx.wait();

        // Find the execution ID from the event
        const executionRequestedEvent = receipt?.logs.find(
          (log: any) => log.fragment?.name === "ExecutionRequested",
        );
        const executionId = (executionRequestedEvent as any)?.args?.[0];

        expect(executionRequestedEvent).to.not.be.undefined;
        expect((executionRequestedEvent as any)?.args?.[0]).to.equal(
          executionId,
        );
        expect((executionRequestedEvent as any)?.args?.[1]).to.equal(
          aliceIdentity.target,
        );
        expect((executionRequestedEvent as any)?.args?.[2]).to.equal(0);

        const claimId = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [newClaim.issuer, newClaim.topic],
          ),
        );

        // Verify the claim doesn't exist before approval
        const claimBeforeApproval = await aliceIdentity.getClaim(claimId);
        expect(claimBeforeApproval.topic).to.equal(0);

        // Approve the execution (ID 0)
        await aliceIdentity.connect(aliceWallet).approve(executionId, true);

        const claim = await aliceIdentity.getClaim(claimId);
        expect(claim.topic).to.equal(newClaim.topic);
        expect(claim.scheme).to.equal(newClaim.scheme);
        expect(claim.issuer).to.equal(newClaim.issuer);
        expect(claim.signature).to.equal(newClaim.signature);
        expect(claim.data).to.equal(newClaim.data);
        expect(claim.uri).to.equal(newClaim.uri);
      });
    });

    describe("when addClaimTo is called by right key on ClaimIssuer but ClaimIssuer lacks key on Identity", function () {
      it("should keep the claim pending and the identity owner can approve the execution", async function () {
        const { claimIssuer, aliceWallet, aliceIdentity, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);

        // Create a new claim with a different topic to avoid conflicts with fixture
        const newClaim = {
          identity: aliceIdentity.target,
          issuer: claimIssuer.target,
          topic: 999,
          scheme: 1,
          data: '0x0099',
          signature: '',
          uri: 'https://example.com/new-claim',
        };

        newClaim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [newClaim.identity, newClaim.topic, newClaim.data]
              )
            )
          )
        );

        const tx = await claimIssuer.addClaimTo(
          newClaim.topic,
          newClaim.scheme,
          newClaim.signature,
          newClaim.data,
          newClaim.uri,
          newClaim.identity,
        );
        const receipt = await tx.wait();

        // Verify that ExecutionRequested event was emitted (execution is pending)
        const executionRequestedEvent = receipt?.logs.find(
          (log: any) => log.fragment?.name === "ExecutionRequested",
        );

        expect(executionRequestedEvent).to.not.be.undefined;

        const executionId = (executionRequestedEvent as any)?.args?.[0];

        // Verify that the claim is NOT yet added (execution is pending)
        const claimId = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [newClaim.issuer, newClaim.topic],
          ),
        );

        const claimBeforeApproval = await aliceIdentity.getClaim(claimId);
        expect(claimBeforeApproval.topic).to.equal(0);

        // Approve the execution (ID 0)
        await aliceIdentity
          .connect(aliceWallet)
          .approve(0, true);

        // Verify that the claim is now added after both approvals
        const claimAfterApproval = await aliceIdentity.getClaim(claimId);

        expect(claimAfterApproval.topic).to.equal(newClaim.topic);
        expect(claimAfterApproval.scheme).to.equal(newClaim.scheme);
        expect(claimAfterApproval.issuer).to.equal(newClaim.issuer);
        expect(claimAfterApproval.signature).to.equal(newClaim.signature);
        expect(claimAfterApproval.data).to.equal(newClaim.data);
        expect(claimAfterApproval.uri).to.equal(newClaim.uri);
      });
    });

    describe("when ClaimIssuer has claim signing keys (purpose 3) on Identity", function () {
      it("should auto-approve addClaim execution", async function () {
        const { claimIssuer, aliceWallet, aliceIdentity, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);

        // Create a new claim with a different topic
        const newClaim = {
          identity: aliceIdentity.target,
          issuer: claimIssuer.target,
          topic: 999,
          scheme: 1,
          data: '0x0099',
          signature: '',
          uri: 'https://example.com/new-claim',
        };

        newClaim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [newClaim.identity, newClaim.topic, newClaim.data]
              )
            )
          )
        );

        // Add ClaimIssuer as management key (purpose 1) and claim signing key (purpose 3)
        const claimIssuerKey = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address"],
            [await claimIssuer.getAddress()],
          ),
        );

        await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 1, 1);

        const tx = await claimIssuer.addClaimTo(
          newClaim.topic,
          newClaim.scheme,
          newClaim.signature,
          newClaim.data,
          newClaim.uri,
          newClaim.identity,
        );

        const receipt = await tx.wait();

        // Prepare the expected data for event assertions
        const addClaimData = aliceIdentity.interface.encodeFunctionData('addClaim', [
          newClaim.topic,
          newClaim.scheme,
          newClaim.issuer,
          newClaim.signature,
          newClaim.data,
          newClaim.uri
        ]);

        // Since both executes are auto-approved, we should only see one execution request and approval
        await expect(tx).to.emit(aliceIdentity, 'ExecutionRequested').withArgs(0, aliceIdentity.target, 0, addClaimData);
        await expect(tx).to.emit(aliceIdentity, 'Approved').withArgs(0, true);
        await expect(tx).to.emit(aliceIdentity, 'Executed').withArgs(0, aliceIdentity.target, 0, addClaimData);

        // The inner execute (addClaim) should be auto-approved immediately, so no separate events
        // But the claim should be added
        const claimId = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [newClaim.issuer, newClaim.topic],
          ),
        );
        await expect(tx).to.emit(aliceIdentity, 'ClaimAdded').withArgs(claimId, newClaim.topic, newClaim.scheme, newClaim.issuer, newClaim.signature, newClaim.data, newClaim.uri);

        // Check that ClaimAddedTo event is emitted by the ClaimIssuer
        await expect(tx).to.emit(claimIssuer, 'ClaimAddedTo').withArgs(
          newClaim.identity,
          newClaim.topic,
          newClaim.signature,
          newClaim.data
        );

        // Verify the claim was actually added
        const claim = await aliceIdentity.getClaim(claimId);
        expect(claim.topic).to.equal(newClaim.topic);
        expect(claim.scheme).to.equal(newClaim.scheme);
        expect(claim.issuer).to.equal(newClaim.issuer);
        expect(claim.signature).to.equal(newClaim.signature);
        expect(claim.data).to.equal(newClaim.data);
        expect(claim.uri).to.equal(newClaim.uri);
      });
    });

    describe("when execute call fails", function () {
      it("should revert with CallFailed error", async function () {
        const { claimIssuer, aliceIdentity, claimIssuerWallet, aliceWallet } = await loadFixture(deployIdentityFixture);

        const newClaim = {
          identity: aliceIdentity.target,
          issuer: claimIssuer.target,
          topic: 999,
          scheme: 1,
          data: '0x0099',
          signature: '',
          uri: 'https://example.com/new-claim',
        };

        newClaim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [newClaim.identity, newClaim.topic, newClaim.data]
              )
            )
          )
        );

        const claimIssuerKey = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address"],
            [await claimIssuer.getAddress()],
          ),
        );
        await aliceIdentity.connect(aliceWallet).addKey(claimIssuerKey, 3, 1);

        // Remove all management keys from aliceIdentity to make execute fail
        const aliceKey = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address"],
            [aliceWallet.address],
          ),
        );
        await aliceIdentity.connect(aliceWallet).removeKey(aliceKey, 1);

        await expect(
          claimIssuer
            .connect(claimIssuerWallet)
            .addClaimTo(
              newClaim.topic,
              newClaim.scheme,
              newClaim.signature,
              newClaim.data,
              newClaim.uri,
              newClaim.identity,
            ),
        ).to.be.revertedWithCustomError(claimIssuer, "CallFailed");
      });
    });
  });
});
