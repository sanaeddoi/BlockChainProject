// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @title Consent_manager
 * @dev Manages granting/revoking consent and consent active statuses
 */
contract Consent_manager{
    struct Consent{
        int id;
        int duration;
        string dataType;
        bool active;
    }

    //mapping from user address to delegate address to consent status (t/f)
    mapping(address => mapping(address => bool)) consent;

    //events when consent granted/revoked successfully
    event consent_granted(address indexed user, address indexed delegate, uint256 timestamp);
    event consent_revoked(address indexed user, address indexed delegate, uint256 timestamp);

    /**
     * @dev Grants consent to a delegate
     * @param delegate The address of the delegate receiving consent
     */
    function grant(address delegate) public{
        require(delegate != address(0), "Invalid delegate address");
        require(delegate != msg.sender, "Cannot grant consent to yourself");
        require(!consent[msg.sender][delegate], "Consent already granted");

        consent[msg.sender][delegate] = true;
        emit consent_granted(msg.sender, delegate, block.timestamp);
    }

    /**
     * @dev Revokes consent from a delegate
     * @param delegate The address of the delegate who's consent is being revoked
     */
    function revoke(address delegate) public{
        require(consent[msg.sender][delegate], "Consent is not active");

        consent[msg.sender][delegate] = false;
        emit consent_revoked(msg.sender, delegate, block.timestamp);
    }

    /**
     * @dev Check if user has granted active consent to a particular delegate
     * @param user The owner of the device/data
     * @param delegate The requestor being checked
     * @return bool True if consent is granted and active, false otherwise
     */
    function hasConsent(address user, address delegate) 
        public
        view
        returns (bool)
            {
                return consent[user][delegate];
            }    
}