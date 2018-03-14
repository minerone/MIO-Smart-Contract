const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const MinerOneCrowdsale = artifacts.require("test/TestMinerOneCrowdsale.sol");
const MinerOneToken = artifacts.require("../contracts/MinerOneToken.sol");
const RefundVault = artifacts.require("zeppelin-solidity/contracts/crowdsale/RefundVault.sol");

contract('MinerOneCrowdsale Medium ICO', async (accounts) => {
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

	it('should not accept funds before ICO start', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: OneEther
		})).eventually.rejected;
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
		const expectedTokens = OneEther.mul(rate).mul(100).div(new BigNumber(100).sub(phase0discount)).floor();
		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(expectedTokens);
	});

	it('should correctly pass from stage 0 to stage 1', async () => {
		const [balanceBefore,phase0Date,phase1Discount,largePurchaseBonus] = await Promise.all([
			token.balanceOf(accounts[1]),
			contract.getPhaseDate(0),
			contract.getPhaseDiscount(1),
			contract.LARGE_PURCHASE_BONUS()
		]); ;

		await contract.setNow(phase0Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(5000),
			gas: 200000
		});

		expect(await contract.currentPhase()).to.be.bignumber.equal(1);

		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(5000).mul(rate).mul(100).div(new BigNumber(100).sub(phase1Discount)).floor();
		const bonusTokens = tokens.mul(largePurchaseBonus).div(100).floor();
		const expectedTokens = tokens.add(bonusTokens);
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(expectedTokens);
	});

	it('should correctly pass from stage 1 to stage 4', async () => {
		const phase3Date = await contract.getPhaseDate(3);
		await contract.setNow(phase3Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentPhase()).to.be.bignumber.equal(4);
	});

	it('Have 5002 Ether on balance', async () => {
		const walletBalanceAfter = await web3.eth.getBalance(await contract.WALLET());
		const balance = walletBalanceAfter.sub(walletBalance).add(await web3.eth.getBalance(await contract.vault()));

		expect(balance).to.be.bignumber.equal(OneEther.mul(5002));
	});

	it('Should not be able to Finalize ICO before end time', async () => {
		await expect(contract.finalize()).eventually.rejected;
	});

	it('Should successfully finalize successfull ICO', async () => {
		const wallet = await contract.WALLET();

		await contract.setNow(end.add(1));
		await expect(contract.finalize()).eventually.fulfilled;

		const etherBalanceAfter = await web3.eth.getBalance(wallet);
		expect(web3.fromWei(etherBalanceAfter.sub(walletBalance)).toNumber()).to.be.closeTo(5002, 0.01);
	});

	it('Should not be possible to get refund', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: 0
		})).eventually.rejected;
	});

	it('should change token owner to token', async () => {
		expect(await token.owner()).to.be.equal(token.address);
	});

	it('should finish minting', async () => {
		expect(await token.mintingFinished()).to.be.equal(true);
	});

	it('should close vault', async () => {
		const vault = await RefundVault.at(await contract.vault());
		expect(await vault.state()).to.be.bignumber.equal(2); // Closed
	});

	it('should correctly mint tokens on finalize', async () => {
		const [
			icoTokens,
			totalSupply,
			teamWallet,
			teamTokens,
			bountyWallet,
			bountyTokens,
			rdWallet,
			rdTokens,
			icoTokensPercent
			]
			=
			await Promise.all([
				contract.ICO_TOKENS(),
				token.totalSupply(),
				contract.TEAM_WALLET(),
				contract.TEAM_TOKENS_PERCENT(),
				contract.BOUNTY_WALLET(),
				contract.BOUNTY_TOKENS_PERCENT(),
				contract.RESEARCH_AND_DEVELOPMENT_WALLET(),
				contract.RESEARCH_AND_DEVELOPMENT_TOKENS_PERCENT(),
				contract.ICO_TOKENS_PERCENT()
			]);

		const [
			teamBalance,
			bountyBalance,
			rdBalance
		]
		= await Promise.all([
			token.balanceOf(teamWallet),
			token.balanceOf(bountyWallet),
			token.balanceOf(rdWallet)
		]);

		const soldTokens = totalSupply.mul(icoTokensPercent).div(100).floor();

		expect(teamBalance).to.be.bignumber.equal(teamTokens.mul(soldTokens).div(icoTokensPercent).floor());
		expect(bountyBalance).to.be.bignumber.equal(bountyTokens.mul(soldTokens).div(icoTokensPercent).floor());
		expect(rdBalance).to.be.bignumber.equal(rdTokens.mul(soldTokens).div(icoTokensPercent).floor());
	});
});
