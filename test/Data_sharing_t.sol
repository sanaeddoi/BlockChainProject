// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";
import "../contracts/ID_registery.sol";
import "../contracts/Device_manager.sol";
import "../contracts/Consent_manager.sol";
import "../contracts/Data_sharing.sol";

contract Data_sharingTest is Test {
    ID_registery registry;
    Device_manager deviceManager;
    Consent_manager consentManager;
    Data_sharing dataSharing;

    address owner = address(0x1234);
    address requester = address(0x5678);
    address device = address(0x9ABC);

    function setUp() public {
        registry = new ID_registery();
        deviceManager = new Device_manager();
        consentManager = new Consent_manager();
        dataSharing = new Data_sharing(
            address(registry),
            address(deviceManager),
            address(consentManager)
        );

        vm.prank(owner);
        registry.register_user("TestOwner", 1, "owner@example.com");

        vm.prank(owner);
        deviceManager.registerDevice(device, "Thermostat", 1, "thermostat", "Living Room");
    }

    function test_DeniesAccessWhenNoConsentExists() public {
        vm.prank(requester);
        bool granted = dataSharing.requestAccess(owner, device);
        assertEq(granted, false);
    }

    function test_GrantsAccessWhenConsentExists() public {
        vm.prank(owner);
        consentManager.grant(requester, 7);

        vm.prank(requester);
        bool granted = dataSharing.requestAccess(owner, device);
        assertEq(granted, true);
    }

    function test_DeniesAccessAfterRevoke() public {
        vm.prank(owner);
        consentManager.grant(requester, 7);

        vm.prank(owner);
        consentManager.revoke(requester);

        vm.prank(requester);
        bool granted = dataSharing.requestAccess(owner, device);
        assertEq(granted, false);
    }

    function test_LogsBothGrantedAndDeniedAttempts() public {
        vm.prank(requester);
        dataSharing.requestAccess(owner, device); // denied, no consent yet

        vm.prank(owner);
        consentManager.grant(requester, 7);

        vm.prank(requester);
        dataSharing.requestAccess(owner, device); // granted

        Data_sharing.AccessLogEntry[] memory logs = dataSharing.getLogs(device);
        assertEq(logs.length, 2);
        assertEq(logs[0].granted, false);
        assertEq(logs[1].granted, true);
    }

    function test_ReadDataRevertsWithoutConsent() public {
        vm.prank(requester);
        vm.expectRevert("No consent for this owner");
        dataSharing.readData(owner, device);
    }

    function test_ReadDataReturnsDeviceInfoWithConsent() public {
        vm.prank(owner);
        consentManager.grant(requester, 7);

        vm.prank(requester);
        (string memory name, string memory devType, string memory location) =
            dataSharing.readData(owner, device);

        assertEq(name, "Thermostat");
        assertEq(devType, "thermostat");
        assertEq(location, "Living Room");
    }
}
