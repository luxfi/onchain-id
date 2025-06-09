import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployIdentityFixture } from "../fixtures";

describe('ClaimIssuer - Reference (with revoke)', () => {
  describe('revokeClaim (deprecated)', () => {
    describe('when calling as a non MANAGEMENT key', () => {
      it('should revert for missing permissions', async () => {
        const { claimIssuer, aliceWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);

        await expect(claimIssuer.connect(aliceWallet).revokeClaim(aliceClaim666.id, aliceClaim666.identity)).to.be.revertedWithCustomError(claimIssuer, 'SenderDoesNotHaveManagementKey');
      });
    });

    describe("when calling as a MANAGEMENT key", () => {
      describe('when claim was already revoked', () => {
        it('should revert for conflict', async () => {
          const { claimIssuer, claimIssuerWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);

          await claimIssuer.connect(claimIssuerWallet).revokeClaim(aliceClaim666.id, aliceClaim666.identity);

          await expect(claimIssuer.connect(claimIssuerWallet).revokeClaim(aliceClaim666.id, aliceClaim666.identity)).to.be.revertedWithCustomError(claimIssuer, 'ClaimAlreadyRevoked');
        });
      });

      describe('when is not revoked already', () => {
        it('should revoke the claim', async () => {
          const { claimIssuer, claimIssuerWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);

          expect(await claimIssuer.isClaimValid(aliceClaim666.identity, aliceClaim666.topic, aliceClaim666.signature, aliceClaim666.data)).to.be.true;

          const tx = await claimIssuer.connect(claimIssuerWallet).revokeClaim(aliceClaim666.id, aliceClaim666.identity);

          await expect(tx).to.emit(claimIssuer, 'ClaimRevoked').withArgs(aliceClaim666.signature);

          expect(await claimIssuer.isClaimRevoked(aliceClaim666.signature)).to.be.true;
          expect(await claimIssuer.isClaimValid(aliceClaim666.identity, aliceClaim666.topic, aliceClaim666.signature, aliceClaim666.data)).to.be.false;
        });
      });
    });
  });

  describe('revokeClaimBySignature', () => {
    describe('when calling as a non MANAGEMENT key', () => {
      it('should revert for missing permissions', async () => {
        const { claimIssuer, aliceWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);

        await expect(claimIssuer.connect(aliceWallet).revokeClaimBySignature(aliceClaim666.signature)).to.be.revertedWithCustomError(claimIssuer, 'SenderDoesNotHaveManagementKey');
      });
    });

    describe("when calling as a MANAGEMENT key", () => {
      describe('when claim was already revoked', () => {
        it('should revert for conflict', async () => {
          const { claimIssuer, claimIssuerWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);

          await claimIssuer.connect(claimIssuerWallet).revokeClaimBySignature(aliceClaim666.signature);

          await expect(claimIssuer.connect(claimIssuerWallet).revokeClaimBySignature(aliceClaim666.signature)).to.be.revertedWithCustomError(claimIssuer, 'ClaimAlreadyRevoked');
        });
      });

      describe('when is not revoked already', () => {
        it('should revoke the claim', async () => {
          const { claimIssuer, claimIssuerWallet, aliceClaim666 } = await loadFixture(deployIdentityFixture);

          expect(await claimIssuer.isClaimValid(aliceClaim666.identity, aliceClaim666.topic, aliceClaim666.signature, aliceClaim666.data)).to.be.true;

          const tx = await claimIssuer.connect(claimIssuerWallet).revokeClaimBySignature(aliceClaim666.signature);

          await expect(tx).to.emit(claimIssuer, 'ClaimRevoked').withArgs(aliceClaim666.signature);

          expect(await claimIssuer.isClaimRevoked(aliceClaim666.signature)).to.be.true;
          expect(await claimIssuer.isClaimValid(aliceClaim666.identity, aliceClaim666.topic, aliceClaim666.signature, aliceClaim666.data)).to.be.false;
        });
      });
    });
  });

  describe('getRecoveredAddress', () => {
    it('should return with a zero address with signature is not of proper length', async () => {
      const { claimIssuer, aliceClaim666 } = await loadFixture(deployIdentityFixture);

      expect(await claimIssuer.getRecoveredAddress(aliceClaim666.signature + "00", ethers.getBytes(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'bytes'], [aliceClaim666.identity, aliceClaim666.topic, aliceClaim666.data]))))).to.be.equal(ethers.ZeroAddress);
    });
  });

  describe('upgrade', () => {
    async function deployUpgradeFixture() {
      const { claimIssuer, claimIssuerWallet, aliceWallet } = await loadFixture(deployIdentityFixture);

      const ClaimIssuerFactory = await ethers.getContractFactory('ClaimIssuerFactory');
      const claimIssuerFactory = await ClaimIssuerFactory.deploy(claimIssuer.target);

      const tx = await claimIssuerFactory.connect(claimIssuerWallet).deployClaimIssuer();
      await tx.wait();
      const proxyAddress = await claimIssuerFactory.claimIssuer(claimIssuerWallet.address);
      const proxy = await ethers.getContractAt('ITransparentUpgradeableProxy', proxyAddress);

      return { claimIssuer, claimIssuerWallet, aliceWallet, proxy };
    }

    it('should revert if not owner', async () => {
      const { proxy, aliceWallet, claimIssuer } = await loadFixture(deployUpgradeFixture);

      await expect(proxy.connect(aliceWallet).upgradeToAndCall(claimIssuer.target, "0x")).to.be.reverted;
    });

    it('should upgrade the implementation', async () => {
      const { proxy, claimIssuerWallet } = await loadFixture(deployUpgradeFixture);

      const ClaimIssuer = await ethers.getContractFactory('ClaimIssuer');
      const newClaimIssuer = await ClaimIssuer.connect(claimIssuerWallet).deploy(claimIssuerWallet.address);

      await proxy.connect(claimIssuerWallet).upgradeToAndCall(newClaimIssuer.target, "0x");
      expect(await proxy.implementation()).to.be.equal(newClaimIssuer.target);
    });
  });
});
