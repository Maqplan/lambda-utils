'use strict';

/**
 * Serviço que encapsula a invocação de Lambda via AWS SDK.
 *
 * Esta é a ÚNICA parte do pacote acoplada ao SDK. O contrato público abaixo é IDÊNTICO
 * entre a linha 2.x / branch main (AWS SDK v3, este arquivo) e a linha 1.x (AWS SDK v2):
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
let InvokeCommand;
function getClient() {
    if (!client) {
        const sdk = require('@aws-sdk/client-lambda');
        InvokeCommand = sdk.InvokeCommand;
        client = new sdk.LambdaClient({ region: REGION });
    }
    return client;
}

// Normaliza a resposta do SDK v3 para o contrato comum (Payload é Uint8Array no v3).
function normalizarResposta(data) {
    return {
        StatusCode: data.StatusCode,
        FunctionError: data.FunctionError,
        Payload: data.Payload != null ? Buffer.from(data.Payload) : undefined,
    };
}

exports.invoke = (params) => getClient().send(new InvokeCommand(params)).then(normalizarResposta);
