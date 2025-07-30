import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployIdentityFixture, KeyPurposes, KeyTypes } from "../fixtures";

describe("Identity", () => {
  it("should revert when attempting to initialize an already deployed identity", async () => {
    const { aliceIdentity, aliceWallet } = await loadFixture(
      deployIdentityFixture,
    );

    await expect(
      aliceIdentity.connect(aliceWallet).initialize(aliceWallet.address),
    ).to.be.revertedWithCustomError(aliceIdentity, "InitialKeyAlreadySetup");
  });

  it("should revert because interaction with library is forbidden", async () => {
    const { identityImplementation, aliceWallet, deployerWallet } =
      await loadFixture(deployIdentityFixture);

    await expect(
      identityImplementation
        .connect(deployerWallet)
        .addKey(
          ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address"],
              [aliceWallet.address],
            ),
          ),
          KeyPurposes.CLAIM_SIGNER,
          KeyTypes.ECDSA,
        ),
    ).to.be.revertedWithCustomError(
      identityImplementation,
      "InteractingWithLibraryContractForbidden",
    );

    await expect(
      identityImplementation
        .connect(aliceWallet)
        .initialize(deployerWallet.address),
    ).to.be.revertedWithCustomError(
      identityImplementation,
      "InitialKeyAlreadySetup",
    );
  });

  it("should prevent creating an identity with an invalid initial key", async () => {
    const [identityOwnerWallet] = await ethers.getSigners();

    const Identity = await ethers.getContractFactory("Identity");
    await expect(
      Identity.connect(identityOwnerWallet).deploy(ethers.ZeroAddress, false),
    ).to.be.revertedWithCustomError(Identity, "ZeroAddress");
  });

  it("should return the version of the implementation", async () => {
    const { identityImplementation } = await loadFixture(deployIdentityFixture);
    expect(await identityImplementation.version()).to.equal("2.2.2");
  });

  it("should support ERC165 interface detection", async function () {
    const { aliceIdentity } = await loadFixture(deployIdentityFixture);

    // Test ERC165 interface (this is standard and should work)
    expect(await aliceIdentity.supportsInterface("0x01ffc9a7")).to.be.true;

    // Test that it doesn't support random interfaces
    expect(await aliceIdentity.supportsInterface("0x12345678")).to.be.false;
    expect(await aliceIdentity.supportsInterface("0x00000000")).to.be.false;
    expect(await aliceIdentity.supportsInterface("0xffffffff")).to.be.false;
  });
});
