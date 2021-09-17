pragma solidity 0.4.15;

import '../helpers/BaseDeployer.sol';
import '../Interfaces/RGAssetOwnershipCardCloneFactoryInterface.sol';
import '../Interfaces/RGAssetOwnershipCardInterface.sol';

contract RGAssetOwnershipCardCloneFactory is BaseDeployer, RGAssetOwnershipCardCloneFactoryInterface  {
    address constant rGAssetOwnershipCardResolverPlaceholder = 0xcafecafecafecafecafecafecafecafecafecafe;

    function deploy() returns(RGAssetOwnershipCardInterface) {
        return RGAssetOwnershipCardInterface(_deployClone(rGAssetOwnershipCardResolverPlaceholder));
    }
}