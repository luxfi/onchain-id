import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployIdentityFixture, KeyPurposes, KeyTypes } from "../fixtures";

describe("Identity", () => {
  describe("Getters", () => {
    describe("getCurrentNonce", () => {
      it("should return 0 for a new identity", async () => {
        const { aliceIdentity } = await loadFixture(deployIdentityFixture);
        const nonce = await aliceIdentity.getCurrentNonce();
        expect(nonce).to.equal(0);
      });

      it("should increment after each execution", async () => {
        const { aliceIdentity, aliceWallet, carolWallet } = await loadFixture(
          deployIdentityFixture
        );

        // First execution
        await aliceIdentity
          .connect(aliceWallet)
          .execute(carolWallet.address, 10, "0x", { value: 10 });
        let nonce = await aliceIdentity.getCurrentNonce();
        expect(nonce).to.equal(1);

        // Second execution
        await aliceIdentity
          .connect(aliceWallet)
          .execute(carolWallet.address, 5, "0x", { value: 5 });
        nonce = await aliceIdentity.getCurrentNonce();
        expect(nonce).to.equal(2);
      });
    });

    describe("getExecutionData", () => {
      it("should return correct execution data for a valid execution ID", async () => {
        const { aliceIdentity, aliceWallet, carolWallet } = await loadFixture(
          deployIdentityFixture
        );

        const action = {
          to: carolWallet.address,
          value: 10n,
          data: "0x123456",
        };

        const tx = await aliceIdentity
          .connect(aliceWallet)
          .execute(action.to, action.value, action.data, {
            value: action.value,
          });

        // Get the execution ID from the transaction receipt
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
        const executionRequestedEvent = receipt!.logs.find((log) => {
          try {
            const parsed = aliceIdentity.interface.parseLog(log);
            return parsed?.name === "ExecutionRequested";
          } catch {
            return false;
          }
        });

        expect(executionRequestedEvent).to.not.be.undefined;
        const parsedEvent = aliceIdentity.interface.parseLog(
          executionRequestedEvent!
        );
        expect(parsedEvent).to.not.be.null;
        const executionId = parsedEvent!.args[0];

        const executionData = await aliceIdentity.getExecutionData(executionId);

        expect(executionData.to).to.equal(action.to);
        expect(executionData.value).to.equal(action.value);
        expect(executionData.data).to.equal(action.data);
        expect(executionData.approved).to.be.true;
        expect(executionData.executed).to.be.true;
      });

      it("should return correct execution data for a pending execution", async () => {
        const { aliceIdentity, bobWallet, carolWallet } = await loadFixture(
          deployIdentityFixture
        );

        const action = {
          to: carolWallet.address,
          value: 10n,
          data: "0x123456",
        };

        const tx = await aliceIdentity
          .connect(bobWallet)
          .execute(action.to, action.value, action.data, {
            value: action.value,
          });

        // Get the execution ID from the transaction receipt
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
        const executionRequestedEvent = receipt!.logs.find((log) => {
          try {
            const parsed = aliceIdentity.interface.parseLog(log);
            return parsed?.name === "ExecutionRequested";
          } catch {
            return false;
          }
        });

        expect(executionRequestedEvent).to.not.be.undefined;
        const parsedEvent = aliceIdentity.interface.parseLog(
          executionRequestedEvent!
        );
        expect(parsedEvent).to.not.be.null;
        const executionId = parsedEvent!.args[0];

        const executionData = await aliceIdentity.getExecutionData(executionId);

        expect(executionData.to).to.equal(action.to);
        expect(executionData.value).to.equal(action.value);
        expect(executionData.data).to.equal(action.data);
        expect(executionData.approved).to.be.false;
        expect(executionData.executed).to.be.false;
      });

      it("should return default values for non-existent execution ID", async () => {
        const { aliceIdentity } = await loadFixture(deployIdentityFixture);

        const executionData = await aliceIdentity.getExecutionData(999);

        expect(executionData.to).to.equal(ethers.ZeroAddress);
        expect(executionData.value).to.equal(0);
        expect(executionData.data).to.equal("0x");
        expect(executionData.approved).to.be.false;
        expect(executionData.executed).to.be.false;
      });
    });
  });

  describe("Execute", () => {
    describe("when calling with nested executes", () => {
      it("should execute immediately the action if ClaimIssuer is management key", async () => {
        const { aliceIdentity, aliceWallet, claimIssuer, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);
        // generate claim
        let claim = {
          identity: await aliceIdentity.getAddress(),
          issuer: await claimIssuer.getAddress(),
          topic: 42,
          scheme: 1,
          data: "0x0042",
          signature: "",
          uri: "https://example.com",
        };
        claim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "bytes"],
                [claim.identity, claim.topic, claim.data]
              )
            )
          )
        );
        // add ClaimIssuer as a management key
        const claimIssuerHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address"],
            [await claimIssuer.getAddress()]
          )
        );
        await expect(
          aliceIdentity.connect(aliceWallet).addKey(claimIssuerHash, 1, 1)
        ).to.be.fulfilled;
        // prepare execution bytes
        const actionOnAlice = {
          to: await aliceIdentity.getAddress(),
          value: 0,
          data: aliceIdentity.interface.encodeFunctionData("addClaim", [
            claim.topic,
            claim.scheme,
            claim.issuer,
            claim.signature,
            claim.data,
            claim.uri,
          ]),
        };

        const actionOnClaimIssuer = {
          to: await aliceIdentity.getAddress(),
          value: 0,
          data: aliceIdentity.interface.encodeFunctionData("execute", [
            actionOnAlice.to,
            actionOnAlice.value,
            actionOnAlice.data,
          ]),
        };

        // execute the call on ClaimIssuer
        const tx = await claimIssuer
          .connect(claimIssuerWallet)
          .execute(
            actionOnClaimIssuer.to,
            actionOnClaimIssuer.value,
            actionOnClaimIssuer.data
          );

        // Events from ClaimIssuer contract (outer execution)
        await expect(tx)
          .to.emit(claimIssuer, "ExecutionRequested")
          .withArgs(
            0,
            actionOnClaimIssuer.to,
            actionOnClaimIssuer.value,
            actionOnClaimIssuer.data
          );
        await expect(tx).to.emit(claimIssuer, "Approved").withArgs(0, true);
        await expect(tx)
          .to.emit(claimIssuer, "Executed")
          .withArgs(
            0,
            actionOnClaimIssuer.to,
            actionOnClaimIssuer.value,
            actionOnClaimIssuer.data
          );

        // Events from Alice's identity (inner execution)
        await expect(tx)
          .to.emit(aliceIdentity, "ExecutionRequested")
          .withArgs(
            0,
            actionOnAlice.to,
            actionOnAlice.value,
            actionOnAlice.data
          );
        await expect(tx).to.emit(aliceIdentity, "Approved").withArgs(0, true);
        await expect(tx)
          .to.emit(aliceIdentity, "Executed")
          .withArgs(
            0,
            actionOnAlice.to,
            actionOnAlice.value,
            actionOnAlice.data
          );

        // Claim added event
        const claimId = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [claim.issuer, claim.topic]
          )
        );
        await expect(tx)
          .to.emit(aliceIdentity, "ClaimAdded")
          .withArgs(
            claimId,
            claim.topic,
            claim.scheme,
            claim.issuer,
            claim.signature,
            claim.data,
            claim.uri
          );
      });
      it("should create a pending execution if ClaimIssuer is not management key", async () => {
        const { aliceIdentity, aliceWallet, claimIssuer, claimIssuerWallet } =
          await loadFixture(deployIdentityFixture);
        // generate claim
        let claim = {
          identity: await aliceIdentity.getAddress(),
          issuer: await claimIssuer.getAddress(),
          topic: 42,
          scheme: 1,
          data: "0x0042",
          signature: "",
          uri: "https://example.com",
        };
        claim.signature = await claimIssuerWallet.signMessage(
          ethers.getBytes(
            ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "bytes"],
                [claim.identity, claim.topic, claim.data]
              )
            )
          )
        );
        // prepare execution bytes
        const actionOnAlice = {
          to: await aliceIdentity.getAddress(),
          value: 0,
          data: aliceIdentity.interface.encodeFunctionData("addClaim", [
            claim.topic,
            claim.scheme,
            claim.issuer,
            claim.signature,
            claim.data,
            claim.uri,
          ]),
        };

        const actionOnClaimIssuer = {
          to: await aliceIdentity.getAddress(),
          value: 0,
          data: aliceIdentity.interface.encodeFunctionData("execute", [
            actionOnAlice.to,
            actionOnAlice.value,
            actionOnAlice.data,
          ]),
        };

        // execute the call on ClaimIssuer
        const tx = await claimIssuer
          .connect(claimIssuerWallet)
          .execute(
            actionOnClaimIssuer.to,
            actionOnClaimIssuer.value,
            actionOnClaimIssuer.data
          );

        // Events from ClaimIssuer contract (outer execution)
        await expect(tx)
          .to.emit(claimIssuer, "ExecutionRequested")
          .withArgs(
            0,
            actionOnClaimIssuer.to,
            actionOnClaimIssuer.value,
            actionOnClaimIssuer.data
          );
        await expect(tx).to.emit(claimIssuer, "Approved").withArgs(0, true);
        await expect(tx)
          .to.emit(claimIssuer, "Executed")
          .withArgs(
            0,
            actionOnClaimIssuer.to,
            actionOnClaimIssuer.value,
            actionOnClaimIssuer.data
          );

        // Events from Alice's identity (inner execution)
        await expect(tx)
          .to.emit(aliceIdentity, "ExecutionRequested")
          .withArgs(
            0,
            actionOnAlice.to,
            actionOnAlice.value,
            actionOnAlice.data
          );
        const tx2 = await aliceIdentity.connect(aliceWallet).approve(0, true);
        await expect(tx2).to.emit(aliceIdentity, "Approved").withArgs(0, true);
        await expect(tx2)
          .to.emit(aliceIdentity, "Executed")
          .withArgs(
            0,
            actionOnAlice.to,
            actionOnAlice.value,
            actionOnAlice.data
          );

        // Claim added event
        const claimId = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [claim.issuer, claim.topic]
          )
        );
        await expect(tx2)
          .to.emit(aliceIdentity, "ClaimAdded")
          .withArgs(
            claimId,
            claim.topic,
            claim.scheme,
            claim.issuer,
            claim.signature,
            claim.data,
            claim.uri
          );
      });
    });
    describe("when calling execute as a MANAGEMENT key", () => {
      describe("when execution is possible (transferring value with enough funds on the identity)", () => {
        it("should execute immediately the action", async () => {
          const { aliceIdentity, aliceWallet, carolWallet } = await loadFixture(
            deployIdentityFixture
          );

          const previousBalance = await ethers.provider.getBalance(
            carolWallet.address
          );
          const action = {
            to: carolWallet.address,
            value: 10n,
            data: "0x",
          };

          const tx = await aliceIdentity
            .connect(aliceWallet)
            .execute(action.to, action.value, action.data, {
              value: action.value,
            });
          await expect(tx).to.emit(aliceIdentity, "Approved");
          await expect(tx).to.emit(aliceIdentity, "Executed");
          const newBalance = await ethers.provider.getBalance(
            carolWallet.address
          );

          expect(newBalance).to.equal(previousBalance + action.value);
        });
      });

      describe("when execution is possible (successfull call)", () => {
        it("should emit Executed", async () => {
          const { aliceIdentity, aliceWallet } = await loadFixture(
            deployIdentityFixture
          );

          const aliceKeyHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address"],
              [aliceWallet.address]
            )
          );

          const action = {
            to: await aliceIdentity.getAddress(),
            value: 0,
            data: aliceIdentity.interface.encodeFunctionData("addKey", [
              aliceKeyHash,
              KeyPurposes.CLAIM_SIGNER,
              KeyTypes.ECDSA,
            ]),
          };

          const tx = await aliceIdentity
            .connect(aliceWallet)
            .execute(action.to, action.value, action.data);
          await expect(tx).to.emit(aliceIdentity, "Approved");
          await expect(tx).to.emit(aliceIdentity, "Executed");

          const purposes = await aliceIdentity.getKeyPurposes(aliceKeyHash);
          expect(purposes).to.deep.equal([
            KeyPurposes.MANAGEMENT,
            KeyPurposes.CLAIM_SIGNER,
          ]);
        });
      });

      describe("when execution is not possible (failing call)", () => {
        it("should emit an ExecutionFailed event", async () => {
          const { aliceIdentity, aliceWallet, carolWallet } = await loadFixture(
            deployIdentityFixture
          );

          const previousBalance = await ethers.provider.getBalance(
            carolWallet.address
          );
          const action = {
            to: await aliceIdentity.getAddress(),
            value: 0n,
            data: aliceIdentity.interface.encodeFunctionData("addKey", [
              ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ["address"],
                  [aliceWallet.address]
                )
              ),
              KeyPurposes.MANAGEMENT,
              KeyTypes.ECDSA,
            ]),
          };

          const tx = await aliceIdentity
            .connect(aliceWallet)
            .execute(action.to, action.value, action.data);
          await expect(tx).to.emit(aliceIdentity, "Approved");
          await expect(tx).to.emit(aliceIdentity, "ExecutionFailed");
          const newBalance = await ethers.provider.getBalance(
            carolWallet.address
          );

          expect(newBalance).to.equal(previousBalance + action.value);
        });
      });
    });

    describe("when calling execute as an ACTION key", () => {
      describe("when target is the identity contract", () => {
        it("should create an execution request", async () => {
          const { aliceIdentity, aliceWallet, bobWallet, carolWallet } =
            await loadFixture(deployIdentityFixture);

          const aliceKeyHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address"],
              [aliceWallet.address]
            )
          );
          const carolKeyHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address"],
              [carolWallet.address]
            )
          );
          await aliceIdentity.connect(aliceWallet).addKey(carolKeyHash, 2, 1);

          const action = {
            to: await aliceIdentity.getAddress(),
            value: 0n,
            data: aliceIdentity.interface.encodeFunctionData("addKey", [
              aliceKeyHash,
              KeyPurposes.ACTION,
              KeyTypes.ECDSA,
            ]),
          };

          const tx = await aliceIdentity
            .connect(carolWallet)
            .execute(action.to, action.value, action.data, {
              value: action.value,
            });
          await expect(tx).to.emit(aliceIdentity, "ExecutionRequested");
        });
      });

      describe("when target is another address", () => {
        it("should emit ExecutionFailed for a failed execution", async () => {
          const {
            aliceIdentity,
            aliceWallet,
            carolWallet,
            davidWallet,
            bobIdentity,
          } = await loadFixture(deployIdentityFixture);

          const carolKeyHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address"],
              [carolWallet.address]
            )
          );
          await aliceIdentity
            .connect(aliceWallet)
            .addKey(carolKeyHash, KeyPurposes.ACTION, KeyTypes.ECDSA);

          const aliceKeyHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address"],
              [aliceWallet.address]
            )
          );

          const action = {
            to: await bobIdentity.getAddress(),
            value: 10n,
            data: aliceIdentity.interface.encodeFunctionData("addKey", [
              aliceKeyHash,
              KeyPurposes.CLAIM_SIGNER,
              KeyTypes.ECDSA,
            ]),
          };

          const previousBalance = await ethers.provider.getBalance(
            await bobIdentity.getAddress()
          );

          const tx = await aliceIdentity
            .connect(carolWallet)
            .execute(action.to, action.value, action.data, {
              value: action.value,
            });
          await expect(tx).to.emit(aliceIdentity, "Approved");
          await expect(tx).to.emit(aliceIdentity, "ExecutionFailed");
          const newBalance = await ethers.provider.getBalance(
            await bobIdentity.getAddress()
          );

          expect(newBalance).to.equal(previousBalance);
        });

        it("should execute immediately the action", async () => {
          const { aliceIdentity, aliceWallet, carolWallet, davidWallet } =
            await loadFixture(deployIdentityFixture);

          const carolKeyHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address"],
              [carolWallet.address]
            )
          );
          await aliceIdentity
            .connect(aliceWallet)
            .addKey(carolKeyHash, KeyPurposes.ACTION, KeyTypes.ECDSA);

          const previousBalance = await ethers.provider.getBalance(
            davidWallet.address
          );
          const action = {
            to: davidWallet.address,
            value: 10n,
            data: "0x",
          };

          const tx = await aliceIdentity
            .connect(carolWallet)
            .execute(action.to, action.value, action.data, {
              value: action.value,
            });
          await expect(tx).to.emit(aliceIdentity, "Approved");
          await expect(tx).to.emit(aliceIdentity, "Executed");
          const newBalance = await ethers.provider.getBalance(
            davidWallet.address
          );

          expect(newBalance).to.equal(previousBalance + action.value);
        });
      });
    });

    describe("when calling execute as a non-action key", () => {
      it("should create a pending execution request", async () => {
        const { aliceIdentity, bobWallet, carolWallet } = await loadFixture(
          deployIdentityFixture
        );

        const previousBalance = await ethers.provider.getBalance(
          carolWallet.address
        );
        const action = {
          to: carolWallet.address,
          value: 10n,
          data: "0x",
        };

        const tx = await aliceIdentity
          .connect(bobWallet)
          .execute(action.to, action.value, action.data, {
            value: action.value,
          });
        await expect(tx).to.emit(aliceIdentity, "ExecutionRequested");
        const newBalance = await ethers.provider.getBalance(
          carolWallet.address
        );

        expect(newBalance).to.equal(previousBalance);
      });
    });
  });

  describe("Approve", () => {
    describe("when calling a non-existing execution request", () => {
      it("should revert for execution request not found", async () => {
        const { aliceIdentity, aliceWallet } = await loadFixture(
          deployIdentityFixture
        );

        await expect(
          aliceIdentity.connect(aliceWallet).approve(2, true)
        ).to.be.revertedWithCustomError(aliceIdentity, "InvalidRequestId");
      });
    });

    describe("when calling an already executed request", () => {
      it("should revert for execution request already executed", async () => {
        const { aliceIdentity, aliceWallet, bobWallet } = await loadFixture(
          deployIdentityFixture
        );

        await aliceIdentity
          .connect(aliceWallet)
          .execute(bobWallet.address, 10, "0x", { value: 10 });

        await expect(
          aliceIdentity.connect(aliceWallet).approve(0, true)
        ).to.be.revertedWithCustomError(
          aliceIdentity,
          "RequestAlreadyExecuted"
        );
      });
    });

    describe("when calling approve for an execution targeting another address as a non-action key", () => {
      it("should revert for not authorized", async () => {
        const { aliceIdentity, bobWallet, carolWallet } = await loadFixture(
          deployIdentityFixture
        );

        await aliceIdentity
          .connect(bobWallet)
          .execute(carolWallet.address, 10, "0x", { value: 10 });

        await expect(
          aliceIdentity.connect(bobWallet).approve(0, true)
        ).to.be.revertedWithCustomError(
          aliceIdentity,
          "SenderDoesNotHaveActionKey"
        );
      });
    });

    describe("when calling approve for an execution targeting another address as a non-management key", () => {
      it("should revert for not authorized", async () => {
        const { aliceIdentity, davidWallet, bobWallet } = await loadFixture(
          deployIdentityFixture
        );

        await aliceIdentity
          .connect(bobWallet)
          .execute(await aliceIdentity.getAddress(), 10n, "0x", { value: 10n });

        await expect(
          aliceIdentity.connect(davidWallet).approve(0, true)
        ).to.be.revertedWithCustomError(
          aliceIdentity,
          "SenderDoesNotHaveManagementKey"
        );
      });
    });

    describe("when calling approve as a MANAGEMENT key", () => {
      it("should approve the execution request", async () => {
        const { aliceIdentity, aliceWallet, bobWallet, carolWallet } =
          await loadFixture(deployIdentityFixture);

        const previousBalance = await ethers.provider.getBalance(
          carolWallet.address
        );
        await aliceIdentity
          .connect(bobWallet)
          .execute(carolWallet.address, 10n, "0x", { value: 10n });

        const tx = await aliceIdentity.connect(aliceWallet).approve(0, true);
        await expect(tx).to.emit(aliceIdentity, "Approved");
        await expect(tx).to.emit(aliceIdentity, "Executed");
        const newBalance = await ethers.provider.getBalance(
          carolWallet.address
        );

        expect(newBalance).to.equal(previousBalance + 10n);
      });

      it("should leave approve to false", async () => {
        const { aliceIdentity, aliceWallet, bobWallet, carolWallet } =
          await loadFixture(deployIdentityFixture);

        const previousBalance = await ethers.provider.getBalance(
          carolWallet.address
        );
        await aliceIdentity
          .connect(bobWallet)
          .execute(carolWallet.address, 10, "0x", { value: 10 });

        const tx = await aliceIdentity.connect(aliceWallet).approve(0, false);
        await expect(tx).to.emit(aliceIdentity, "Approved");
        const newBalance = await ethers.provider.getBalance(
          carolWallet.address
        );

        expect(newBalance).to.equal(previousBalance);
      });
    });
  });
});
