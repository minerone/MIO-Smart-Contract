pragma solidity 0.4.19;
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/token/ERC20/MintableToken.sol";


contract MinerOneToken is MintableToken {
    using SafeMath for uint256;

    string public name = "MinerOne";
    string public symbol = "MIO";
    uint8 public decimals = 18;

    /**
     * This struct holds data about token holder dividends
     */
    struct Account {
        /**
         * Last amount of dividends seen at the token holder payout
         */
        uint256 lastDividends;
        /**
         * Amount of wei contract needs to pay to token holder
         */
        uint256 fixedBalance;
        /**
         * Unpayed wei amount due to rounding
         */
        uint256 remainder;
    }

    /**
     * Mapping which holds all token holders data
     */
    mapping(address => Account) internal accounts;

    /**
     * Running total of all dividends distributed
     */
    uint256 internal totalDividends;
    /**
     * Holds an amount of unpayed weis
     */
    uint256 internal reserved;

    /**
     * Raised when payment distribution occurs
     */
    event Distributed(uint256 amount);
    /**
     * Raised when shareholder withdraws his profit
     */
    event Paid(address indexed to, uint256 amount);
    /**
     * Raised when the contract receives Ether
     */
    event FundsReceived(address indexed from, uint256 amount);

    modifier fixBalance(address _owner) {
        Account storage account = accounts[_owner];
        uint256 diff = totalDividends.sub(account.lastDividends);
        if (diff > 0) {
            uint256 numerator = account.remainder.add(balances[_owner].mul(diff));

            account.fixedBalance = account.fixedBalance.add(numerator.div(totalSupply_));
            account.remainder = numerator % totalSupply_;
            account.lastDividends = totalDividends;
        }
        _;
    }

    modifier onlyWhenMintingFinished() {
        require(mintingFinished);
        _;
    }

    function () external payable {
        withdraw(msg.sender, msg.value);
    }

    function deposit() external payable {
        require(msg.value > 0);
        require(msg.value <= this.balance.sub(reserved));

        totalDividends = totalDividends.add(msg.value);
        reserved = reserved.add(msg.value);
        Distributed(msg.value);
    }

    /**
     * Returns unpayed wei for a given address
     */
    function getDividends(address _owner) public view returns (uint256) {
        Account storage account = accounts[_owner];
        uint256 diff = totalDividends.sub(account.lastDividends);
        if (diff > 0) {
            uint256 numerator = account.remainder.add(balances[_owner].mul(diff));
            return account.fixedBalance.add(numerator.div(totalSupply_));
        } else {
            return 0;
        }
    }

    function transfer(address _to, uint256 _value) public
        onlyWhenMintingFinished
        fixBalance(msg.sender)
        fixBalance(_to) returns (bool) {
        return super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint256 _value) public
        onlyWhenMintingFinished
        fixBalance(_from)
        fixBalance(_to) returns (bool) {
        return super.transferFrom(_from, _to, _value);
    }

    function payoutToAddress(address[] _holders) external {
        require(_holders.length > 0);
        require(_holders.length <= 100);
        for (uint256 i = 0; i < _holders.length; i++) {
            withdraw(_holders[i], 0);
        }
    }

    /**
     * Token holder must call this to receive dividends
     */
    function withdraw(address _benefeciary, uint256 _toReturn) internal
        onlyWhenMintingFinished
        fixBalance(_benefeciary) returns (bool) {

        uint256 amount = accounts[_benefeciary].fixedBalance;
        reserved = reserved.sub(amount);
        accounts[_benefeciary].fixedBalance = 0;
        uint256 toTransfer = amount.add(_toReturn);
        if (toTransfer > 0) {
            _benefeciary.transfer(toTransfer);
        }
        if (amount > 0) {
            Paid(_benefeciary, amount);
        }
        return true;
    }
}
