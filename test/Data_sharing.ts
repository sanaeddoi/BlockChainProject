import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress, parseEventLogs, sha256, toHex } from "viem";

import { OffchainError, offchainStore } from "../scripts/offchain-store.js";

describe("Data_sharing", async function () {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [, ownerClient, requesterClient, strangerClient] =
    await viem.getWalletClients();

  const owner = getAddress(ownerClient.account.address);
  const requester = getAddress(requesterClient.account.address);
  const stranger = getAddress(strangerClient.account.address);
  const device = getAddress("0x0000000000000000000000000000000000009abc");
  const unknownDevice = getAddress("0x000000000000000000000000000000000000dead");

  // Deploys all four contracts, then registers the owner and one device.
  async function deployDataSharing() {
    const registry = await viem.deployContract("ID_registery");
    const deviceManager = await viem.deployContract("Device_manager");
    const consentManager = await viem.deployContract("Consent_manager");
    const dataSharing = await viem.deployContract("Data_sharing", [
      registry.address,
      deviceManager.address,
      consentManager.address,
    ]);

    await registry.write.register_user(["TestOwner", 1n, "owner@example.com"], {
      account: ownerClient.account,
    });
    await deviceManager.write.registerDevice(
      [device, "Thermostat", 1n, "thermostat", "Living Room"],
      { account: ownerClient.account },
    );

    return { registry, deviceManager, consentManager, dataSharing };
  }

  // Same as deployDataSharing, with the owner's consent granted to the requester.
  async function deployWithConsent() {
    const contracts = await deployDataSharing();
    await contracts.consentManager.write.grant([requester], {
      account: ownerClient.account,
    });
    return contracts;
  }

  describe("deployment", function () {
    it("Should point at the contracts it was deployed with", async function () {
      const { registry, deviceManager, consentManager, dataSharing } =
        await networkHelpers.loadFixture(deployDataSharing);

      assert.equal(
        await dataSharing.read.registry(),
        getAddress(registry.address),
      );
      assert.equal(
        await dataSharing.read.deviceManager(),
        getAddress(deviceManager.address),
      );
      assert.equal(
        await dataSharing.read.consentManager(),
        getAddress(consentManager.address),
      );
    });
  });

  describe("verifyConsent", function () {
    it("Should be false before consent is granted", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployDataSharing);

      assert.equal(await dataSharing.read.verifyConsent([owner, requester]), false);
    });

    it("Should follow grant and revoke in Consent_manager", async function () {
      const { consentManager, dataSharing } =
        await networkHelpers.loadFixture(deployWithConsent);

      assert.equal(await dataSharing.read.verifyConsent([owner, requester]), true);

      await consentManager.write.revoke([requester], {
        account: ownerClient.account,
      });

      assert.equal(await dataSharing.read.verifyConsent([owner, requester]), false);
    });

    it("Should only cover the delegate consent was granted to", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      assert.equal(await dataSharing.read.verifyConsent([owner, stranger]), false);
      assert.equal(await dataSharing.read.verifyConsent([requester, owner]), false);
    });
  });

  describe("requestAccess", function () {
    it("Should deny access when no consent exists", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployDataSharing);

      const { result } = await dataSharing.simulate.requestAccess(
        [owner, device],
        { account: requester },
      );
      assert.equal(result, false);

      await viem.assertions.emitWithArgs(
        dataSharing.write.requestAccess([owner, device], {
          account: requesterClient.account,
        }),
        dataSharing,
        "AccessAttempt",
        [requester, device, false],
      );
    });

    it("Should grant access when consent exists", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      const { result } = await dataSharing.simulate.requestAccess(
        [owner, device],
        { account: requester },
      );
      assert.equal(result, true);

      await viem.assertions.emitWithArgs(
        dataSharing.write.requestAccess([owner, device], {
          account: requesterClient.account,
        }),
        dataSharing,
        "AccessAttempt",
        [requester, device, true],
      );
    });

    it("Should deny access after consent is revoked", async function () {
      const { consentManager, dataSharing } =
        await networkHelpers.loadFixture(deployWithConsent);
      await consentManager.write.revoke([requester], {
        account: ownerClient.account,
      });

      await viem.assertions.emitWithArgs(
        dataSharing.write.requestAccess([owner, device], {
          account: requesterClient.account,
        }),
        dataSharing,
        "AccessAttempt",
        [requester, device, false],
      );
    });

    it("Should deny access to a requester the owner did not consent to", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      await viem.assertions.emitWithArgs(
        dataSharing.write.requestAccess([owner, device], {
          account: strangerClient.account,
        }),
        dataSharing,
        "AccessAttempt",
        [stranger, device, false],
      );
    });

    it("Should deny access to a device that is not registered", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      await viem.assertions.emitWithArgs(
        dataSharing.write.requestAccess([owner, unknownDevice], {
          account: requesterClient.account,
        }),
        dataSharing,
        "AccessAttempt",
        [requester, unknownDevice, false],
      );
    });

    it("Should deny access when the owner is not registered", async function () {
      const { deviceManager, consentManager, dataSharing } =
        await networkHelpers.loadFixture(deployDataSharing);

      // the stranger has a device and gives consent, but never registered an ID
      await deviceManager.write.registerDevice(
        [device, "Camera", 2n, "camera", "Porch"],
        { account: strangerClient.account },
      );
      await consentManager.write.grant([requester], {
        account: strangerClient.account,
      });

      await viem.assertions.emitWithArgs(
        dataSharing.write.requestAccess([stranger, device], {
          account: requesterClient.account,
        }),
        dataSharing,
        "AccessAttempt",
        [requester, device, false],
      );
    });
  });

  describe("readData", function () {
    it("Should return the device info when consent exists", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      assert.deepEqual(
        await dataSharing.read.readData([owner, device], {
          account: requesterClient.account,
        }),
        ["Thermostat", "thermostat", "Living Room"],
      );
    });

    it("Should revert without consent", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployDataSharing);

      await viem.assertions.revertWith(
        dataSharing.read.readData([owner, device], {
          account: requesterClient.account,
        }),
        "No consent for this owner",
      );
    });

    it("Should revert after consent is revoked", async function () {
      const { consentManager, dataSharing } =
        await networkHelpers.loadFixture(deployWithConsent);
      await consentManager.write.revoke([requester], {
        account: ownerClient.account,
      });

      await viem.assertions.revertWith(
        dataSharing.read.readData([owner, device], {
          account: requesterClient.account,
        }),
        "No consent for this owner",
      );
    });

    it("Should revert for the owner, who cannot hold consent from themselves", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      await viem.assertions.revertWith(
        dataSharing.read.readData([owner, device], {
          account: ownerClient.account,
        }),
        "No consent for this owner",
      );
    });

    it("Should revert when the owner is not registered", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      await viem.assertions.revertWith(
        dataSharing.read.readData([stranger, device], {
          account: requesterClient.account,
        }),
        "Owner is not registered",
      );
    });

    it("Should revert when the device is not active", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      await viem.assertions.revertWith(
        dataSharing.read.readData([owner, unknownDevice], {
          account: requesterClient.account,
        }),
        "Device is not active",
      );
    });
  });

  describe("getLogs", function () {
    it("Should be empty for a device with no access attempts", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployDataSharing);

      assert.deepEqual(await dataSharing.read.getLogs([device]), []);
    });

    it("Should log granted and denied attempts in order", async function () {
      const { consentManager, dataSharing } =
        await networkHelpers.loadFixture(deployDataSharing);

      await dataSharing.write.requestAccess([owner, device], {
        account: requesterClient.account,
      });
      const deniedAt = await networkHelpers.time.latest();

      await consentManager.write.grant([requester], {
        account: ownerClient.account,
      });
      await dataSharing.write.requestAccess([owner, device], {
        account: requesterClient.account,
      });
      const grantedAt = await networkHelpers.time.latest();

      await dataSharing.write.requestAccess([owner, device], {
        account: strangerClient.account,
      });
      const strangerAt = await networkHelpers.time.latest();

      assert.deepEqual(await dataSharing.read.getLogs([device]), [
        {
          requester,
          deviceAddr: device,
          granted: false,
          timestamp: BigInt(deniedAt),
        },
        {
          requester,
          deviceAddr: device,
          granted: true,
          timestamp: BigInt(grantedAt),
        },
        {
          requester: stranger,
          deviceAddr: device,
          granted: false,
          timestamp: BigInt(strangerAt),
        },
      ]);
    });

    it("Should keep logs separate per device", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      await dataSharing.write.requestAccess([owner, device], {
        account: requesterClient.account,
      });

      assert.equal((await dataSharing.read.getLogs([device])).length, 1);
      assert.equal((await dataSharing.read.getLogs([unknownDevice])).length, 0);
    });

    it("Should not log anything for readData", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);

      await dataSharing.read.readData([owner, device], {
        account: requesterClient.account,
      });

      assert.deepEqual(await dataSharing.read.getLogs([device]), []);
    });
  });

  describe("off-chain data", function () {
    const reading = { temperature: 21.5, unit: "C", recordedAt: 1759190400 };
    let storeDir: string;
    let store: ReturnType<typeof offchainStore>;

    before(async function () {
      storeDir = await mkdtemp(path.join(tmpdir(), "offchain-store-"));
      store = offchainStore(path.join(storeDir, "store.json"));
    });

    after(async function () {
      await rm(storeDir, { recursive: true, force: true });
    });

    // Sends requestAccess as `account` and returns the decision the chain logged.
    async function requestAccess(
      dataSharing: Awaited<ReturnType<typeof deployDataSharing>>["dataSharing"],
      account: typeof requesterClient.account,
    ) {
      const hash = await dataSharing.write.requestAccess([owner, device], {
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [attempt] = parseEventLogs({
        abi: dataSharing.abi,
        eventName: "AccessAttempt",
        logs: receipt.logs,
      });
      return attempt.args.granted;
    }

    it("Should release the stored data when the chain grants access", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployWithConsent);
      const dataHash = await store.storeData(owner, device, reading);

      const granted = await requestAccess(dataSharing, requesterClient.account);
      const data = await store.readData(owner, device, requester, granted);

      assert.deepEqual(data.payload, reading);
      assert.equal(data.dataHash, dataHash);
      // recompute the hash here, independently of the Python module
      assert.equal(sha256(toHex(data.document)), dataHash);
      assert.equal(await store.verify(dataHash), true);
    });

    it("Should refuse the stored data when the chain denies access", async function () {
      const { dataSharing } = await networkHelpers.loadFixture(deployDataSharing);
      await store.storeData(owner, device, reading);

      const granted = await requestAccess(dataSharing, requesterClient.account);

      await assert.rejects(
        store.readData(owner, device, requester, granted),
        (error: unknown) =>
          error instanceof OffchainError && error.kind === "AccessDenied",
      );
    });

    it("Should stop releasing data once consent is revoked", async function () {
      const { consentManager, dataSharing } =
        await networkHelpers.loadFixture(deployWithConsent);
      await store.storeData(owner, device, reading);

      await store.readData(
        owner,
        device,
        requester,
        await requestAccess(dataSharing, requesterClient.account),
      );

      await consentManager.write.revoke([requester], {
        account: ownerClient.account,
      });

      await assert.rejects(
        store.readData(
          owner,
          device,
          requester,
          await requestAccess(dataSharing, requesterClient.account),
        ),
        (error: unknown) =>
          error instanceof OffchainError && error.kind === "AccessDenied",
      );
    });
  });
});
