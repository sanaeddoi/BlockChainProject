// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";
import "../contracts/ID_registery.sol";
import "../contracts/Consent_manager.sol";

contract IntegrationTest is Test {
    ID_registery registry;
    Consent_manager consentManager;

    address user = address(0x1234);
    address delegate = address(0x5678);

    function setUp() public {
        registry = new ID_registery();
        consentManager = new Consent_manager();
    }

    function test_RegisterGrantRevokeCheck() public {

        // 1. Register the user
        vm.prank(user);
        registry.register_user(
            "TestUser",
            1,
            "test@example.com"
        );

        // Check that the user is active
        assertEq(
            registry.isActive(user),
            true
        );

        // 2. Grant consent to the delegate
        vm.prank(user);
        consentManager.grant(delegate);

        // Check that consent is active
        assertEq(
            consentManager.hasConsent(user, delegate),
            true
        );

        // 3. Revoke consent
        vm.prank(user);
        consentManager.revoke(delegate);

        // 4. Check that consent is no longer active
        assertEq(
            consentManager.hasConsent(user, delegate),
            false
        );
    }
}