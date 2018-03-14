const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const TestMinerOneToken = artifacts.require("test/TestMinerOneToken.sol");

const depositCall = web3.sha3('deposit()').substring(0, 10);

contract('MinerOneToken', async (accounts) => {
	let token;

	before(async () => {
		token = await TestMinerOneToken.new();
		await token.mint(accounts[0], OneToken.mul(10000));
		await token.finishMinting();
	});

	it('should always work', () => {});

	it('should successfully create token', async () => {
		expect(await token.balanceOf(accounts[0])).to.be.bignumber.equal(OneToken.mul(10000));
	});

	it('should successfully send shares', async () => {
		await token.transfer(accounts[1], OneToken.mul(5000));

		expect(await token.balanceOf(accounts[0])).to.be.bignumber.equal(OneToken.mul(5000));
		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken.mul(5000));
	});

	it('should not send more shares than actually have', async () => {
		await expect(token.transfer(accounts[1], OneToken.mul(10001))).eventually.rejected;
	});

	it('should not give dividends to an account before distribution', async () => {
		expect(await token.getDividends(accounts[0])).to.be.bignumber.equal(0);
	});

	it('should return funds when sending ether to contract', async () => {
		const balanceBefore = await web3.eth.getBalance(accounts[0]);
		await token.send(OneEther);
		const balanceAfter = await web3.eth.getBalance(accounts[0]);

		expect(web3.fromWei(balanceBefore.sub(balanceAfter)).toNumber()).to.be.closeTo(0, 0.01);
	});

	it('should distribute dividends', async () => {
		await token.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(5),
			data: depositCall
		});

		expect(await token.getDividends(accounts[0])).to.be.bignumber.equal(OneEther.mul(2.5));
		expect(await token.getDividends(accounts[1])).to.be.bignumber.equal(OneEther.mul(2.5));
	});

	it('must accumulate funds for sequential distributions', async () => {
		const [balanceBeforeOne, balanceBeforeTwo] = await Promise.all([
			token.getDividends(accounts[0]),
			token.getDividends(accounts[1])
		]);

		await token.sendTransaction({ value: OneEther, data: depositCall });
		await token.sendTransaction({ value: OneEther, data: depositCall });

		const balanceAfterOne = await token.getDividends(accounts[0]);
		const balanceAfterTwo = await token.getDividends(accounts[1]);
		expect(balanceAfterOne.sub(balanceBeforeOne)).to.be.bignumber.equal(OneEther);
		expect(balanceAfterTwo.sub(balanceBeforeTwo)).to.be.bignumber.equal(OneEther);
	});

	it('must transfer funds on withdraw', async () => {
		const balanceBefore = await web3.eth.getBalance(accounts[0]);

		await token.send(OneEther);

		const balanceAfter = await web3.eth.getBalance(accounts[0]);
		expect(balanceAfter).to.be.bignumber.above(balanceBefore);
	});

	it('must transfer funds on withdraw to a calling account', async () => {
		const balanceBefore = await web3.eth.getBalance(accounts[1]);

		await token.sendTransaction({ from: accounts[1], value: 0 });

		expect(await web3.eth.getBalance(accounts[1])).to.be.bignumber.above(balanceBefore);
	});

	it('call to withdraw again does nothing', async () => {
		const balanceBefore = await web3.eth.getBalance(accounts[1]);

		await token.sendTransaction({ from: accounts[1], value: 0 }); // no funds to transfer, already withdrawed all

		expect(await web3.eth.getBalance(accounts[1])).to.be.bignumber.below(balanceBefore);
	});

	it('transfer -> distribute -> transfer -> distribute', async () => {
		await token.transfer(accounts[1], OneToken.mul(5000), {from: accounts[0]}); // accounts[1] have 10000 tokens

		await token.sendTransaction({
			value: OneEther,
			data: depositCall
		}); // one ether goes to accounts[1]
		await token.transfer(accounts[2], OneToken.mul(5000), {from: accounts[1]}); // accounts[2] have 5000 tokens
		await token.sendTransaction({
			value: OneEther,
			data: depositCall
		}); // one ether is split equally between accounts[1] and accounts[2]

		expect(await token.getDividends(accounts[0])).to.be.bignumber.equal(0);
		expect(await token.getDividends(accounts[1])).to.be.bignumber.equal(OneToken.mul(1.5));
		expect(await token.getDividends(accounts[2])).to.be.bignumber.equal(OneToken.mul(0.5));
	});
});

contract('MinerOneToken distribute small amounts of wei', async (accounts) => {

	it('transfer -> distribute', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
		 	token.mint(accounts[0], OneToken.mul(5)),
			token.mint(accounts[1], OneToken.mul(3)),
			token.mint(accounts[2], OneToken.mul(2))
		]);
		await token.finishMinting();
		for (let i = 0; i < 5; i++) {
			await token.sendTransaction({ value: 1,	data: depositCall });
		}

		/**
		 * share distribution:
		 * accounts[0]: 		5
		 * accounts[1]: 		3
		 * accounts[2]: 		2
		 *
		 * dividend distribution:
		 * accounts[0]: 		(5 * 5) / 10 = 2, 0.5 wei left
		 * accounts[1]: 		(3 * 5) / 10 = 1, 0.5 wei left
		 * accounts[2]: 		(2 * 5) / 10 = 1, 0 wei left
		 */
		expect(await token.getDividends(accounts[0])).to.be.bignumber.equal(2);
		expect(await token.getDividends(accounts[1])).to.be.bignumber.equal(1);
		expect(await token.getDividends(accounts[2])).to.be.bignumber.equal(1);
	});

	it('transfer -> distribute -> withdraw -> distribute -> withdraw', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
			token.mint(accounts[0], OneToken.mul(5)),
			token.mint(accounts[1], OneToken.mul(3)),
			token.mint(accounts[2], OneToken.mul(2))
		]);
		await token.finishMinting();
		for (let i = 0; i < 5; i++) {
			await token.sendTransaction({ value: 1,	data: depositCall });
		}
		/**
		 * same share and dividend distribution as above
		 */
        await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		expect(await web3.eth.getBalance(token.address)).to.be.bignumber.equal(1);

		for (let i = 0; i < 5; i++) {
			await token.sendTransaction({ value: 1,	data: depositCall });
		}

		/**
		 * dividend distribution:
		 * accounts[0]: 0.5 wei + (5 * 5) / 10 = 3, 0 wei left
		 * accounts[1]: 0.5 wei + (3 * 5) / 10 = 2, 0 wei left
		 * accounts[2]: 0 wei + (2 * 5) / 10 = 1, 0 wei left
		 */
		expect(await token.getDividends(accounts[0])).to.be.bignumber.equal(3);
		expect(await token.getDividends(accounts[1])).to.be.bignumber.equal(2);
		expect(await token.getDividends(accounts[2])).to.be.bignumber.equal(1);

		await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		expect(await web3.eth.getBalance(token.address)).to.be.bignumber.equal(0);
	});

	it('undistributed', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
			token.mint(accounts[0], OneToken.mul(10)),
			token.mint(accounts[1], OneToken.mul(10)),
			token.mint(accounts[2], OneToken.mul(10)),
		]);
		await token.finishMinting();

		await token.sendTransaction({ value: OneEther, data: depositCall });

		await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		expect(await web3.eth.getBalance(token.address)).to.be.bignumber.equal(1); // one wei left undistributed
		expect(await token.getReserved()).to.be.bignumber.equal(1); // contract must one wei reserved
	});

	it('unpaid 30', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
			token.mint(accounts[0], 10),
			token.mint(accounts[1], 10),
			token.mint(accounts[2], 10)
		]);
		await token.finishMinting();

		await token.sendTransaction({ value: OneEther, data: depositCall });

		await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		expect(await token.getUnpaidWei(accounts[0])).to.be.bignumber.equal(10); // (10 shares * 1 ether) % 30 shares = 10 unpaid
		expect(await token.getUnpaidWei(accounts[1])).to.be.bignumber.equal(10); // (10 shares * 1 ether) % 30 shares = 10 unpaid
		expect(await token.getUnpaidWei(accounts[2])).to.be.bignumber.equal(10); // (10 shares * 1 ether) % 30 shares = 10 unpaid
	});

	it('unpaid 99', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
			token.mint(accounts[0], 56),
			token.mint(accounts[1], 10),
			token.mint(accounts[2], 33)
		]);
		await token.finishMinting();

		await token.sendTransaction({ value: OneEther, data: depositCall });

		await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		expect(await token.getUnpaidWei(accounts[0])).to.be.bignumber.equal(56); // (56 shares * 1 ether) % 99 shares = 56 unpaid
		expect(await token.getUnpaidWei(accounts[1])).to.be.bignumber.equal(10); // (10 shares * 1 ether) % 99 shares = 10 unpaid
		expect(await token.getUnpaidWei(accounts[2])).to.be.bignumber.equal(33); // (33 shares * 1 ether) % 99 shares = 33 unpaid
	});

	it('unpaid 99 with 1.3333 ether', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
			token.mint(accounts[0], 56),
			token.mint(accounts[1], 10),
			token.mint(accounts[2], 33)
		]);
		await token.finishMinting();

		await token.sendTransaction({ value: OneEther.mul(1.3333), data: depositCall });

		await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		const [
			contractBalance,
			accountOneUnpaid,
			accountTwoUnpaid,
			accountThreeUnpaid
		]
		=
		await Promise.all([
			web3.eth.getBalance(token.address),
			token.getUnpaidWei(accounts[0]),
			token.getUnpaidWei(accounts[1]),
			token.getUnpaidWei(accounts[2])
		]);

		expect(accountOneUnpaid).to.be.bignumber.equal(89); 	// (56 shares * 1.3333 ether) % 99 shares = 89 unpaid
		expect(accountTwoUnpaid).to.be.bignumber.equal(76); 	// (10 shares * 1.3333 ether) % 99 shares = 76 unpaid
		expect(accountThreeUnpaid).to.be.bignumber.equal(33); 	// (33 shares * 1.3333 ether) % 99 shares = 33 unpaid
		expect(contractBalance).to.be.bignumber.equal(2); 		// (89 + 76 + 33) / 99 = 2 wei left
	});

	it('unpaid 99 with 4.687411 ether', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
			token.mint(accounts[0], 56),
			token.mint(accounts[1], 10),
			token.mint(accounts[2], 33)
		]);
		await token.finishMinting();

		await token.sendTransaction({ value: OneEther.mul(4.687411), data: depositCall });

		await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		const [
			contractBalance,
			accountOneUnpaid,
			accountTwoUnpaid,
			accountThreeUnpaid
		]
		=
		await Promise.all([
			web3.eth.getBalance(token.address),
			token.getUnpaidWei(accounts[0]),
			token.getUnpaidWei(accounts[1]),
			token.getUnpaidWei(accounts[2])
		]);

		expect(accountOneUnpaid).to.be.bignumber.equal(80); 	// (56 shares * 4.687411 ether) % 99 shares = 80 unpaid
		expect(accountTwoUnpaid).to.be.bignumber.equal(85); 	// (10 shares * 4.687411 ether) % 99 shares = 85 unpaid
		expect(accountThreeUnpaid).to.be.bignumber.equal(33); 	// (33 shares * 4.687411 ether) % 99 shares = 33 unpaid
		expect(contractBalance).to.be.bignumber.equal(2); 		// (80 + 85 + 33) / 99 = 2 wei left
	});

	it('unpaid 999 with 1.1 ether', async () => {
		const token = await TestMinerOneToken.new();
		await Promise.all([
			token.mint(accounts[0], 555),
			token.mint(accounts[1], 111),
			token.mint(accounts[2], 333),
		]);
		await token.finishMinting();

		await token.sendTransaction({ value: OneEther.mul(1.1), data: depositCall });

		await token.payoutToAddress([accounts[0], accounts[1], accounts[2]]);

		const [
			contractBalance,
			accountOneUnpaid,
			accountTwoUnpaid,
			accountThreeUnpaid
		]
		=
		await Promise.all([
			web3.eth.getBalance(token.address),
			token.getUnpaidWei(accounts[0]),
			token.getUnpaidWei(accounts[1]),
			token.getUnpaidWei(accounts[2])
		]);

		expect(accountOneUnpaid).to.be.bignumber.equal(111); 	// (555 shares * 1.1 ether) % 999 shares = 111 unpaid
		expect(accountTwoUnpaid).to.be.bignumber.equal(222); 	// (111 shares * 1.1 ether) % 999 shares = 222 unpaid
		expect(accountThreeUnpaid).to.be.bignumber.equal(666); 	// (333 shares * 1.1 ether) % 999 shares = 666 unpaid
		expect(contractBalance).to.be.bignumber.equal(1); 		// (111 + 222 + 666) / 999 = 1 wei left
	});
});
