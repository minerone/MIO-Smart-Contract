pragma solidity 0.4.19;

import "zeppelin-solidity/contracts/crowdsale/RefundVault.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "./MinerOneToken.sol";


contract MinerOneCrowdsale is Ownable {
    using SafeMath for uint256;
    // Wallet where all ether will be
    address public constant WALLET = 0x2C2b3885BC8B82Ad4D603D95ED8528Ef112fE8F2;
    // Wallet for team tokens
    address public constant TEAM_WALLET = 0x997faEf570B534E5fADc8D2D373e2F11aF4e115a;
    // Wallet for research and development tokens
    address public constant RESEARCH_AND_DEVELOPMENT_WALLET = 0x770998331D6775c345B1807c40413861fc4D6421;
    // Wallet for bounty tokens
    address public constant BOUNTY_WALLET = 0xd481Aab166B104B1aB12e372Ef7af6F986f4CF19;

    uint256 public constant UINT256_MAX = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
    uint256 public constant ICO_TOKENS = 287000000e18;
    uint8 public constant ICO_TOKENS_PERCENT = 82;
    uint8 public constant TEAM_TOKENS_PERCENT = 10;
    uint8 public constant RESEARCH_AND_DEVELOPMENT_TOKENS_PERCENT = 6;
    uint8 public constant BOUNTY_TOKENS_PERCENT = 2;
    uint256 public constant SOFT_CAP = 3000000e18;
    uint256 public constant START_TIME = 1518692400; // 2018/02/15 11:00 UTC +0
    uint256 public constant RATE = 1000; // 1000 tokens costs 1 ether
    uint256 public constant LARGE_PURCHASE = 10000e18;
    uint256 public constant LARGE_PURCHASE_BONUS = 4;
    uint256 public constant TOKEN_DESK_BONUS = 3;
    uint256 public constant MIN_TOKEN_AMOUNT = 100e18;

    Phase[] internal phases;

    struct Phase {
        uint256 till;
        uint8 discount;
    }

    // The token being sold
    MinerOneToken public token;
    // amount of raised money in wei
    uint256 public weiRaised;
    // refund vault used to hold funds while crowdsale is running
    RefundVault public vault;
    uint256 public currentPhase = 0;
    bool public isFinalized = false;
    address private tokenMinter;
    address private tokenDeskProxy;
    uint256 public icoEndTime = 1526558400; // 2018/05/17 12:00 UTC +0

    /**
    * event for token purchase logging
    * @param purchaser who paid for the tokens
    * @param beneficiary who got the tokens
    * @param value weis paid for purchase
    * @param amount amount of tokens purchased
    */
    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);

    event Finalized();
    /**
    * When there no tokens left to mint and token minter tries to manually mint tokens
    * this event is raised to signal how many tokens we have to charge back to purchaser
    */
    event ManualTokenMintRequiresRefund(address indexed purchaser, uint256 value);

    function MinerOneCrowdsale(address _token) public {
        phases.push(Phase({ till: 1519214400, discount: 35 })); // 2018/02/21 12:00 UTC +0
        phases.push(Phase({ till: 1519905600, discount: 30 })); // 2018/03/01 12:00 UTC +0
        phases.push(Phase({ till: 1521201600, discount: 25 })); // 2018/03/16 12:00 UTC +0
        phases.push(Phase({ till: 1522584000, discount: 20 })); // 2018/04/01 12:00 UTC +0
        phases.push(Phase({ till: 1524312000, discount: 15 })); // 2018/04/21 12:00 UTC +0
        phases.push(Phase({ till: 1525608000, discount: 10 })); // 2018/05/06 12:00 UTC +0
        phases.push(Phase({ till: 1526472000, discount: 5  })); // 2018/05/16 12:00 UTC +0
        phases.push(Phase({ till: UINT256_MAX, discount:0 }));  // unlimited

        token = MinerOneToken(_token);
        vault = new RefundVault(WALLET);
        tokenMinter = msg.sender;
    }

    modifier onlyTokenMinterOrOwner() {
        require(msg.sender == tokenMinter || msg.sender == owner);
        _;
    }

    // fallback function can be used to buy tokens or claim refund
    function () external payable {
        if (!isFinalized) {
            buyTokens(msg.sender, msg.sender);
        } else {
            claimRefund();
        }
    }

    function mintTokens(address[] _receivers, uint256[] _amounts) external onlyTokenMinterOrOwner {
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(!isFinalized);
        for (uint256 i = 0; i < _receivers.length; i++) {
            address receiver = _receivers[i];
            uint256 amount = _amounts[i];

            require(receiver != address(0));
            require(amount > 0);

            uint256 excess = appendContribution(receiver, amount);

            if (excess > 0) {
                ManualTokenMintRequiresRefund(receiver, excess);
            }
        }
    }

    // low level token purchase function
    function buyTokens(address sender, address beneficiary) public payable {
        require(beneficiary != address(0));
        require(sender != address(0));
        require(validPurchase());

        uint256 weiReceived = msg.value;
        uint256 nowTime = getNow();
        // this loop moves phases and insures correct stage according to date
        while (currentPhase < phases.length && phases[currentPhase].till < nowTime) {
            currentPhase = currentPhase.add(1);
        }

        // calculate token amount to be created
        uint256 tokens = calculateTokens(weiReceived);

        if (tokens < MIN_TOKEN_AMOUNT) revert();

        uint256 excess = appendContribution(beneficiary, tokens);
        uint256 refund = (excess > 0 ? excess.mul(weiReceived).div(tokens) : 0);

        weiReceived = weiReceived.sub(refund);
        weiRaised = weiRaised.add(weiReceived);

        if (refund > 0) {
            sender.transfer(refund);
        }

        TokenPurchase(sender, beneficiary, weiReceived, tokens.sub(excess));

        if (goalReached()) {
            WALLET.transfer(weiReceived);
        } else {
            vault.deposit.value(weiReceived)(sender);
        }
    }

    // if crowdsale is unsuccessful, investors can claim refunds here
    function claimRefund() public {
        require(isFinalized);
        require(!goalReached());

        vault.refund(msg.sender);
    }

    /**
    * @dev Must be called after crowdsale ends, to do some extra finalization
    * work. Calls the contract's finalization function.
    */
    function finalize() public onlyOwner {
        require(!isFinalized);
        require(hasEnded());

        if (goalReached()) {
            vault.close();

            uint256 totalSupply = token.totalSupply();

            uint256 teamTokens = uint256(TEAM_TOKENS_PERCENT).mul(totalSupply).div(ICO_TOKENS_PERCENT);
            token.mint(TEAM_WALLET, teamTokens);
            uint256 rdTokens = uint256(RESEARCH_AND_DEVELOPMENT_TOKENS_PERCENT).mul(totalSupply).div(ICO_TOKENS_PERCENT);
            token.mint(RESEARCH_AND_DEVELOPMENT_WALLET, rdTokens);
            uint256 bountyTokens = uint256(BOUNTY_TOKENS_PERCENT).mul(totalSupply).div(ICO_TOKENS_PERCENT);
            token.mint(BOUNTY_WALLET, bountyTokens);

            token.finishMinting();
            token.transferOwnership(token);
        } else {
            vault.enableRefunds();
        }

        Finalized();

        isFinalized = true;
    }

    // @return true if crowdsale event has ended
    function hasEnded() public view returns (bool) {
        return getNow() > icoEndTime || token.totalSupply() == ICO_TOKENS;
    }

    function goalReached() public view returns (bool) {
        return token.totalSupply() >= SOFT_CAP;
    }

    function setTokenMinter(address _tokenMinter) public onlyOwner {
        require(_tokenMinter != address(0));
        tokenMinter = _tokenMinter;
    }

    function setTokenDeskProxy(address _tokekDeskProxy) public onlyOwner {
        require(_tokekDeskProxy != address(0));
        tokenDeskProxy = _tokekDeskProxy;
    }

    function setIcoEndTime(uint256 _endTime) public onlyOwner {
        require(_endTime > icoEndTime);
        icoEndTime = _endTime;
    }

    function getNow() internal view returns (uint256) {
        return now;
    }

    function calculateTokens(uint256 _weiAmount) internal view returns (uint256) {
        uint256 tokens = _weiAmount.mul(RATE).mul(100).div(uint256(100).sub(phases[currentPhase].discount));

        uint256 bonus = 0;
        if (currentPhase > 0) {
            bonus = bonus.add(tokens >= LARGE_PURCHASE ? LARGE_PURCHASE_BONUS : 0);
            bonus = bonus.add(msg.sender == tokenDeskProxy ? TOKEN_DESK_BONUS : 0);
        }
        return tokens.add(tokens.mul(bonus).div(100));
    }

    function appendContribution(address _beneficiary, uint256 _tokens) internal returns (uint256) {
        uint256 excess = 0;
        uint256 tokensToMint = 0;
        uint256 totalSupply = token.totalSupply();

        if (totalSupply.add(_tokens) < ICO_TOKENS) {
            tokensToMint = _tokens;
        } else {
            tokensToMint = ICO_TOKENS.sub(totalSupply);
            excess = _tokens.sub(tokensToMint);
        }
        if (tokensToMint > 0) {
            token.mint(_beneficiary, tokensToMint);
        }
        return excess;
    }

    // @return true if the transaction can buy tokens
    function validPurchase() internal view returns (bool) {
        bool withinPeriod = getNow() >= START_TIME && getNow() <= icoEndTime;
        bool nonZeroPurchase = msg.value != 0;
        bool canMint = token.totalSupply() < ICO_TOKENS;
        bool validPhase = (currentPhase < phases.length);
        return withinPeriod && nonZeroPurchase && canMint && validPhase;
    }
}
