// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @title Consent_manager
 * @dev Manages granting/revoking consent and consent active statuses
 */
contract Consent_manager{
    struct Consent{
        uint256 expiry;
        bool active;
    }

    //mapping from user address to delegate address to consent status (t/f)
    mapping(address => mapping(address => Consent)) consent;

    //token reward balance mapping
    mapping(address => uint256) public rewardTokens;

    //events when consent granted/revoked successfully and when token awarded
    event consent_granted(address indexed user, address indexed delegate, uint256 timestamp);
    event consent_revoked(address indexed user, address indexed delegate, uint256 timestamp);
    event tokens_awarded(address indexed user, uint256 amount, uint256 timestamp);

    /**
     * @dev Grants consent to a delegate
     * @param delegate The address of the delegate receiving consent
     */
    function grant(address delegate, uint256 durationInDays) public{
        require(delegate != address(0), "Invalid delegate address");
        require(delegate != msg.sender, "Cannot grant consent to yourself");
        require(!consent[msg.sender][delegate].active, "Consent already granted");
        require(durationInDays >= 1 && durationInDays <= 356, "Duration must be between 1 and 356 days");

        uint256 expiry = block.timestamp + (durationInDays * 1 days);

        consent[msg.sender][delegate] = Consent({

            expiry: expiry,
            active: true
        });
        rewardTokens[msg.sender] += 1;
        emit tokens_awarded(msg.sender, 1, block.timestamp);
        emit consent_granted(msg.sender, delegate, block.timestamp);
    }

    /**
     * @dev Revokes consent from a delegate
     * @param delegate The address of the delegate who's consent is being revoked
     */
    function revoke(address delegate) public{
        require(consent[msg.sender][delegate].active, "Consent is not active");

        consent[msg.sender][delegate].active = false;
        emit consent_revoked(msg.sender, delegate, block.timestamp);
    }

    /**
     * @dev Check if user has granted active consent to a particular delegate
     * @param user The owner of the device/data
     * @param delegate The requestor being checked
     * @return bool True if consent is granted and active, false otherwise
     */
    function hasConsent(address user, address delegate) public view returns (bool) {
        Consent memory c = consent[user][delegate];
        if(!c.active) {
            return false;
        }
        if(block.timestamp > c.expiry) {
            return false;
        }
        return true;
    }
}