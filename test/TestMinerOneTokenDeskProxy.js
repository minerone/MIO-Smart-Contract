const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));
const ZeroTokens = new BigNumber(web3.toWei(0, 'ether'));

const MinerOneCrowdsale = artifacts.require("test/TestMinerOneCrowdsale.sol");
const MinerOneToken = artifacts.require("../contracts/MinerOneToken.sol");
const MinerOneTokenDeskProxy = artifacts.require("../contracts/MinerOneTokenDeskProxy.sol");

contract('MinerOneTokenDeskProxy', async (accounts) => {
	let contract;
	let token;
	let proxy;
	let rate;
	let start;
	let end;
	let tokenDeskProxyBonus;
	before(async () => {
		token = await MinerOneToken.new();
		contract = await MinerOneCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		proxy = await MinerOneTokenDeskProxy.new(contract.address);
		await contract.setTokenDeskProxy(proxy.address);

		[start, end, rate, tokenDeskProxyBonus] = await Promise.all([contract.START_TIME(), contract.icoEndTime(), contract.RATE(), contract.TOKEN_DESK_BONUS()]);
	});

	it('should always work', () => {});

	it('should transfer ether to crowdsale contract when receiving ether', async () => {
		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(0);
		const phase0discount = await contract.getPhaseDiscount(0);
		await contract.setNow(start.add(1));

		await proxy.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 400000
		});
		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(rate).mul(100).div(new BigNumber(100).sub(phase0discount)).floor();
		expect(balanceAfter).to.be.bignumber.equal(tokens);
	});

	it('should have no ether on proxy balance', async () => {
		expect(await web3.eth.getBalance(proxy.address)).to.be.bignumber.equal(0);
	});

	it('should get bonus when transfering through TokenDeskProxy', async () => {
		const [balanceBefore, phase0Date, phase1Discount]
		=
		await Promise.all([
			token.balanceOf(accounts[1]),
			contract.getPhaseDate(0),
			contract.getPhaseDiscount(1)
		]);
		await contract.setNow(phase0Date.add(1));

		await proxy.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 400000
		});
		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(rate).mul(100).div(new BigNumber(100).sub(phase1Discount)).floor();
		const expectedTokens = tokens.add(tokens.mul(tokenDeskProxyBonus).div(100)).floor();
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(expectedTokens);
	});

});
