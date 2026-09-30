// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../ID_registery.sol";

contract ID_registeryTest is Test {

    ID_registery registry;

    address alice = address(0xA11CE);

    function setUp() public {
        registry = new ID_registery();
    }

    function test_RegisterUser() public {
        vm.prank(alice);

        registry.register_user(
            "Alice",
            1,
            "alice@example.com"
        );

        assertEq(
            registry.isActive(alice),
            true
        );
    }

    function test_RevertsOnEmptyName() public {
        vm.prank(alice);

        vm.expectRevert("Name cannot be empty");

        registry.register_user(
            "",
            1,
            "alice@example.com"
        );
    }

    function test_PreventsDoubleRegistration() public {

        vm.startPrank(alice);

        registry.register_user(
            "Alice",
            1,
            "alice@example.com"
        );

        vm.expectRevert("User is already registered");

        registry.register_user(
            "Alice",
            1,
            "alice@example.com"
        );

        vm.stopPrank();
    }
}