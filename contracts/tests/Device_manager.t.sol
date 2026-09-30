// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";
import "../contracts/Device_manager.sol";

contract Device_managerTest is Test {
    Device_manager deviceManager;

    address owner = address(0x1234);
    address device = address(0x5678);

    function setUp() public {
        deviceManager = new Device_manager();
    }

    // Test that a device can be registered successfully
    function test_RegisterDevice() public {
        vm.prank(owner);

        deviceManager.registerDevice(
            device,
            "Temperature Sensor",
            1,
            "Sensor",
            "Room 101"
        );

        assertEq(
            deviceManager.isDeviceActive(owner, device),
            true
        );
    }

    // Test that the stored device information can be retrieved
    function test_GetDevice() public {
        vm.prank(owner);

        deviceManager.registerDevice(
            device,
            "Temperature Sensor",
            1,
            "Sensor",
            "Room 101"
        );

        (
            int id,
            string memory name,
            string memory devType,
            string memory location,
            bool active
        ) = deviceManager.getDevice(owner, device);

        assertEq(id, 1);
        assertEq(name, "Temperature Sensor");
        assertEq(devType, "Sensor");
        assertEq(location, "Room 101");
        assertEq(active, true);
    }

    // Test that the zero address cannot be used as a device address
    function test_RevertsOnZeroDeviceAddress() public {
        vm.prank(owner);

        vm.expectRevert("Invalid device address");

        deviceManager.registerDevice(
            address(0),
            "Temperature Sensor",
            1,
            "Sensor",
            "Room 101"
        );
    }

    // Test that a device cannot be registered twice
    function test_PreventsDoubleRegistration() public {
        vm.startPrank(owner);

        deviceManager.registerDevice(
            device,
            "Temperature Sensor",
            1,
            "Sensor",
            "Room 101"
        );

        vm.expectRevert("Device is already registered");

        deviceManager.registerDevice(
            device,
            "Temperature Sensor",
            1,
            "Sensor",
            "Room 101"
        );

        vm.stopPrank();
    }

    // Test that an empty device name is rejected
    function test_RevertsOnEmptyName() public {
        vm.prank(owner);

        vm.expectRevert("Name cannot be empty");

        deviceManager.registerDevice(
            device,
            "",
            1,
            "Sensor",
            "Room 101"
        );
    }

    // Test that an unregistered device is not active
    function test_UnregisteredDeviceIsInactive() public {
        assertEq(
            deviceManager.isDeviceActive(owner, device),
            false
        );
    }

    // Test that retrieving an unregistered device fails
    function test_GetUnregisteredDeviceReverts() public {
        vm.expectRevert("Device does not exist");

        deviceManager.getDevice(owner, device);
    }
}