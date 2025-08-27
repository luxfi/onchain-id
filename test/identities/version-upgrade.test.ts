import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployIdentityFixture } from "../fixtures";

describe("Identity Version Upgrade", function () {
  describe("Version Management", function () {
    it("should return the initial version", async function () {
      const { aliceIdentity } = await loadFixture(deployIdentityFixture);

      const version = await aliceIdentity.version();
      expect(version).to.equal("2.2.2");
    });

    it("should allow management key to call reinitialize", async function () {
      const { aliceIdentity, aliceWallet } = await loadFixture(
        deployIdentityFixture,
      );

      // Connect as management key (aliceWallet is the management key)
      const identityAsManager = aliceIdentity.connect(aliceWallet);

      // Call reinitialize to upgrade to version 2.3.0
      await expect(identityAsManager.reinitialize("2.3.0", 2)).to.not.be
        .reverted;

      // Check that version was updated
      const newVersion = await aliceIdentity.version();
      expect(newVersion).to.equal("2.3.0");
    });

    it("should not allow non-management key to call reinitialize", async function () {
      const { aliceIdentity, carolWallet } = await loadFixture(
        deployIdentityFixture,
      );

      // Connect as claim key (not management key)
      const identityAsClaimKey = aliceIdentity.connect(carolWallet);

      // Should revert when non-management key tries to reinitialize
      await expect(
        identityAsClaimKey.reinitialize("2.3.0", 2),
      ).to.be.revertedWithCustomError(
        aliceIdentity,
        "SenderDoesNotHaveManagementKey",
      );
    });

    it("should not allow reinitialize to be called twice", async function () {
      const { aliceIdentity, aliceWallet } = await loadFixture(
        deployIdentityFixture,
      );

      // Connect as management key
      const identityAsManager = aliceIdentity.connect(aliceWallet);

      // First call should succeed
      await identityAsManager.reinitialize("2.3.0", 2);

      // Second call should revert (reinitializer(2) can only be called once)
      await expect(
        identityAsManager.reinitialize("2.4.0", 2),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should maintain version across upgrades", async function () {
      const { aliceIdentity, aliceWallet } = await loadFixture(
        deployIdentityFixture,
      );

      // Connect as management key
      const identityAsManager = aliceIdentity.connect(aliceWallet);

      // Upgrade to version 2.3.0
      await identityAsManager.reinitialize("2.3.0", 2);

      // Verify version is updated
      let version = await aliceIdentity.version();
      expect(version).to.equal("2.3.0");

      // Note: We can't call reinitialize again with the same version number
      // as reinitializer(2) can only be called once. In a real upgrade scenario,
      // you would deploy a new implementation with a higher reinitializer version.
    });
  });

  describe("Version Upgrade Pattern", function () {
    it("should demonstrate the upgrade pattern", async function () {
      const { aliceIdentity, aliceWallet } = await loadFixture(
        deployIdentityFixture,
      );

      // Connect as management key
      const identityAsManager = aliceIdentity.connect(aliceWallet);

      // Initial version
      expect(await aliceIdentity.version()).to.equal("2.2.2");

      // Upgrade to version 2.3.0 using reinitializer(2)
      await identityAsManager.reinitialize("2.3.0", 2);
      expect(await aliceIdentity.version()).to.equal("2.3.0");

      // Note: In a real upgrade scenario, you would:
      // 1. Deploy a new implementation contract
      // 2. Call upgradeTo() on the proxy to point to the new implementation
      // 3. Call reinitialize() on the new implementation to set up new features

      // For demonstration, we can show that the version persists
      // and the contract remains functional
      const claimTopic = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const claimData = ethers.toUtf8Bytes("test data");
      const claimUri = "https://example.com";

      // Add a claim to show the contract is still functional
      await identityAsManager.addClaim(
        claimTopic,
        1, // ECDSA scheme
        aliceIdentity.target, // self-issued
        "0x", // empty signature for self-issued
        claimData,
        claimUri,
      );

      // Verify the claim was added
      const claimId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [aliceIdentity.target, claimTopic],
        ),
      );

      const claim = await aliceIdentity.getClaim(claimId);
      expect(claim.topic).to.equal(claimTopic);
      expect(claim.data).to.equal(ethers.hexlify(claimData));
      expect(claim.uri).to.equal(claimUri);
    });
  });
});
