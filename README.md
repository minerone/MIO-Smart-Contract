# Miner One

Smart Contracts for minerone.io ICO


## Deployment

1. Before deployment you have to change addresses in MinerOneCrowdsale.sol for:
    - WALLET (line 11)
    - TEAM_WALLET (line 13)
    - RESEARCH_AND_DEVELOPMENT_WALLET (line 15)
    - BOUNTY_WALLET (line 17)

2. Recheck token name and symbol in MinerOneToken.sol (lines 9, 10).
3. First you have to deploy MinerOneToken.
4. Second you have to deploy MinerOneCrowdsale and give token smart-contract address into it.
5. Then you have to execute `transferOwnership` function on MinerOneToken with address of MinerOneCrowdsale smart-contract.
6. Then you have to deploy MinerOneTokenDeskProxy and give MinerOneCrowdsale smart-contract address into it.
7. Then you have to execute `setTokenDeskProxy` on MinerOneCrowdsale smart-contract and pass address of MinerOneTokenDeskProxy smart-contract.

P.S. You can also deploy it using truffle migrate.

## Testing

To run tests you have first run `ganache-cli` with additional parameters because we need wallets with a lot of ether to test edge cases. By default `ganache-cli` gives 100 ether for generated accounts:

    ganache-cli --account="0x7a44e8791fdba705b42b5fd335215757714a3e7c60b9cc867f1318ac601c6f39,1000000000000000000000000000" --account="0x841803f6fb3e68a707e9dc3d592096e7d90531a9d38a8c57fbd166fdf98793d5,1000000000000000000000000000" --account="0xb73d0ec8fa9f45e0a3bc96eb1b95676725afc51ba0ba4f319e7a9a0c549bc365,1000000000000000000000000000"

And then in another console run tests

    $ truffle test


## Usage

### MinerOneCrowdsale

Crowdsale contract deployment consumes around 3800000 amount of gas. The smart-contract supports token purchases after crowdsale start (`START_TIME` constant) and before crowdsale end (`icoEndTime` state variable). The crowdsale end date can be moved only further in time by calling `setIcoEndTime` function. This function can be called only by the owner of the crowdsale smart-contract.

During ICO smart-contract will collect all funds to so-called RefundVault. After reaching soft cap smart-contract will transfer collected funds directly to a wallet which is specified in `WALLET` constant.

After crowdsale ends, owner must call `finalize` function. In case of successfull ICO (soft cap reached) this call will withdraw funds which were collected during ICO. In case of unsuccessful ICO (soft cap not reached) this call will unlock investors funds which can be returned by sending 0 ether to smart-contract or by calling `claimRefund` function.

A `finalize` function call will also stop token minting and transfer ownership of a token to token itself. This ensures that no one will ever have control over MinerOneToken smart-contract.

Smart-contract also supports manual token minting by calling `mintTokens(address[] _receivers, uint256[] _amounts)` function. This function can be called either by smart-contract owner or by a special account which can be set by calling `setTokenMinter` function. Only smart-contract owner call call `setTokenMinter` function.

`mintTokens(address[] _receivers, uint256[] _amounts)` function accepts two arguments. The first one is an array with addresses, the second one is an array with token amounts which must be assigned to appropriate address. Array lengths must be the same and must not exceed 100 items. When calling this function an event `ManualTokenMintRequiresRefund` can be raised. This event is used to signal that tokens which are to be distributed in an ICO are over. This event also contains information how much tokens cannot be minted and a refund to an address must be applied.

### MinerOneTokenDeskProxy

MinerOneTokenDeskProxy smart-contract is required by the crowdsale smart-contract to assign an additional 3% bonus to the inversor. To get additional 3% bonus investor must deposit fund not to crowdsale smart-contract, but to this proxy contract.

### MinerOneToken

Token contract deployment consumes around 2600000 amount of gas. Token contract is a standard ERC20 contract which is extended to be able to distribute funds which are received by the token smart-contract. To make smart-contract distribute profit one must send ether to a token smart-contract with and specify `0xd0e30db0` constant in transaction data field. This constant is the first four bytes of a `sha3` hash which is taken from `deposit()` string. This will transfer ether to a smart-contract and call `deposit()` function to make smart-contract distribute transferred funds between token holders. Token holder must transfer 0 ethers to the token smart-contract to withdraw his dividends. In this way token holder pays for dividend withdrawal.

The smart-contract also supports forced dividend transfer to token holders. This is achieved by calling `payoutToAddress` function with an array of token holder addresses. In this case caller of `payoutToAddress` function pays for dividend transfer.

It has to be noted that dividend withdrawal is only enabled after token minting is finished (`MinerOneCrowdsale.finalize()` function call).
