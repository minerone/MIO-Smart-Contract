const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const MinerOneCrowdsale = artifacts.require("test/TestMinerOneCrowdsale.sol");
const MinerOneToken = artifacts.require("../contracts/MinerOneToken.sol");

contract('MinerOneCrowdsale Bad ICO', async (accounts) => {
	let contract;
	let token;
	let rate;
	let start;
	let end;
	before(async () => {
		token = await MinerOneToken.new();
		contract = await MinerOneCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end, rate] = await Promise.all([contract.START_TIME(), contract.icoEndTime(), contract.RATE()]);
	});

	it('should always work', () => {});

	it('should not accept funds before ICO start', async () => {
		await expect(contract.sendTransaction({
				from: accounts[1],
				value: OneEther
			}))
			.to.be.eventually.rejected;
	});

	it('Should accept funds after startTime', async () => {
		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(0);
		await contract.setNow(start.add(1));

		const phase0discount = await contract.getPhaseDiscount(0);

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});
		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneEther.mul(rate).mul(100).div(new BigNumber(100).sub(phase0discount)).floor());
	});

	it('should fail when purchased less than 100 tokens', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(0.001),
			gas: 200000
		})).eventually.rejected;
	});

	it('should not give large purchase bonus on phase 0', async () => {
		const [balanceBefore, phase0discount]
		=
		await Promise.all([token.balanceOf(accounts[1]), contract.getPhaseDiscount(0)]);

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(10),
			gas: 200000
		});
		const balanceAfter = await token.balanceOf(accounts[1]);

		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(OneEther.mul(10).mul(rate).mul(100).div(new BigNumber(100).sub(phase0discount)).floor());
	});

	it('should correctly pass from stage 0 to stage 1', async () => {
		const [balanceBefore, phase0date] = await Promise.all([token.balanceOf(accounts[1]), contract.getPhaseDate(0)]);

		await contract.setNow(phase0date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentPhase()).to.be.bignumber.equal(1);

		const [phase1discount, balanceAfter] = await Promise.all([contract.getPhaseDiscount(1), token.balanceOf(accounts[1])]);

		const tokens = OneEther.mul(rate).mul(100).div(new BigNumber(100).sub(phase1discount)).floor();

		expect(balanceAfter.minus(balanceBefore)).to.be.bignumber.equal(tokens);
	});

	it('should give large purchase bonus from phase 1', async () => {
		const [balanceBefore, phase1discount, largePurchaseBonus]
		=
		await Promise.all([token.balanceOf(accounts[1]), contract.getPhaseDiscount(1), contract.LARGE_PURCHASE_BONUS()]);

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(10),
			gas: 200000
		});
		const balanceAfter = await token.balanceOf(accounts[1]);

		const tokens = OneEther.mul(10).mul(rate).mul(100).div(new BigNumber(100).sub(phase1discount)).floor();
		const expectedTokens = tokens.add(tokens.mul(largePurchaseBonus).div(100)).floor();

		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(expectedTokens);
	});

	it('should correctly pass from stage 1 to stage 4', async () => {
		const phase3 = await contract.getPhaseDate(3);
		await contract.setNow(phase3.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentPhase()).to.be.bignumber.equal(4);
	});

	it('Have 23 Ether in refundVault', async () => {
		expect(await web3.eth.getBalance(await contract.vault())).to.be.bignumber.equal(OneEther.mul(23));
	});

	it('Should not be able to Finalize ICO before end time', async () => {
		await expect(contract.finalize()).eventually.rejected;
	});

	it('Should successfully finalize unsuccessfull ICO', async () => {
		await contract.setNow(end.add(1));
		const tokens = await token.totalSupply();
		await expect(contract.finalize()).eventually.fulfilled;
		expect(await token.totalSupply()).to.be.bignumber.equal(tokens);
	});

	it('Should be possible to get refund', async () => {
		let etherBalanceBefore = web3.fromWei(await web3.eth.getBalance(accounts[1]));

		await contract.sendTransaction({
			from: accounts[1],
			value: 0
		});

		let etherBalanceAfter = web3.fromWei(await web3.eth.getBalance(accounts[1]));

		expect(etherBalanceAfter - etherBalanceBefore).to.be.closeTo(23, 0.01);
	});
});
