// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PuntUSDT — EIP-3009 test USDT for gasless staking on Base Sepolia.
/// @notice Self-contained ERC-20 + EIP-3009 (TransferWithAuthorization).
///         No external imports — compiles with bare solc, matched to the
///         existing MockUSDT.sol style. 6 decimals, open faucet mint, and
///         1,000,000 initial supply to the deployer.
///
///         EIP-3009 enables gasless staking: a joiner signs a
///         TransferWithAuthorization off-chain via WDK (account.signTypedData),
///         a funded facilitator submits the tx and pays the gas. The joiner
///         never holds ETH.
contract PuntUSDT {
    // ── ERC-20 state ────────────────────────────────────────────────────

    string public constant name = "Punt USDT (test)";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ── EIP-3009 state ──────────────────────────────────────────────────

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 private constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 private constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    /// @notice nonce => used flag. A nonce can only be used once per authorizer.
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // ── Constructor ─────────────────────────────────────────────────────

    /// @param chainId_ The EIP-712 chain id (84532 for Base Sepolia).
    constructor(uint256 chainId_) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                chainId_,
                address(this)
            )
        );
        // 1,000,000 USDT initial supply to the deployer (faucet seed)
        uint256 initial = 1_000_000 * 10 ** decimals;
        balanceOf[msg.sender] = initial;
        totalSupply = initial;
        emit Transfer(address(0), msg.sender, initial);
    }

    // ── ERC-20 methods ──────────────────────────────────────────────────

    /// @notice Faucet mint — open by design for a testnet demo.
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "USDT: allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    // ── EIP-3009: TransferWithAuthorization ─────────────────────────────

    /// @notice Execute a transfer on behalf of `from`, signed off-chain.
    ///         `from` signs the authorization hash with their WDK key;
    ///         the caller (facilitator) pays gas.
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireUnusedAuthorization(from, nonce);
        _requireValidPeriod(validAfter, validBefore);

        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _requireValidSignature(from, structHash, v, r, s);

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    /// @notice Receive a transfer on behalf of `to`, signed off-chain by the
    ///         sender. The caller (facilitator) pays gas.
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireUnusedAuthorization(from, nonce);
        _requireValidPeriod(validAfter, validBefore);

        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _requireValidSignature(from, structHash, v, r, s);

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    /// @notice Cancel a pending authorization. Must be signed by the
    ///         authorizer. Once cancelled, the nonce cannot be used.
    function cancelAuthorization(
        address authorizer,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireUnusedAuthorization(authorizer, nonce);

        bytes32 structHash = keccak256(
            abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)
        );
        _requireValidSignature(authorizer, structHash, v, r, s);

        authorizationState[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    // ── Internal helpers ────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "USDT: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _requireUnusedAuthorization(address authorizer, bytes32 nonce) internal view {
        require(!authorizationState[authorizer][nonce], "USDT: nonce used");
    }

    function _requireValidPeriod(uint256 validAfter, uint256 validBefore) internal view {
        require(block.timestamp >= validAfter, "USDT: too early");
        require(block.timestamp < validBefore, "USDT: expired");
    }

    function _requireValidSignature(
        address signer,
        bytes32 structHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == signer, "USDT: bad sig");
    }
}
