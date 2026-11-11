'use strict';
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');

const { resolverFunctionName } = require('../services/lambda-arn');

describe('resolverFunctionName', () => {
    afterEach(() => {
        delete process.env.LAMBDA_ACCOUNT_ID;
    });

    test('sem LAMBDA_ACCOUNT_ID mantém o nome simples', () => {
        assert.strictEqual(resolverFunctionName('novoerp-node-funcoes-production-reinf'), 'novoerp-node-funcoes-production-reinf');
    });

    test('com LAMBDA_ACCOUNT_ID monta o ARN da conta das lambdas', () => {
        process.env.LAMBDA_ACCOUNT_ID = '585768139569';
        assert.strictEqual(
            resolverFunctionName('novoerp-node-funcoes-production-reinf'),
            'arn:aws:lambda:us-east-1:585768139569:function:novoerp-node-funcoes-production-reinf',
        );
    });

    test('não altera um nome que já é ARN', () => {
        process.env.LAMBDA_ACCOUNT_ID = '585768139569';
        const arn = 'arn:aws:lambda:us-east-1:777812314499:function:portal-api-production-crud';
        assert.strictEqual(resolverFunctionName(arn), arn);
    });

    test('nome vazio é retornado sem alteração', () => {
        process.env.LAMBDA_ACCOUNT_ID = '585768139569';
        assert.strictEqual(resolverFunctionName(undefined), undefined);
    });
});
