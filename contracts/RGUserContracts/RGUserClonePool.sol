pragma solidity 0.4.15;

import './RGProxyPrototype.sol';
import './RGUserPrototype.sol';
import './RGPermissioned.sol';
import '../helpers/BaseDeployer.sol';

contract RGUserClonePool is RGPermissioned, BaseDeployer {
    address public constant defaultCosigner = 0x3231231231231231231231231231231231231233;
    address public constant rgUserPrototype = 0x1231231231231231231231231231231231231231;
    address public constant rgProxyPrototype = 0x2231231231231231231231231231231231231232;

    event Deployed(address contractAddress, address rgProxyAddress);
    event Assigned(address contractAddress, address indexed userAddress);

    function _deployRGProxyClone() internal returns(address) {
        return _deployClone(rgProxyPrototype);
    }

    function _deployRGUserClone() internal returns(address) {
        return _deployClone(rgUserPrototype);
    }

    function deploy() returns(bool) {
        return deployWithCosigner(0x0);
    }

    function deployWithCosigner(address _cosigner) returns(bool) {
        if (_cosigner == 0x0) {
            return deployWithoutDefaultCosigner();
        }
        if (_cosigner == defaultCosigner) {
            return deployWithDefaultCosigner();
        }
        return deployWithUnusualCosigner(_cosigner);
    }

    function deployWithUnusualCosigner(address _cosigner) onlyRole('deploy') returns(bool) {
        require(_cosigner != 0x0);
        require(_cosigner != defaultCosigner);
        address rgProxyAddress = _deployRGProxyClone();
        address rgUserAddress = _deployRGUserClone();
        RGProxyPrototype(rgProxyAddress).constructOwned(rgUserAddress);
        RGUserPrototype(rgUserAddress).constructor(rgProxyAddress, _cosigner);
        Deployed(rgUserAddress, rgProxyAddress);
        return true;
    }

    function deployWithDefaultCosigner() onlyRole('deploy') returns(bool) {
        address rgProxyAddress = _deployRGProxyClone();
        address rgUserAddress = _deployRGUserClone();
        RGProxyPrototype(rgProxyAddress).constructOwned(rgUserAddress);
        RGUserPrototype(rgUserAddress).constructor(rgProxyAddress, defaultCosigner);
        Deployed(rgUserAddress, rgProxyAddress);
        return true;
    }

    function deployWithoutDefaultCosigner() onlyRole('deploy') returns(bool) {
        address rgProxyAddress = _deployRGProxyClone();
        address rgUserAddress = _deployRGUserClone();
        RGProxyPrototype(rgProxyAddress).constructOwned(rgUserAddress);
        RGUserPrototype(rgUserAddress).constructor(rgProxyAddress, 0x0);
        Deployed(rgUserAddress, rgProxyAddress);
        return true;
    }

    function assignTo(RGUserPrototype _rgUserClone, address _userAddress, bool _alwaysRequireCosignature) onlyRole('assign') returns(bool) {
        if (!_alwaysRequireCosignature) {
            _rgUserClone.initInsecure(_userAddress);
        } else {
            _rgUserClone.init(_userAddress);
        }
        Assigned(address(_rgUserClone), _userAddress);
        return true;
    }

    function assignToSecure(RGUserPrototype _rgUserClone, address _userAddress) onlyRole('assign') returns(bool) {
        _rgUserClone.init(_userAddress);
        Assigned(address(_rgUserClone), _userAddress);
        return true;
    }
}