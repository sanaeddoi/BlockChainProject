import { network } from "hardhat";
import { performance } from "node:perf_hooks";

async function main() {
    const { viem } = await network.create();
    const publicClient = await viem.getPublicClient();
    const [deployer, owner, requester] = await viem.getWalletClients();

    const report: { Type: string; "Item being measured": string; "Gas used": string; "Execution Time (ms)": string }[] = [];

    //helper functions to measure deployment gas and time
    async function deployAndMeasure(contractName: string, args: any[] = []) {
        const startTime = performance.now();
        const contract = await viem.deployContract(contractName, args as any);
        const blockAfter = await publicClient.getBlockNumber();

        const block = await publicClient.getBlock({ blockNumber: blockAfter, includeTransactions: true });
        const tx = block.transactions[block.transactions.length - 1];

        const receipt = await publicClient.getTransactionReceipt({ hash: tx.hash });
        const endTime = performance.now();

        return {
            contract,
            gasUsed: receipt.gasUsed.toString(),
            execTime: (endTime - startTime).toFixed(2)
        };
    }
    async function executeAndMeasure(name: string, action: () => Promise<`0x${string}`>) {
        const startTime = performance.now();
        const txHash = await action();
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        const endTime = performance.now();

        report.push({
            Type: "Function",
            "Item being measured": name,
            "Gas used": receipt.gasUsed.toString(),
            "Execution Time (ms)": (endTime - startTime).toFixed(2)
        });
    }

    console.log("Running deployments and capturing gas & time metrics...");

    //deployments
    const regDeploy = await deployAndMeasure("ID_registery");
    report.push({ Type: "Deployment", "Item being measured": "ID_registery", "Gas used": regDeploy.gasUsed, "Execution Time (ms)": regDeploy.execTime });
    const registry = regDeploy.contract;

    const devDeploy = await deployAndMeasure("Device_manager");
    report.push({ Type: "Deployment", "Item being measured": "Device_manager", "Gas used": devDeploy.gasUsed, "Execution Time (ms)": devDeploy.execTime });
    const deviceManager = devDeploy.contract;

    const conDeploy = await deployAndMeasure("Consent_manager");
    report.push({ Type: "Deployment", "Item being measured": "Consent_manager", "Gas used": conDeploy.gasUsed, "Execution Time (ms)": conDeploy.execTime });
    const consentManager = conDeploy.contract;

    const dataDeploy = await deployAndMeasure("Data_sharing", [
        registry.address,
        deviceManager.address,
        consentManager.address,
    ]);
    report.push({ Type: "Deployment", "Item being measured": "Data_sharing", "Gas used": dataDeploy.gasUsed, "Execution Time (ms)": dataDeploy.execTime });
    const dataSharing = dataDeploy.contract;

    //function Executions
    await executeAndMeasure("register_user", () =>
        registry.write.register_user(["OwnerName", 1n, "owner@test.com"], { account: owner.account })
    );

    const deviceAddr = "0x1111111111111111111111111111111111111111";
    await executeAndMeasure("registerDevice", () =>
        deviceManager.write.registerDevice([deviceAddr, "Smart Thermostat", 101n, "Thermostat", "Living Room"], { account: owner.account })
    );

    await executeAndMeasure("grant (Consent)", () =>
        consentManager.write.grant([requester.account.address, 7n], { account: owner.account })
    );

    await executeAndMeasure("requestAccess (Audit Log)", () =>
        dataSharing.write.requestAccess([owner.account.address, deviceAddr], { account: requester.account })
    );

    await executeAndMeasure("revoke", () =>
        consentManager.write.revoke([requester.account.address], { account: owner.account })
    );

    console.log("\n--- GAS AND TIME BENCHMARK TABLE ---");
    console.table(report);
}

main().catch(console.error);