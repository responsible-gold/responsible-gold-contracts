pragma solidity 0.4.15;

import './RGAssetOwnershipCardInterface.sol';

contract RGAssetOwnershipCardCloneFactoryInterface {
    function deploy() returns(RGAssetOwnershipCardInterface);
}