import { ZeroEx } from '0x.js';
import { BlockchainLifecycle } from '@0xproject/dev-utils';
import { BigNumber } from '@0xproject/utils';
import * as chai from 'chai';
import ethUtil = require('ethereumjs-util');

import { TestSignatureValidatorContract } from '../../src/contract_wrappers/generated/test_signature_validator';
import { addressUtils } from '../../src/utils/address_utils';
import { assetProxyUtils } from '../../src/utils/asset_proxy_utils';
import { constants } from '../../src/utils/constants';
import { OrderFactory } from '../../src/utils/order_factory';
import { orderUtils } from '../../src/utils/order_utils';
import { ContractName, SignedOrder } from '../../src/utils/types';
import { chaiSetup } from '../utils/chai_setup';
import { deployer } from '../utils/deployer';
import { provider, web3Wrapper } from '../utils/web3_wrapper';

chaiSetup.configure();
const expect = chai.expect;

const blockchainLifecycle = new BlockchainLifecycle(web3Wrapper);

describe('MixinSignatureValidator', () => {
    let signedOrder: SignedOrder;
    let orderFactory: OrderFactory;
    let signatureValidator: TestSignatureValidatorContract;

    before(async () => {
        const accounts = await web3Wrapper.getAvailableAddressesAsync();
        const makerAddress = accounts[0];
        const signatureValidatorInstance = await deployer.deployAsync(ContractName.TestSignatureValidator);
        signatureValidator = new TestSignatureValidatorContract(
            signatureValidatorInstance.abi,
            signatureValidatorInstance.address,
            provider,
        );
        const zeroEx = new ZeroEx(provider, { networkId: constants.TESTRPC_NETWORK_ID });

        const defaultOrderParams = {
            ...constants.STATIC_ORDER_PARAMS,
            exchangeAddress: signatureValidatorInstance.address,
            makerAddress,
            feeRecipientAddress: addressUtils.generatePseudoRandomAddress(),
            makerAssetData: assetProxyUtils.encodeERC20ProxyData(addressUtils.generatePseudoRandomAddress()),
            takerAssetData: assetProxyUtils.encodeERC20ProxyData(addressUtils.generatePseudoRandomAddress()),
        };
        const privateKey = constants.TESTRPC_PRIVATE_KEYS[accounts.indexOf(makerAddress)];
        orderFactory = new OrderFactory(privateKey, defaultOrderParams);
    });

    beforeEach(async () => {
        await blockchainLifecycle.startAsync();
        signedOrder = orderFactory.newSignedOrder();
    });
    afterEach(async () => {
        await blockchainLifecycle.revertAsync();
    });

    describe('isValidSignature', () => {
        beforeEach(async () => {
            signedOrder = orderFactory.newSignedOrder();
        });

        it('should return true with a valid signature', async () => {
            const orderHashHex = orderUtils.getOrderHashHex(signedOrder);
            const success = await signatureValidator.publicIsValidSignature.callAsync(
                orderHashHex,
                signedOrder.makerAddress,
                signedOrder.signature,
            );
            expect(success).to.be.true();
        });

        it('should return false with an invalid signature', async () => {
            const invalidR = ethUtil.sha3('invalidR');
            const invalidS = ethUtil.sha3('invalidS');
            const invalidSigBuff = Buffer.concat([
                ethUtil.toBuffer(signedOrder.signature.slice(0, 6)),
                invalidR,
                invalidS,
            ]);
            const invalidSigHex = `0x${invalidSigBuff.toString('hex')}`;
            signedOrder.signature = invalidSigHex;
            const orderHashHex = orderUtils.getOrderHashHex(signedOrder);
            const success = await signatureValidator.publicIsValidSignature.callAsync(
                orderHashHex,
                signedOrder.makerAddress,
                signedOrder.signature,
            );
            expect(success).to.be.false();
        });
    });
});