pragma solidity 0.4.15;

contract CosignerInterface {
    function confirm(bytes32 _opHash, address _consumer, uint _nonce, uint8 _v, bytes32 _r, bytes32 _s) returns(bool);
    function consumeOperation(bytes32 _opHash, uint _required) returns(bool);
}

contract ProxyInterface {
    function forward(address _destination, uint _value, bytes _data, bool _throwOnFailedCall);
    function changeContractOwnership(address _to) returns(bool);
    function claimContractOwnership() returns(bool);
    function forceChangeContractOwnership(address _to) returns(bool);
}

contract RGUserPrototype {
    ProxyInterface public proxy;
    CosignerInterface public cosigner;
    address public contractOwner;
    bool public doNotAlwaysRequireCosignature;
    uint88 internal lastUsedNonce;
    mapping(uint => bool) internal usedNonces;
    uint8 constant MINIMUM_REQUIRED = 1;
    uint8 constant MAXIMUM_REQUIRED = 2;
    bool public initiated;

    event OwnershipChanged(address newOwner);
    event Cosigner(address cosignerAddress);
    event SecureMode(bool enabled);
    event Error(bytes32 message);

    // Prototype lock.
    function RGUserPrototype() {
        constructor(0x0000000000000000000000000000000000000001, 0x0000000000000000000000000000000000000001);
        init(0x0000000000000000000000000000000000000001);
    }

    function constructor(address _proxy, address _cosigner) {
        require(contractOwner == 0);
        contractOwner = msg.sender;
        proxy = ProxyInterface(_proxy);
        cosigner = CosignerInterface(_cosigner);
    }

    function init(address _to) onlyGranted() {
        _init(_to);
    }

    function initInsecure(address _to) onlyGranted() {
        _init(_to);
        doNotAlwaysRequireCosignature = true;
    }

    function _init(address _to) internal {
        require(!initiated);
        contractOwner = _to;
        initiated = true;
    }

    function granted(address _to) constant returns(bool) {
        return contractOwner == _to;
    }

    function alwaysRequireCosignature() constant returns(bool) {
        return !doNotAlwaysRequireCosignature;
    }

    function lastNonce() constant returns(uint) {
        return uint(lastUsedNonce);
    }

    function nextNonce() constant returns(uint) {
        return uint(lastUsedNonce) + 1;
    }

    function isCosignerSet() constant returns(bool) {
        return address(cosigner) != 0x0;
    }

    modifier checkSigned(uint8 _required) {
        if (doNotAlwaysRequireCosignature || _checkSigned(cosigner, _required)) {
            _;
        } else {
            _error('Cosigner: access denied');
        }
    }

    modifier checkSignedStrict(uint8 _required) {
        if (_checkSigned(cosigner, _required)) {
            _;
        } else {
            _error('Cosigner: access denied');
        }
    }

    modifier hasCosigner() {
        if (isCosignerSet()) {
            _;
        } else {
            _error('Cosigner not set');
        }
    }

    modifier onlyGranted() {
        if (granted(msg.sender) || (this == msg.sender)) {
            _;
        } else {
            _error('Access denied');
        }
    }

    modifier checkSigner(bytes32 _hash, uint _nonce, uint8 _v, bytes32 _r, bytes32 _s) {
        address signer = ecrecover(_hash, _v, _r, _s);
        if (signer == 0x0) {
            _error('Invalid signature');
            return;
        }
        if (!granted(signer)) {
            _error('Access denied');
            return;
        }
        if (usedNonces[_nonce]) {
            _error('Used nonce provided');
            return;
        }
        lastUsedNonce = uint88(_nonce);
        usedNonces[_nonce] = true;
        _;
    }

    function enableSecureMode() onlyGranted() checkSigned(MINIMUM_REQUIRED) returns(bool) {
        _setSecureMode(true);
        return true;
    }

    function disableSecureMode() onlyGranted() checkSigned(MINIMUM_REQUIRED) returns(bool) {
        _setSecureMode(false);
        return true;
    }

    function _setSecureMode(bool _enabled) internal {
        doNotAlwaysRequireCosignature = !_enabled;
        SecureMode(_enabled);
    }

    function setCosignerAddress(CosignerInterface _cosigner) onlyGranted() checkSignedStrict(MINIMUM_REQUIRED) returns(bool) {
        if (!_checkSigned(_cosigner, MAXIMUM_REQUIRED)) {
            _error('Invalid cosigner');
            return false;
        }
        cosigner = _cosigner;
        Cosigner(address(cosigner));
        return true;
    }

    function changeContractOwnership(address _to) onlyGranted() checkSignedStrict(MINIMUM_REQUIRED) returns(bool) {
        return proxy.changeContractOwnership(_to);
    }

    function claimContractOwnership() onlyGranted() checkSignedStrict(MINIMUM_REQUIRED) returns(bool) {
        return proxy.claimContractOwnership();
    }

    function forceChangeContractOwnership(address _to) onlyGranted() checkSignedStrict(MINIMUM_REQUIRED) returns(bool) {
        return proxy.forceChangeContractOwnership(_to);
    }

    function forwardOnBehalf(
        address _destination,
        uint _value,
        bytes _data,
        uint _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        checkSigner(sha3(_destination, _value, _data, address(this), _nonce, msg.sender), _nonce, _v, _r, _s)
    {
        this.forward(_destination, _value, _data);
        _returnData();
    }

    function actOnBehalf(
        bytes _data,
        uint _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        checkSigner(sha3(_data, address(this), _nonce, msg.sender), _nonce, _v, _r, _s)
    {
        _callResult(address(this), 0, _data);
    }

    function confirmAndForward(
        address _destination,
        uint _value,
        bytes _data,
        bytes32 _opHash,
        uint _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        onlyGranted()
    {
        cosigner.confirm(_opHash, this, _nonce, _v, _r, _s);
        this.forward(_destination, _value, _data);
        _returnData();
    }

    function confirmAndForwardOnBehalf(
        address _destination,
        uint _value,
        bytes _data,
        bytes32 _opHash,
        uint[2] _nonce,
        uint8[2] _v,
        bytes32[2] _r,
        bytes32[2] _s
    )
    {
        cosigner.confirm(_opHash, this, _nonce[0], _v[0], _r[0], _s[0]);
        forwardOnBehalf(_destination, _value, _data, _nonce[1], _v[1], _r[1], _s[1]);
    }

    function forward(address _destination, uint _value, bytes _data)
        onlyGranted()
        checkSigned(MINIMUM_REQUIRED)
    {
        proxy.forward(_destination, _value, _data, false);
        _returnData();
    }

    function recover(address _from, address _to) hasCosigner() checkSignedStrict(MAXIMUM_REQUIRED) returns(bool) {
        if (!granted(_from)) {
            _error('Must recover from owner');
            return false;
        }
        _setContractOwner(_to);
        return true;
    }

    function _setContractOwner(address _to) internal {
        contractOwner = _to;
        OwnershipChanged(_to);
    }

    function _error(bytes32 _message) internal {
        Error(_message);
    }

    function _checkSigned(CosignerInterface _cosigner, uint8 _required) internal returns(bool) {
        return (address(_cosigner) == 0x0) || _cosigner.consumeOperation(sha3(msg.data), _required);
    }

    function _callResult(address _destination, uint _value, bytes _data) internal {
        assembly {
            let res := call(div(mul(gas, 63), 64), _destination, _value, add(_data, 32), mload(_data), 0, 0)
            let returndatastart := msize()
            mstore(0x40, add(returndatastart, returndatasize))
            returndatacopy(returndatastart, 0, returndatasize)
            switch res case 0 { revert(returndatastart, returndatasize) } default { return(returndatastart, returndatasize) }
        }
    }

    function _returnData() internal {
        assembly {
            let returndatastart := msize()
            mstore(0x40, add(returndatastart, returndatasize))
            returndatacopy(returndatastart, 0, returndatasize)
            return(returndatastart, returndatasize)
        }
    }
}