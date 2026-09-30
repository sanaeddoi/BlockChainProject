// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../contracts/Consent_manager.sol";

contract Consent_managerTest is Test {

    Consent_manager consentManager;

    address user = address(0x1234);
    address delegate = address(0x5678);

    function setUp() public {
        consentManager = new Consent_manager();
    }

    function test_GrantConsent() public {

        vm.prank(user);

        consentManager.grant(delegate, 7);

        assertEq(
            consentManager.hasConsent(
                user,
                delegate
            ),
            true
        );
    }

    function test_GrantRewardsToken() public {
        vm.prank(user);
        consentManager.grant(delegate, 7);

        assertEq(consentManager.rewardTokens(user), 1);
    }

    function test_ConsentExpiryAfterDuration() public {
        vm.prank(user);
        consentManager.grant(delegate, 5);

        assertEq(consentManager.hasConsent(user, delegate), true);

        vm.warp(block.timestamp + 6 days);

        assertEq(consentManager.hasConsent(user, delegate), false);
    }

    function test_GrantRejectsInvalidDuration() public {
        vm.prank(user);
        vm.expectRevert("Duration must be between 1 and 356 days");
        consentManager.grant(delegate, 0);

        vm.prank(user);
        vm.expectRevert("Duration must be between 1 and 356 days");
        consentManager.grant(delegate, 433);
    }

    function test_RevokeConsent() public {

        vm.prank(user);
        consentManager.grant(delegate, 5);

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

        consentManager.grant(address(0), 7);
    }

    function test_GrantRejectsSelf() public {

        vm.prank(user);

        vm.expectRevert("Cannot grant consent to yourself");

        consentManager.grant(user, 7);
    }

    function test_GrantRejectsDuplicateConsent() public {

        vm.startPrank(user);

        consentManager.grant(delegate, 7);

        vm.expectRevert("Consent already granted");

        consentManager.grant(delegate, 7);

        vm.stopPrank();
    }

    function test_RevokeRejectsInactiveConsent() public {

        vm.prank(user);

        vm.expectRevert("Consent is not active");

        consentManager.revoke(delegate);
    }
}