pragma solidity 0.4.15;

import '../../OwnedPrototype.sol';
import '../../RGUserContracts/RGPermissioned.sol';
import '../../Interfaces/RGRegistryInterface.sol';

contract RGRegistryPrototype_v10 is OwnedPrototype, RGPermissioned, RGRegistryInterface {

    mapping(bytes32 => bool) public registered;
    mapping(bytes32 => address) public institutions;
    mapping(bytes32 => address) public institutionOwners;
    mapping(bytes32 => bytes32) public assets;

    event Error(bytes32 error);
    event AssetRegistered(string asset, bytes32 symbol);
    event InstitutionRegistered(string asset, string institution, address ethAddress);

    modifier isValidAsset(string _asset) {
        if (bytes(_asset).length != 3) {
            Error('Invalid asset length');
            return;
        }
        _;
    }

    modifier isValidInstitution(string _institution) {
        if (bytes(_institution).length != 4) {
            Error('Invalid institution length');
            return;
        }
        _;
    }

    modifier isValidICAP(bytes32 _icap) {
        // Should start with XE.
        if (_icap[0] != 88 || _icap[1] != 69) {
            Error('Invalid country code');
            return;
        }
        // Should have 12 zero bytes at the end.
        for (uint8 j = 20; j < 32; j++) {
            if (_icap[j] != 48) {
                Error('Invalid address length');
                return;
            }
        }

        bytes memory bban = new bytes(20);
        for (uint8 i = 0; i < 16; i++) {
            bban[i] = _icap[i + 4];
        }
        uint8 parseChecksum = (uint8(_icap[2]) - 48) * 10 + (uint8(_icap[3]) - 48);
        uint8 calcChecksum = 98 - _mod9710(_prepare(bban));

        if (parseChecksum != calcChecksum) {
            Error('Mismatch checksum');
            return;
        }
        _;
    }

    function RGRegistryPrototype_v10() {
        constructRegistry(0x1);
    }

    function constructRegistry(address _owner) returns(bool) {
        require(super.constructOwned(_owner));
        return true;
    }

    function parse(bytes32 _icap) constant isValidICAP(_icap) returns(address, bytes32, bool) {
        var (_asset, _institution, _client) = _decodeIndirect(_icap);

        bytes32 asset = sha3(_asset);

        if (!registered[asset]) {
            Error('Asset isn\'t registered');
            return (institutions[assetInstitution], assets[asset], registered[assetInstitution]);
        }

        bytes32 assetInstitution = sha3(_asset, _institution);

        if (!registered[assetInstitution]) {
            Error('Institution isn\'t registered');
        }
        return (institutions[assetInstitution], assets[asset], registered[assetInstitution]);
    }

    function _decodeIndirect(bytes32 _icap) internal constant returns(string, string, string) {
        bytes memory asset = new bytes(3);
        bytes memory institution = new bytes(4);
        bytes memory client = new bytes(9);

        uint8 k = 4;
        for (uint8 i = 0; i < asset.length; i++) {
            asset[i] = _icap[k++];
        }
        for (i = 0; i < institution.length; i++) {
            institution[i] = _icap[k++];
        }
        for (i = 0; i < client.length; i++) {
            client[i] = _icap[k++];
        }
        return (string(asset), string(institution), string(client));
    }

    function _prepare(bytes _bban) internal constant returns(bytes) {
        for (uint8 i = 0; i < 16; i++) {
            uint8 charCode = uint8(_bban[i]);
            if (charCode >= 65 && charCode <= 90) {
                _bban[i] = byte(charCode - 55);
            }
        }
        _bban[16] = 33; // X
        _bban[17] = 14; // E
        _bban[18] = 48; // 0
        _bban[19] = 48; // 0
        return _bban;
    }

    function _mod9710(bytes _prepared) internal constant returns(uint8) {
        uint m = 0;
        for (uint8 i = 0; i < _prepared.length; i++) {
            uint8 charCode = uint8(_prepared[i]);
            if (charCode >= 48) {
                m *= 10;
                m += charCode - 48; // numbers
                m %= 97;
            } else {
                m *= 10;
                m += charCode / 10; // tens
                m %= 97;
                m *= 10;
                m += charCode % 10; // units
                m %= 97;
            }
        }
        return uint8(m);
    }

    function registerAsset(string _asset, bytes32 _symbol) onlyContractOwner() isValidAsset(_asset) returns(bool) {
        bytes32 asset = sha3(_asset);
        if (registered[asset]) {
            Error('Asset already registered');
            return false;
        }
        registered[asset] = true;
        assets[asset] = _symbol;
        AssetRegistered(_asset, _symbol);
        return true;
    }

    function registerInstitution(string _asset, string _institution, address _address) onlyRole('register') isValidAsset(_asset) isValidInstitution(_institution) returns(bool) {
        bytes32 asset = sha3(_asset);
        if (!registered[asset]) {
            Error('Asset isn\'t registered');
            return false;
        }
        bytes32 assetInstitution = sha3(_asset, _institution);
        if (registered[assetInstitution]) {
            Error('Institution already registered');
            return false;
        }
        registered[assetInstitution] = true;
        institutions[assetInstitution] = _address;
        InstitutionRegistered(_asset, _institution, _address);
        return true;
    }
}
