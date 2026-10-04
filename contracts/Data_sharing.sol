// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "./ID_registery.sol";
import "./Device_manager.sol";
import "./Consent_manager.sol";

/**
 * @title Data_sharing
 * @dev Checks consent before allowing access to a device's data, and keeps
 * an append-only log of every access attempt (granted or denied).
 *
 * NOTE: Consent_manager currently only tracks a global owner-to-delegate
 * boolean, with no per-device scoping and no duration/expiry. This contract
 * is written to work correctly against that as it stands today — see the
 * accompanying message for the gaps worth raising with the team.
 */
contract Data_sharing {
    struct AccessLogEntry {
        address requester;
        address deviceAddr;
        bool granted;
        uint256 timestamp;
    }

    ID_registery public registry;
    Device_manager public deviceManager;
    Consent_manager public consentManager;

    // deviceAddr => every access attempt logged for it, append-only
    mapping(address => AccessLogEntry[]) private deviceLogs;

    event AccessAttempt(
        address indexed requester,
        address indexed deviceAddr,
        bool granted
    );

    constructor(
        address _registry,
        address _deviceManager,
        address _consentManager
    ) {
        registry = ID_registery(_registry);
        deviceManager = Device_manager(_deviceManager);
        consentManager = Consent_manager(_consentManager);
    }

    /**
     * @dev Checks whether msg.sender currently holds consent from `owner`.
     * NOTE: this checks consent at the owner level only. Consent_manager
     * does not currently scope consent to a specific device.
     */
    function verifyConsent(address owner, address delegate) public view returns (bool) {
        return consentManager.hasConsent(owner, delegate);
    }

    /**
     * @dev Entry point a requester calls to try accessing one of an owner's
     * devices. Checks that the owner is registered, the device is active,
     * and consent exists and logs the attempt either way.
     */
    function requestAccess(address owner, address deviceAddr) external returns (bool granted) {
        bool ownerActive = registry.isActive(owner);
        bool deviceActive = deviceManager.isDeviceActive(owner, deviceAddr);
        bool consentGiven = consentManager.hasConsent(owner, msg.sender);

        granted = ownerActive && deviceActive && consentGiven;

        _logAccess(msg.sender, deviceAddr, granted);
    }

    /**
     * @dev Returns basic device info if the caller currently holds valid
     * access. Reverts otherwise.
     *
     * NOTE: Device_manager has no off-chain data reference (hash/pointer)
     * field yet, so this currently returns the device's own on-chain
     * attributes as a placeholder. Once a dataHash field is added to
     * Device_manager, this should return that instead.
     */
    function readData(address owner, address deviceAddr)
        external
        view
        returns (string memory name, string memory devType, string memory location)
    {
        require(registry.isActive(owner), "Owner is not registered");
        require(deviceManager.isDeviceActive(owner, deviceAddr), "Device is not active");
        require(consentManager.hasConsent(owner, msg.sender), "No consent for this owner");

        (, name, devType, location, ) = deviceManager.getDevice(owner, deviceAddr);
    }

    /**
     * @dev Returns every access attempt (granted or denied) logged for a device.
     */
    function getLogs(address deviceAddr) external view returns (AccessLogEntry[] memory) {
        return deviceLogs[deviceAddr];
    }

    /**
    * @dev Private so logs can only be written as the direct result of a
    * real access attempt through requestAccess.
    */
    function _logAccess(address requester, address deviceAddr, bool granted) private {
        deviceLogs[deviceAddr].push(
            AccessLogEntry({
                requester: requester,
                deviceAddr: deviceAddr,
                granted: granted,
                timestamp: block.timestamp
            })
        );
        emit AccessAttempt(requester, deviceAddr, granted);
    }
}
