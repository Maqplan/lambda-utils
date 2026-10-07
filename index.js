const lambdaService = require('./services/lambda.service');
const lambdaLocalService = require('./services/lambda-local.service');

const AMBIENTE = (process.env.LAMBDA_ENV || process.env.NODE_ENV || process.env.STAGE || '').replace('development', 'dev');

function ehLocal() {
    return !!(process.env.IS_LOCAL || process.env.LOCAL_LAMBDA || AMBIENTE === 'development' || AMBIENTE === 'qualidade' || AMBIENTE === 'dev');
}

exports.log = (info, msg) => {
    console.log(msg ? msg : 'Received event:', JSON.stringify(info, null, 2));
};

exports.init = (event, context, waitEventLoop) => {
    exports.log(event);
    context.callbackWaitsForEmptyEventLoop = !!waitEventLoop;
    global.lambdaFunctionName = context.functionName;
};

exports.montaNomeFuncao = (servico, funcao, ambiente) => `${servico}-${ambiente || AMBIENTE}-${funcao}`;

exports.invokeLambdaServico = (servico, funcao, payload, callback) => {
    const params = {
        FunctionName: exports.montaNomeFuncao(servico, funcao),
        Payload: JSON.stringify(payload),
    };
    exports.invokeLambda(params, callback);
};

exports.invokeLambdaServicoEvento = (servico, funcao, payload, callback) => {
    const params = {
        FunctionName: exports.montaNomeFuncao(servico, funcao),
        Payload: JSON.stringify(payload),
        InvocationType: 'Event',
    };
    exports.invokeLambda(params, callback);
};

exports.invokeLambda = (params, callback) => {
    const service = ehLocal() ? lambdaLocalService : lambdaService;
    return service.invoke(params).then((data) => {
        callback(null, data);
    }, (err) => {
        callback(err);
    });
};
