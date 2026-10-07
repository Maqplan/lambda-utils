'use strict';

/**
 * Serviço que encapsula a invocação de Lambda via AWS SDK.
 *
 * Esta é a ÚNICA parte do pacote acoplada ao SDK. O contrato público abaixo é IDÊNTICO
 * entre a linha 1.x (AWS SDK v2, este arquivo) e a linha 2.x / branch main (AWS SDK v3):
 * assim o index.js e os consumidores não mudam entre as versões, evitando conflitos de merge.
 *
 * Contrato:
 *   invoke(params) -> Promise<{ Payload?: Buffer, FunctionError?: string, StatusCode?: number }>
 *   - params: { FunctionName, Payload (string), InvocationType? }
 *   - Payload de retorno é SEMPRE um Buffer (ou undefined), independente do SDK.
 */

const REGION = 'us-east-1';

// Carregamento sob demanda (lazy): o pacote continua carregável mesmo quando só o modo
// local é usado e o SDK não é necessário.
let client;
function getClient() {
    if (!client) {
        const AWS = require('aws-sdk');
        client = new AWS.Lambda({ region: REGION });
    }
    return client;
}

// Normaliza a resposta do SDK v2 para o contrato comum.
function normalizarResposta(data) {
    return {
        StatusCode: data.StatusCode,
        FunctionError: data.FunctionError,
        Payload: data.Payload != null ? Buffer.from(data.Payload) : undefined,
    };
}

exports.invoke = (params) => getClient().invoke(params).promise().then(normalizarResposta);
