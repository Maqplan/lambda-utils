'use strict';

const path = require('path');

const nodeService = require('./lambda-local-node.service');
const javaService = require('./lambda-local-java.service');

const AMBIENTE = (process.env.LAMBDA_ENV || process.env.NODE_ENV || process.env.STAGE || '').replace('development', 'dev');

// Resolve a pasta/stage/nome/tipo da lambda a partir do nome da função
// (ex.: "novoerp-node-funcoes-production-sintegra").
function getLambdaInfo(fnName) {
    const fnNameSplited = fnName.split('-');
    const tipo = fnNameSplited[1];
    const fnFolder = fnNameSplited[2];
    let stage = fnNameSplited[3];
    if (stage === 'development') stage = 'dev';

    let cwd;
    if (process.env.NOVOERP_LAMBDA_FOLDER) {
        cwd = path.join(process.env.NOVOERP_LAMBDA_FOLDER, tipo, fnFolder);
    } else if (process.env.IS_LOCAL) { // Chamada de lambda
        if (process.env.IS_ROOT) {
            if (tipo === 'java') {
                cwd = path.join(process.cwd(), '..', '..', tipo, fnFolder);
            } else {
                cwd = process.cwd();
            }
        } else {
            cwd = path.join(process.cwd(), '..');
            if (path.basename(cwd) === 'node' || path.basename(cwd) === 'java') {
                cwd = process.cwd();
            }
        }
    } else if (AMBIENTE === 'development' || AMBIENTE === 'dev' || process.env.LOCAL_LAMBDA === 'true') {
        cwd = path.join(process.cwd(), '..', 'lambda', tipo, fnFolder);
    } else {
        cwd = path.join(process.cwd(), 'lambda', tipo, fnFolder);
    }

    fnNameSplited.splice(0, 4);

    return {
        cwd,
        stage,
        name: fnNameSplited.join('-'),
        tipo,
    };
}

// Invoca a lambda localmente, roteando por tipo (node/java).
// Contrato: invoke(params) -> Promise<{ Payload }>
exports.invoke = (params) => {
    const info = getLambdaInfo(params.FunctionName);

    switch (info.tipo) {
        case 'node':
            return nodeService.invoke(info, params.Payload);
        case 'java':
            return javaService.invoke(info, params.Payload);
        default:
            return Promise.reject(new Error('Tipo de lambda local inválido!'));
    }
};

exports.getLambdaInfo = getLambdaInfo;
