import { network } from "hardhat";

async function main() {
    const { viem } = await network.create();
    const publicClient = await viem.getPublicClient();
    const [deployer, owner, requester] = await viem.getWalletClients();

    const report: { Type: string; "Item being measured": string; "Gas used": string }[] = [];

    //helper function
    async function deployAndMeasure(contractName: string, args: any[] = []) {
        const blockBefore = await publicClient.getBlockNumber();
        const contract = await viem.deployContract(contractName, args as any);
        const blockAfter = await publicClient.getBlockNumber();

        const block = await publicClient.getBlock({ blockNumber: blockAfter, includeTransactions: true });
        const tx = block.transactions[block.transactions.length - 1];

        const receipt = await publicClient.getTransactionReceipt({ hash: tx.hash });
        return { contract, gasUsed: receipt.gasUsed.toString() };
    }

    console.log("Running deployments and capturing gas metrics...");

    // deployments using helper function
    const regDeploy = await deployAndMeasure("ID_registery");
    report.push({ Type: "Deployment", "Item being measured": "ID_registery", "Gas used": regDeploy.gasUsed });
    const registry = regDeploy.contract;

    const devDeploy = await deployAndMeasure("Device_manager");
    report.push({ Type: "Deployment", "Item being measured": "Device_manager", "Gas used": devDeploy.gasUsed });
    const deviceManager = devDeploy.contract;

    const conDeploy = await deployAndMeasure("Consent_manager");
    report.push({ Type: "Deployment", "Item being measured": "Consent_manager", "Gas used": conDeploy.gasUsed });
    const consentManager = conDeploy.contract;

    const dataDeploy = await deployAndMeasure("Data_sharing", [
        registry.address,
        deviceManager.address,
        consentManager.address,
    ]);
    report.push({ Type: "Deployment", "Item being measured": "Data_sharing", "Gas used": dataDeploy.gasUsed });
    const dataSharing = dataDeploy.contract;

    //function executions
    const tx1 = await registry.write.register_user(["OwnerName", 1n, "owner@test.com"], {
        account: owner.account,
    });
    let receipt = await publicClient.getTransactionReceipt({ hash: tx1 });
    report.push({ Type: "Function", "Item being measured": "register_user", "Gas used": receipt.gasUsed.toString() });

    const deviceAddr = "0x1111111111111111111111111111111111111111";
    const tx2 = await deviceManager.write.registerDevice(
        [deviceAddr, "Smart Thermostat", 101n, "Thermostat", "Living Room"],
        { account: owner.account }
    );
    receipt = await publicClient.getTransactionReceipt({ hash: tx2 });
    report.push({ Type: "Function", "Item being measured": "registerDevice", "Gas used": receipt.gasUsed.toString() });

    const tx3 = await consentManager.write.grant([requester.account.address, 7n], {
        account: owner.account,
    });
    receipt = await publicClient.getTransactionReceipt({ hash: tx3 });
    report.push({ Type: "Function", "Item being measured": "grant (Consent + Tokens)", "Gas used": receipt.gasUsed.toString() });

    const tx4 = await dataSharing.write.requestAccess([owner.account.address, deviceAddr], {
        account: requester.account,
    });
    receipt = await publicClient.getTransactionReceipt({ hash: tx4 });
    report.push({ Type: "Function", "Item being measured": "requestAccess (Audit Log)", "Gas used": receipt.gasUsed.toString() });

    const tx5 = await consentManager.write.revoke([requester.account.address], {
        account: owner.account,
    });
    receipt = await publicClient.getTransactionReceipt({ hash: tx5 });
    report.push({ Type: "Function", "Item being measured": "revoke", "Gas used": receipt.gasUsed.toString() });

    console.log("\n--- GAS BENCHMARK TABLE ---");
    console.table(report);
}

main().catch(console.error);