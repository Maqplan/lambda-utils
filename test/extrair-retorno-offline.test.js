'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { extrairRetornoOffline } = require('../services/lambda-local-node.service');

describe('extrairRetornoOffline', () => {
    test('objeto JSON no fim do stdout', () => {
        const stdout = 'log qualquer\n{\n    "ok": true,\n    "n": 1\n}\n';
        assert.deepStrictEqual(JSON.parse(extrairRetornoOffline(stdout)), { ok: true, n: 1 });
    });

    test('array JSON no fim do stdout', () => {
        const stdout = 'ruído\n[1,2,3]\n';
        assert.deepStrictEqual(JSON.parse(extrairRetornoOffline(stdout)), [1, 2, 3]);
    });

    test('string JSON (XML assinada) no fim do stdout', () => {
        // serverless imprime um retorno-string como literal JSON entre aspas.
        const xml = '<NFe><infNFe Id="NFe53..."></infNFe></NFe>';
        const stdout = 'Executando...\n' + JSON.stringify(xml) + '\n';
        const candidato = extrairRetornoOffline(stdout);
        assert.strictEqual(JSON.parse(candidato), xml);
    });

    test('regressão assinarXml: evento ecoado + retorno-string => pega a string', () => {
        // O handler loga o evento (objeto) e depois o serverless imprime o retorno (string XML).
        // O extrator deve pegar o ÚLTIMO valor (a string), não o objeto do log.
        const evento = { operacao: 'assinarXml', xml: '<NFe/>', elemento: 'infNFe', parametro: 'Id' };
        const xmlAssinado = '<NFe><Signature>abc</Signature></NFe>';
        const stdout =
            'Serverless: Invoke...\n' +
            JSON.stringify(evento, null, 4) + '\n' +
            JSON.stringify(xmlAssinado, null, 4) + '\n';
        const candidato = extrairRetornoOffline(stdout);
        assert.strictEqual(JSON.parse(candidato), xmlAssinado);
    });

    test('string com aspas escapadas é extraída corretamente', () => {
        const valor = 'texto com "aspas" e \\ barra';
        const stdout = 'ruído\n' + JSON.stringify(valor) + '\n';
        assert.strictEqual(JSON.parse(extrairRetornoOffline(stdout)), valor);
    });

    test('sem JSON válido retorna string vazia', () => {
        assert.strictEqual(extrairRetornoOffline('apenas logs, sem retorno\n'), '');
    });
});
