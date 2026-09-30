import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { network } from "hardhat";
import { getAddress, parseEventLogs, sha256, toHex } from "viem";

import { OffchainError, offchainStore } from "./offchain-store.js";

const { viem } = await network.create();

const publicClient = await viem.getPublicClient();
const [, ownerClient, requesterClient] = await viem.getWalletClients();
const owner = ownerClient.account.address;
const requester = requesterClient.account.address;
const device = getAddress("0x0000000000000000000000000000000000009abc");

const storeDir = await mkdtemp(path.join(tmpdir(), "offchain-store-"));
const store = offchainStore(path.join(storeDir, "store.json"));

console.log("Deploying ID_registery, Device_manager, Consent_manager, Data_sharing");
const registry = await viem.deployContract("ID_registery");
const deviceManager = await viem.deployContract("Device_manager");
const consentManager = await viem.deployContract("Consent_manager");
const dataSharing = await viem.deployContract("Data_sharing", [
  registry.address,
  deviceManager.address,
  consentManager.address,
]);

console.log("Registering owner", owner, "and device", device);
await registry.write.register_user(["Alice", 1n, "alice@example.com"], {
  account: ownerClient.account,
});
await deviceManager.write.registerDevice(
  [device, "Thermostat", 1n, "thermostat", "Living Room"],
  { account: ownerClient.account },
);

const dataHash = await store.storeData(owner, device, {
  temperature: 21.5,
  unit: "C",
});
console.log("Stored a reading off-chain, dataHash:", dataHash);

// The requester asks the chain for access, then takes the chain's decision to
// the off-chain store.
async function requestAndRead(step: string) {
  const hash = await dataSharing.write.requestAccess([owner, device], {
    account: requesterClient.account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [attempt] = parseEventLogs({
    abi: dataSharing.abi,
    eventName: "AccessAttempt",
    logs: receipt.logs,
  });
  console.log(`\n${step}`);
  console.log("  requestAccess granted:", attempt.args.granted);

  try {
    const data = await store.readData(
      owner,
      device,
      requester,
      attempt.args.granted,
    );
    console.log("  off-chain payload:", data.payload);
    console.log("  hash matches:", sha256(toHex(data.document)) === data.dataHash);
  } catch (error) {
    if (!(error instanceof OffchainError)) throw error;
    console.log(`  off-chain store refused: ${error.kind}`);
  }
}

await requestAndRead("1. Requester asks before consent is granted");

await consentManager.write.grant([requester, 30n], {
  account: ownerClient.account,
});
await requestAndRead("2. Owner grants consent for 30 days, requester asks again");
console.log(
  "  readData:",
  await dataSharing.read.readData([owner, device], {
    account: requesterClient.account,
  }),
);

await consentManager.write.revoke([requester], { account: ownerClient.account });
await requestAndRead("3. Owner revokes consent, requester asks again");

console.log("\nAccess log for the device:");
for (const entry of await dataSharing.read.getLogs([device])) {
  console.log(
    `  ${entry.requester} granted=${entry.granted} at ${entry.timestamp}`,
  );
}

await rm(storeDir, { recursive: true, force: true });
