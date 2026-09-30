// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../Consent_manager.sol";

contract Consent_managerTest is Test {

    Consent_manager consentManager;

    address user = address(0x1234);
    address delegate = address(0x5678);

    function setUp() public {
        consentManager = new Consent_manager();
    }

    function test_GrantConsent() public {

        vm.prank(user);

        consentManager.grant(delegate);

        assertEq(
            consentManager.hasConsent(
                user,
                delegate
            ),
            true
        );
    }

    function test_RevokeConsent() public {

        vm.prank(user);
        consentManager.grant(delegate);

        assertEq(
            consentManager.hasConsent(user, delegate),
            true
        );

        vm.prank(user);
        consentManager.revoke(delegate);

        assertEq(
            consentManager.hasConsent(user, delegate),
            false
        );
    }

    function test_GrantRejectsZeroAddress() public {

        vm.prank(user);

        vm.expectRevert("Invalid delegate address");

        consentManager.grant(address(0));
    }

    function test_GrantRejectsSelf() public {

        vm.prank(user);

        vm.expectRevert("Cannot grant consent to yourself");

        consentManager.grant(user);
    }

    function test_GrantRejectsDuplicateConsent() public {

        vm.startPrank(user);

        consentManager.grant(delegate);

        vm.expectRevert("Consent already granted");

        consentManager.grant(delegate);

        vm.stopPrank();
    }

    function test_RevokeRejectsInactiveConsent() public {

        vm.prank(user);

        vm.expectRevert("Consent is not active");

        consentManager.revoke(delegate);
    }
}