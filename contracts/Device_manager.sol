// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @title Device manager
 * @dev Manages device registration and active statuses.
 */
contract Device_manager{
    struct Device{
        int id;
        string name;
        string devType;
        string location;
        address ownerAddr;
        bool active;
    }
    //mapping from owner address to device address to device data
    mapping(address => mapping(address => Device)) device;

    //event when new device registered successfully
    event device_registered(address indexed owner, address indexed deviceAddr, string name, uint256 timestamp);

    /**
     * @dev Registers new device for the caller.
     * @param deviceAddr The address of the device being registered
     * @param deviceName The name of the device being registered
     * @param _id The id of the device being registered
     * @param _devType  The type of the device being registered
     * @param _loc The location of the device being registered
     */
    function registerDevice(address deviceAddr, string memory deviceName, int _id, string memory _devType, string memory _loc) public{
        require(!device[msg.sender][deviceAddr].active, "Device is already registered");
        require(deviceAddr != address(0), "Invalid device address");
        require(bytes(deviceName).length > 0, "Name cannot be empty");

        device[msg.sender][deviceAddr] = Device({
            id: _id,
            name: deviceName,
            devType: _devType,
            location: _loc,
            ownerAddr: msg.sender,
            active: true
        });

        emit device_registered(msg.sender, deviceAddr, deviceName, block.timestamp);
    }

    /**
     * @dev Check if given device is active.
     * @param user The user supplying the device
     * @param deviceAddr The device address to verify.
     * @return bool True if the device is active.
     */
    function isDeviceActive(address user, address deviceAddr) public view returns (bool){
        return device[user][deviceAddr].active;
    }

    /**
     * @dev Retrieve device.
     * @param user The owner of the device
     * @param deviceAddr The address of the device to return
     * @return id The device ID
     * @return name The device name
     * @return devType The type of device
     * @return location The device location
     * @return active Whether the device is active
     */
    function getDevice(address user, address deviceAddr) public view returns (int id, string memory name, string memory devType, string memory location, bool active){
        require(device[user][deviceAddr].active, "Device does not exist");
        Device memory d = device[user][deviceAddr];
        return (d.id, d.name, d.devType, d.location, d.active);
    }
}