pragma solidity 0.4.19;

import "../contracts/MinerOneToken.sol";


contract TestMinerOneToken is MinerOneToken {

    function getReserved() public view returns (uint256) {
        return reserved;
    }

    function getUnpaidWei(address holder) public view returns (uint256) {
        return accounts[holder].remainder;
    }
}
