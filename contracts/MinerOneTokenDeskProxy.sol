pragma solidity 0.4.19;


contract MinerOneTokenDeskProxy {
    address private crowdsale;

    function MinerOneTokenDeskProxy(address _crowdsale) public {
        require(_crowdsale != address(0));
        crowdsale = _crowdsale;
    }

    function () public payable {
        if (!crowdsale.call.gas(300000).value(msg.value)(bytes4(keccak256("buyTokens(address,address)")), msg.sender, msg.sender)) {
            revert();
        }
    }
}
