import { network } from "hardhat";
import { performance } from "node:perf_hooks";

async function main() {
    const { viem } = await network.create();
    const publicClient = await viem.getPublicClient();
    const wallets = await viem.getWalletClients();

    const owner1 = wallets[1];
    const owner2 = wallets[2];
    const requester1 = wallets[3];
    const requester2 = wallets[4];

    const scalingReport: any[] = [];

    //helper runner
    async function measureScenario(name: string, actors: string, action: () => Promise<any>) {
        const start = performance.now();
        let totalGas = 0n;

        const txHash = await action();
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        totalGas += receipt.gasUsed;

        const end = performance.now();
        scalingReport.push({
            "Simulation Scenario": name,
            "Active Actors": actors,
            "Gas Used": totalGas.toString(),
            "Execution Time (ms)": (end - start).toFixed(2)
        });
    }

    //deploy core contracts first
    const registry = await viem.deployContract("ID_registery");
    const deviceManager = await viem.deployContract("Device_manager");
    const consentManager = await viem.deployContract("Consent_manager");
    const dataSharing = await viem.deployContract("Data_sharing", [registry.address, deviceManager.address, consentManager.address]);

    //single user flow scenario
    await measureScenario("Single User Flow", "1 Owner, 1 Requester", async () => {
        await registry.write.register_user(["Owner1", 1n, "o1@test.com"], { account: owner1.account });
        const deviceAddr = "0x1111111111111111111111111111111111111111";
        await deviceManager.write.registerDevice([deviceAddr, "Thermostat", 101n, "IoT", "Home"], { account: owner1.account });
        await consentManager.write.grant([requester1.account.address, 7n], { account: owner1.account });
        return await dataSharing.write.requestAccess([owner1.account.address, deviceAddr], { account: requester1.account });
    });

    //multi-device flow scenario
    await measureScenario("Multi-Device Flow", "2 Owners, 1 Requester", async () => {
        await registry.write.register_user(["Owner2", 2n, "o2@test.com"], { account: owner2.account });
        const deviceAddr2 = "0x2222222222222222222222222222222222222222";
        return await deviceManager.write.registerDevice([deviceAddr2, "Camera", 102n, "Security", "Hallway"], { account: owner2.account });
    });

    //concurrent consent scenario
    await measureScenario("Concurrent Consent", "3 Owners, 2 Requesters", async () => {
        return await consentManager.write.grant([requester2.account.address, 14n], { account: owner2.account });
    });

    console.log("\n--- MULTI-USER SCALING & COST EVALUATION TABLE ---");
    console.table(scalingReport);
}

main().catch(console.error);