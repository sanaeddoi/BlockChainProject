import { network } from "hardhat";
async function main() {
    console.log("Starting deployment...");

    //initialize Hardhat network and Viem instance
    const { viem } = await network.create();

    //deploy ID_registery
    const registry = await viem.deployContract("ID_registery");
    console.log(`ID_registery deployed to: ${registry.address}`);

    //deploy Device_manager
    const deviceManager = await viem.deployContract("Device_manager");
    console.log(`Device_manager deployed to: ${deviceManager.address}`);

    //deploy Consent_manager
    const consentManager = await viem.deployContract("Consent_manager");
    console.log(`Consent_manager deployed to: ${consentManager.address}`);

    //deploy Data_sharing
    const dataSharing = await viem.deployContract("Data_sharing", [
        registry.address,
        deviceManager.address,
        consentManager.address,
    ]);
    console.log(`Data_sharing deployed to: ${dataSharing.address}`);

    console.log("Deployment completed successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});