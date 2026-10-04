import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { network } from "hardhat";
import { getAddress, parseEventLogs, sha256, toHex } from "viem";

import { OffchainError, offchainStore } from "./offchain-store.js";

//initializes hardhat network env and Viem instance
const { viem } = await network.create();

//retrieves public client for reading chain state and wallet clients for deployer/owner/requestor
const publicClient = await viem.getPublicClient();
const [, ownerClient, requesterClient] = await viem.getWalletClients();
const owner = ownerClient.account.address;
const requester = requesterClient.account.address;
const device = getAddress("0x0000000000000000000000000000000000009abc");

//create temp dir and instantiate off-chain JSON store for testing
const storeDir = await mkdtemp(path.join(tmpdir(), "offchain-store-"));
const store = offchainStore(path.join(storeDir, "store.json"));

//deploy all smart contracts required
console.log("Deploying ID_registery, Device_manager, Consent_manager, Data_sharing");
const registry = await viem.deployContract("ID_registery");
const deviceManager = await viem.deployContract("Device_manager");
const consentManager = await viem.deployContract("Consent_manager");
const dataSharing = await viem.deployContract("Data_sharing", [
  registry.address,
  deviceManager.address,
  consentManager.address,
]);

//register user (Alice) and device (thermostat)
console.log("Registering owner", owner, "and device", device);
await registry.write.register_user(["Alice", 1n, "alice@example.com"], {
  account: ownerClient.account,
});
await deviceManager.write.registerDevice(
  [device, "Thermostat", 1n, "thermostat", "Living Room"],
  { account: ownerClient.account },
);

//store private data off-chain and receive its dataHash
const dataHash = await store.storeData(owner, device, {
  temperature: 21.5,
  unit: "C",
});
console.log("Stored a reading off-chain, dataHash:", dataHash);

// The requester asks the chain for access, then takes the chain's decision to
// the off-chain store.
async function requestAndRead(step: string) {
  //call requestAccess on-chain as requester
  const hash = await dataSharing.write.requestAccess([owner, device], {
    account: requesterClient.account,
  });
  //wait for transaction receipt and parse emitted AccessAttempt event
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [attempt] = parseEventLogs({
    abi: dataSharing.abi,
    eventName: "AccessAttempt",
    logs: receipt.logs,
  });
  console.log(`\n${step}`);
  console.log("  requestAccess granted:", attempt.args.granted);

  try {
    //pass on-chain access decision (t/f) to off-chain store
    const data = await store.readData(
      owner,
      device,
      requester,
      attempt.args.granted,
    );
    console.log("  off-chain payload:", data.payload);
    console.log("  hash matches:", sha256(toHex(data.document)) === data.dataHash);
  } catch (error) {
    //if access denied or store refused
    if (!(error instanceof OffchainError)) throw error;
    console.log(`  off-chain store refused: ${error.kind}`);
  }
}

await requestAndRead("1. Requester asks before consent is granted");

//owner grants 30 days of consent to requestor
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

//owner revokes consent from the requester
await consentManager.write.revoke([requester], { account: ownerClient.account });
await requestAndRead("3. Owner revokes consent, requester asks again");

//print immutable audit log history recorded on-chain for device
console.log("\nAccess log for the device:");
for (const entry of await dataSharing.read.getLogs([device])) {
  console.log(
    `  ${entry.requester} granted=${entry.granted} at ${entry.timestamp}`,
  );
}

//clean up and delete temp off-chain store dir
await rm(storeDir, { recursive: true, force: true });
