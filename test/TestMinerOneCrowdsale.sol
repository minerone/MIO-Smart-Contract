pragma solidity 0.4.19;

import "../contracts/MinerOneCrowdsale.sol";


contract TestMinerOneCrowdsale is MinerOneCrowdsale {
    uint256 private testNow;

    function TestMinerOneCrowdsale(address _token) public MinerOneCrowdsale(_token) {
    }

    function setNow(uint256 _now) public {
        testNow = _now;
    }

    function getNowTest() public view returns (uint256) {
        return getNow();
    }

    function getPhaseDate(uint256 _phase) public view returns(uint256) {
        return phases[_phase].till;
    }

    function getPhaseDiscount(uint256 _phase) public view returns (uint8) {
        return phases[_phase].discount;
    }

    function getNow() internal view returns (uint256) {
        return testNow;
    }
}
