'use strict';

const path = require('path');

const nodeService = require('./lambda-local-node.service');
const javaService = require('./lambda-local-java.service');

const AMBIENTE = (process.env.LAMBDA_ENV || process.env.NODE_ENV || process.env.STAGE || '').replace('development', 'dev');

// Stages do mapa `custom.scope` dos serverless.yml, usados como âncora para separar
// pasta e função no nome da lambda.
const STAGES_CONHECIDOS = ['dev', 'qas', 'production', 'pecarara'];

// O nome da lambda segue `novoerp-<tipo>-<pasta...>-<stage>-<funcao...>` (ver montaNomeFuncao).
// Pasta e função podem conter hifens, então o stage é o único índice confiável.
function encontrarIndiceStage(segmentos) {
    for (let i = 3; i < segmentos.length; i++) {
        if (STAGES_CONHECIDOS.includes(segmentos[i])) return i;
    }
    return 3;
}

// A pasta física ignora um sufixo de versão do serviço (ex.: "nfe4-v2" -> pasta "nfe4").
function resolverPasta(segmentosPasta) {
    const segmentos = [...segmentosPasta];
    if (segmentos.length > 1 && /^v\d+$/.test(segmentos[segmentos.length - 1])) {
        segmentos.pop();
    }
    return segmentos.join('-');
}

function resolverCwd(tipo, fnFolder) {
    if (process.env.NOVOERP_LAMBDA_FOLDER) {
        return path.join(process.env.NOVOERP_LAMBDA_FOLDER, tipo, fnFolder);
    }
    if (process.env.IS_LOCAL) {
        if (process.env.IS_ROOT) {
            if (tipo === 'java') return path.join(process.cwd(), '..', '..', tipo, fnFolder);
            return process.cwd();
        }
        const pai = path.join(process.cwd(), '..');
        if (path.basename(pai) === 'node' || path.basename(pai) === 'java') return process.cwd();
        return pai;
    }
    if (AMBIENTE === 'dev' || process.env.LOCAL_LAMBDA === 'true') {
        return path.join(process.cwd(), '..', 'lambda', tipo, fnFolder);
    }
    return path.join(process.cwd(), 'lambda', tipo, fnFolder);
}

function getLambdaInfo(fnName) {
    const segmentos = fnName.split('-');
    const tipo = segmentos[1];
    const stageIndex = encontrarIndiceStage(segmentos);

    const fnFolder = resolverPasta(segmentos.slice(2, stageIndex));
    const stage = segmentos[stageIndex];
    const name = segmentos.slice(stageIndex + 1).join('-');

    return {
        cwd: resolverCwd(tipo, fnFolder),
        stage,
        name,
        tipo,
    };
}

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
