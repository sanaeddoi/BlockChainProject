import { network } from "hardhat";

//initialize hardhat network configured for Optimism
const { viem } = await network.create({
  network: "hardhatOp",
  chainType: "op",
});

console.log("Sending transaction using the OP chain type");

//get public client for reading block/chain data and primary wallet client as sender
const publicClient = await viem.getPublicClient();
const [senderClient] = await viem.getWalletClients();

console.log("Sending 1 wei from", senderClient.account.address, "to itself");

//estimate L1 data fee
const l1Gas = await publicClient.estimateL1Gas({
  account: senderClient.account.address,
  to: senderClient.account.address,
  value: 1n,
});

console.log("Estimated L1 gas:", l1Gas);

console.log("Sending L2 transaction");
const tx = await senderClient.sendTransaction({
  to: senderClient.account.address,
  value: 1n,
});

await publicClient.waitForTransactionReceipt({ hash: tx });

console.log("Transaction sent successfully");
