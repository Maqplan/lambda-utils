'use strict';

const path = require('path');
const { test, describe } = require('node:test');
const assert = require('node:assert');

// Força um cwd determinístico para as asserções de pasta: com NOVOERP_LAMBDA_FOLDER definido,
// getLambdaInfo monta cwd = join(FOLDER, tipo, fnFolder), independente do ambiente.
const LAMBDA_FOLDER = '/tmp/novoerp-lambdas';
process.env.NOVOERP_LAMBDA_FOLDER = LAMBDA_FOLDER;

const { getLambdaInfo } = require('../services/lambda-local.service');

// Casos baseados nos nomes reais das lambdas do ambiente QAS (profile maqplan-qas):
//   novoerp-java-danfe-qas-api
//   novoerp-node-email-qas-mailer
//   novoerp-node-email-qas-ses
//   novoerp-node-email-qas-sesNotification
//   novoerp-node-funcoes-qas-exportar-xml
//   novoerp-node-funcoes-qas-exportar-xml-gerar-zip
//   novoerp-node-funcoes-qas-faixa-pdf
//   novoerp-node-funcoes-qas-reinf
//   novoerp-node-funcoes-qas-resizeFotoUsuario
//   novoerp-node-funcoes-qas-sintegra
//   novoerp-node-funcoes-qas-sped
//   novoerp-node-funcoes-qas-sw
//   novoerp-node-funcoes-qas-triggers
//   novoerp-node-funcoes-qas-xml-imap
//   novoerp-node-gtin-info-qas-api
//   novoerp-node-manifestacao-qas-main
//   novoerp-node-nfe4-qas-api
//   novoerp-node-nfe4-v2-qas-api
//   novoerp-node-nfse-api-qas-api
//   novoerp-node-resize-image-dev-main

describe('getLambdaInfo', () => {
    test('nfe4-v2: ignora o sufixo de versão na pasta e extrai stage/nome corretos', () => {
        const info = getLambdaInfo('novoerp-node-nfe4-v2-qas-api');

        assert.strictEqual(info.tipo, 'node');
        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'api');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'nfe4'));
    });

    test('nfe4 (sem sufixo de versão): mesma pasta, stage e nome', () => {
        const info = getLambdaInfo('novoerp-node-nfe4-qas-api');

        assert.strictEqual(info.tipo, 'node');
        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'api');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'nfe4'));
    });

    test('funcoes-sintegra: padrão clássico sem hifens', () => {
        const info = getLambdaInfo('novoerp-node-funcoes-qas-sintegra');

        assert.strictEqual(info.tipo, 'node');
        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'sintegra');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'funcoes'));
    });

    test('funcoes-exportar-xml: nome de função com hífen', () => {
        const info = getLambdaInfo('novoerp-node-funcoes-qas-exportar-xml');

        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'exportar-xml');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'funcoes'));
    });

    test('funcoes-exportar-xml-gerar-zip: nome de função com múltiplos hifens', () => {
        const info = getLambdaInfo('novoerp-node-funcoes-qas-exportar-xml-gerar-zip');

        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'exportar-xml-gerar-zip');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'funcoes'));
    });

    test('funcoes-xml-imap: outro nome de função com hífen', () => {
        const info = getLambdaInfo('novoerp-node-funcoes-qas-xml-imap');

        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'xml-imap');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'funcoes'));
    });

    test('funcoes-resizeFotoUsuario: preserva camelCase no nome', () => {
        const info = getLambdaInfo('novoerp-node-funcoes-qas-resizeFotoUsuario');

        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'resizeFotoUsuario');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'funcoes'));
    });

    test('email-sesNotification: preserva camelCase no nome', () => {
        const info = getLambdaInfo('novoerp-node-email-qas-sesNotification');

        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'sesNotification');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'email'));
    });

    test('nfse-api: pasta com hífen (não é sufixo de versão) e nome "api"', () => {
        const info = getLambdaInfo('novoerp-node-nfse-api-qas-api');

        assert.strictEqual(info.tipo, 'node');
        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'api');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'nfse-api'));
    });

    test('gtin-info: pasta com hífen e nome "api"', () => {
        const info = getLambdaInfo('novoerp-node-gtin-info-qas-api');

        assert.strictEqual(info.tipo, 'node');
        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'api');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'gtin-info'));
    });

    test('manifestacao-main: pasta e nome simples', () => {
        const info = getLambdaInfo('novoerp-node-manifestacao-qas-main');

        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'main');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'manifestacao'));
    });

    test('resize-image-dev-main: pasta com hífen e stage dev', () => {
        const info = getLambdaInfo('novoerp-node-resize-image-dev-main');

        assert.strictEqual(info.tipo, 'node');
        assert.strictEqual(info.stage, 'dev');
        assert.strictEqual(info.name, 'main');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'resize-image'));
    });

    test('java-danfe: resolve tipo java corretamente', () => {
        const info = getLambdaInfo('novoerp-java-danfe-qas-api');

        assert.strictEqual(info.tipo, 'java');
        assert.strictEqual(info.stage, 'qas');
        assert.strictEqual(info.name, 'api');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'java', 'danfe'));
    });

    test('fallback para índice 3 quando nenhum stage conhecido é encontrado', () => {
        const info = getLambdaInfo('novoerp-node-funcoes-xpto-sintegra');

        assert.strictEqual(info.stage, 'xpto');
        assert.strictEqual(info.name, 'sintegra');
        assert.strictEqual(info.cwd, path.join(LAMBDA_FOLDER, 'node', 'funcoes'));
    });
});
