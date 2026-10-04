// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @title ID_registery
 * @dev Manages user ids, registration and active statuses.
 */
contract ID_registery {
    struct User{
        string name;
        int id;
        address addr;
        string email;
        uint256 registeredAt;
        bool active;
    }

    //mapping from user wallet address to user profile data
    mapping(address => User) users;

    //event when new user registered successfully
    event user_registered(address indexed userAddress, string name, uint256 timestamp);

    /**
     * @dev Registers new user profile for the caller.
     * @param _name Name of the registering user
     * @param _id Id of the registering user
     * @param _email Email of the registering user
     */
    function register_user(string memory _name, int _id, string memory _email) public{
        require(!users[msg.sender].active, "User is already registered");
        require(bytes(_name).length > 0, "Name cannot be empty");

        users[msg.sender] = User({
            name: _name,
            id: _id,
            addr: msg.sender,
            email: _email,
            registeredAt: block.timestamp,
            active: true
        });

        emit user_registered(msg.sender, _name, block.timestamp);
    }

    /**
     * @dev Check if given user is active.
     * @param _userAddress The address to verify.
     * @return bool True if the user is active.
     */
    function isActive(address _userAddress) public view returns (bool){
        return users[_userAddress].active;
    }

    /**
     * @dev Retrieve user profile.
     * @param _userAddress The user's address.
     * @return name The user's name
     * @return id The user's ID
     * @return email The user's email
     * @return registeredAt The registration timestamp
     */
    function getUser(address _userAddress) public view returns (string memory name,  int id, string memory email, uint256 registeredAt) {
        require(users[_userAddress].active, "User does not exist");
        User memory user = users[_userAddress];
        return (user.name, user.id, user.email, user.registeredAt);
    }
}

