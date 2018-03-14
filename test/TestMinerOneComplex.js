const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const MinerOneCrowdsale = artifacts.require("test/TestMinerOneCrowdsale.sol");
const MinerOneToken = artifacts.require("../contracts/MinerOneToken.sol");

contract('MinerOneCrowdsale Complex', async (accounts) => {
	let contract;
	let token;
	let rate;
	let start;
	let end;
	let walletBalance;
	before(async () => {
		token = await MinerOneToken.new();
		contract = await MinerOneCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end, rate] = await Promise.all([contract.START_TIME(), contract.icoEndTime(), contract.RATE()]);
		walletBalance = await web3.eth.getBalance(await contract.WALLET());
	});

	it('should always work', () => {});

	it('should manually mint tokens',  async () => {
		const receivers = [];
		const amounts = [];
		for (let i = 0; i < 100; i++) {
			receivers.push(accounts[1]);
			amounts.push(OneToken);
		}
		await expect(contract.mintTokens(receivers, amounts)).eventually.fulfilled;

		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken.mul(100));
	});

	it('should be possible to mint after ICO end and before finalize', async () => {
		await contract.setNow(end.add(1));

		const balanceBefore = await token.balanceOf(accounts[1]);
		await expect(contract.mintTokens([accounts[1]], [OneToken])).eventually.fulfilled;

		const balanceAfter = await token.balanceOf(accounts[1]);

		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(OneToken);
	});
});
