import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ClaimIssuerFactory } from "../../typechain-types";

describe.only('ClaimIssuerFactory', () => {
    let claimIssuerFactory: ClaimIssuerFactory;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;

    beforeEach(async () => {
        [deployer, alice] = await ethers.getSigners();

        const ClaimIssuerFactoryContract = await ethers.getContractFactory('ClaimIssuerFactory');
        claimIssuerFactory = await ClaimIssuerFactoryContract.deploy();
    });

    it('should deploy a new ClaimIssuer contract', async () => {
        const tx = await claimIssuerFactory.connect(deployer).deployClaimIssuer();
        await tx.wait();
        
        const claimIssuer = await claimIssuerFactory.deployedClaimIssuers(deployer.address);
        await expect(tx).to.emit(claimIssuerFactory, 'ClaimIssuerDeployed').withArgs(deployer.address, claimIssuer);
    });

    it ('should revert if already deployed with the same management key', async () => {
        await claimIssuerFactory.connect(deployer).deployClaimIssuer();

        await expect(claimIssuerFactory.connect(deployer).deployClaimIssuer()).to.be.revertedWithCustomError(claimIssuerFactory, 'ClaimIssuerAlreadyDeployed');
    });

    it ('should revert if deployed with zero address as management key', async () => {
        await expect(claimIssuerFactory.connect(deployer).deployClaimIssuerOnBehalf(ethers.ZeroAddress)).to.be.revertedWithCustomError(claimIssuerFactory, 'ZeroAddress');
    });

    it ('should revert if blacklistAddress is not called by the owner', async () => {
        await expect(claimIssuerFactory.connect(alice).blacklistAddress(deployer.address, true)).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it ('should revert if blacklistAddress is called with zero address', async () => {
        await expect(claimIssuerFactory.connect(deployer).blacklistAddress(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(claimIssuerFactory, 'ZeroAddress');
    });
    
    it ('should emit an event when an address is blacklisted', async () => {
        const tx = await claimIssuerFactory.connect(deployer).blacklistAddress(alice.address, true);
        await expect(tx).to.emit(claimIssuerFactory, 'Blacklisted').withArgs(alice.address, true);

        expect(await claimIssuerFactory.blacklistedAddresses(alice.address)).to.equal(true);
    });

    it ('should emit an event when an address is unblacklisted', async () => {
        await claimIssuerFactory.connect(deployer).blacklistAddress(alice.address, true);

        const tx = await claimIssuerFactory.connect(deployer).blacklistAddress(alice.address, false);
        await expect(tx).to.emit(claimIssuerFactory, 'Blacklisted').withArgs(alice.address, false);
        expect(await claimIssuerFactory.blacklistedAddresses(alice.address)).to.equal(false);
    });

    it('should revert if deploy from a blacklisted address', async () => {
        await claimIssuerFactory.connect(deployer).blacklistAddress(alice.address, true);

        await expect(claimIssuerFactory.connect(alice).deployClaimIssuer()).to.be.revertedWithCustomError(claimIssuerFactory, 'Blacklisted');
    });
    
    it ('should revert if deployClaimIssuerOnBehalf is called by a non-owner', async () => {
        await expect(claimIssuerFactory.connect(alice).deployClaimIssuerOnBehalf(alice.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });

});
