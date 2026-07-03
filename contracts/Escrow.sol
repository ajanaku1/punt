// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Punt Escrow — fixed-stake two-sided bet pots released by jury majority.
/// @notice One pot per bet, keyed by the bet's canonical hash. The creator stakes on
///         create, one joiner counter-stakes, and the pot is released to the winner
///         when 2 of the 3 jurors named at creation sign the verdict. If no verdict
///         lands by the deadline, anyone can trigger a refund of both stakes.
///         Testnet demo contract: stakes are test USDT with no value.
contract Escrow {
    struct Pot {
        address creator;
        address joiner;
        uint256 stake;
        uint64 deadline;
        bool closed;
        address[3] jurors;
    }

    IERC20 public immutable usdt;
    mapping(bytes32 => Pot) public pots;

    event Created(bytes32 indexed betId, address indexed creator, uint256 stake, uint64 deadline);
    event Joined(bytes32 indexed betId, address indexed joiner);
    event Settled(bytes32 indexed betId, address indexed winner, uint256 payout);
    event Refunded(bytes32 indexed betId);

    constructor(IERC20 _usdt) {
        usdt = _usdt;
    }

    function create(bytes32 betId, uint256 stake, address[3] calldata jurors, uint64 deadline) external {
        require(pots[betId].creator == address(0), "pot exists");
        require(stake > 0, "zero stake");
        require(deadline > block.timestamp, "deadline passed");
        require(jurors[0] != address(0) && jurors[1] != address(0) && jurors[2] != address(0), "zero juror");
        require(jurors[0] != jurors[1] && jurors[0] != jurors[2] && jurors[1] != jurors[2], "duplicate juror");
        pots[betId] = Pot(msg.sender, address(0), stake, deadline, false, jurors);
        require(usdt.transferFrom(msg.sender, address(this), stake), "stake transfer failed");
        emit Created(betId, msg.sender, stake, deadline);
    }

    function join(bytes32 betId) external {
        Pot storage pot = pots[betId];
        require(pot.creator != address(0), "no pot");
        require(pot.joiner == address(0), "already joined");
        require(!pot.closed, "closed");
        require(msg.sender != pot.creator, "own bet");
        require(block.timestamp < pot.deadline, "deadline passed");
        pot.joiner = msg.sender;
        require(usdt.transferFrom(msg.sender, address(this), pot.stake), "stake transfer failed");
        emit Joined(betId, msg.sender);
    }

    /// @notice Release the pot to `winner` on a 2-of-3 jury majority.
    /// @param sigs EIP-191 signatures by distinct jurors over
    ///        keccak256("PUNT_VERDICT", chainid, this, betId, winner).
    function settle(bytes32 betId, address winner, bytes[] calldata sigs) external {
        Pot storage pot = pots[betId];
        require(pot.creator != address(0), "no pot");
        require(pot.joiner != address(0), "not joined");
        require(!pot.closed, "closed");
        require(winner == pot.creator || winner == pot.joiner, "winner not in pot");

        bytes32 digest = keccak256(abi.encodePacked("PUNT_VERDICT", block.chainid, address(this), betId, winner));
        bytes32 signed = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

        uint256 votes;
        bool[3] memory used;
        for (uint256 i = 0; i < sigs.length; i++) {
            address signer = recover(signed, sigs[i]);
            for (uint256 j = 0; j < 3; j++) {
                if (signer == pot.jurors[j] && !used[j]) {
                    used[j] = true;
                    votes++;
                    break;
                }
            }
        }
        require(votes >= 2, "need 2-of-3 jurors");

        pot.closed = true;
        uint256 payout = pot.stake * 2;
        require(usdt.transfer(winner, payout), "payout failed");
        emit Settled(betId, winner, payout);
    }

    /// @notice The jury set for a pot — the auto-getter for `pots` omits the array,
    ///         and a joiner must verify the jury before staking.
    function getJurors(bytes32 betId) external view returns (address[3] memory) {
        require(pots[betId].creator != address(0), "no pot");
        return pots[betId].jurors;
    }

    /// @notice After the deadline with no verdict, return each side's stake.
    ///         NOTE: a settle-eligible pot can also be refunded once the deadline passes,
    ///         so clients must set deadlines with jury grace (match end + verdict window).
    function refund(bytes32 betId) external {
        Pot storage pot = pots[betId];
        require(pot.creator != address(0), "no pot");
        require(!pot.closed, "closed");
        require(block.timestamp >= pot.deadline, "too early");
        pot.closed = true;
        require(usdt.transfer(pot.creator, pot.stake), "refund failed");
        if (pot.joiner != address(0)) {
            require(usdt.transfer(pot.joiner, pot.stake), "refund failed");
        }
        emit Refunded(betId);
    }

    function recover(bytes32 signed, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig length");
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "bad s");
        address signer = ecrecover(signed, v, r, s);
        require(signer != address(0), "bad sig");
        return signer;
    }
}
