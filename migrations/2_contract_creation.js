var MinerOneCrowdsale = artifacts.require("./MinerOneCrowdsale.sol");
var MinerOneToken = artifacts.require("./MinerOneToken.sol");
var MinerOneTokenDeskProxy = artifacts.require("./MinerOneTokenDeskProxy.sol");

module.exports = function(deployer, network, addresses) {
	deployer.deploy(MinerOneToken).then(() => {
		return deployer.deploy(MinerOneCrowdsale, MinerOneToken.address);
	}).then(() => {
		return MinerOneToken.deployed();
	}).then((token) => {
		return token.transferOwnership(MinerOneCrowdsale.address);
	}).then(() => {
		return deployer.deploy(MinerOneTokenDeskProxy, MinerOneCrowdsale.address);
	}).then(() => {
		return MinerOneCrowdsale.deployed();
	}).then((contract) => {
		return contract.setTokenDeskProxy(MinerOneTokenDeskProxy.address);
	});
};
