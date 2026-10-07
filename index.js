const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const execFile = require('child_process').execFile;
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const async = require('async');

const lambda = new LambdaClient({ region: 'us-east-1' });

const AMBIENTE = (process.env.LAMBDA_ENV || process.env.NODE_ENV || process.env.STAGE || '').replace('development', 'dev');

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
    if (process.env.IS_LOCAL || process.env.LOCAL_LAMBDA || AMBIENTE === 'development' || AMBIENTE === 'qualidade' || AMBIENTE === 'dev') {
        return lambdaLocal(params, callback);
    }
    return lambda.send(new InvokeCommand(params)).then((data) => {
        if (data.Payload) {
            data.Payload = Buffer.from(data.Payload);
        }
        callback(null, data);
    }, (err) => {
        callback(err);
    });
};

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

function lambdaLocal(params, callback) {
    const info = getLambdaInfo(params.FunctionName);

    switch (info.tipo) {
        case 'node':
            return lambdaLocalNode(params, info, callback);
        case 'java':
            return lambdaLocalJava(params, info, callback);
        default:
            throw new Error('Tipo de lambda local inválido!');
    }
}

// Descobre a versão de Node desejada para a lambda a partir do .nvmrc da pasta (ou da variável
// NOVOERP_LAMBDA_NODE), e monta o comando que roda o `sls invoke local` sob essa versão via nvm.
// Se o nvm não estiver disponível, cai no comportamento antigo (executa `sls` diretamente).
function resolveVersaoNode(info) {
    if (process.env.NOVOERP_LAMBDA_NODE) return process.env.NOVOERP_LAMBDA_NODE.trim();
    try {
        const nvmrc = fs.readFileSync(path.join(info.cwd, '.nvmrc'), 'utf8').trim();
        if (nvmrc) return nvmrc;
    } catch (e) { /* sem .nvmrc: usa o default abaixo */ }
    return '20';
}

function montaComandoSlsLocal(info, payload) {
    // O payload é lido de SLS_LOCAL_DATA (passado no env) para não precisar escapar no shell.
    const argsSls = `invoke local -f ${info.name} --stage ${info.stage} --data "$SLS_LOCAL_DATA"`;

    const nvmDir = process.env.NVM_DIR || path.join(process.env.HOME || '', '.nvm');
    const nvmSh = path.join(nvmDir, 'nvm.sh');

    if (fs.existsSync(nvmSh)) {
        const versao = resolveVersaoNode(info);
        // bash não-interativo que carrega o nvm, seleciona a versão da lambda e roda o sls dessa versão.
        const script = `. "${nvmSh}" >/dev/null 2>&1; nvm use ${versao} >/dev/null 2>&1; exec sls ${argsSls}`;
        return {
            file: 'bash',
            args: ['-c', script],
            descricao: `nvm use ${versao} && sls ${argsSls} (cwd: ${info.cwd})`,
        };
    }

    // Fallback: sem nvm, executa o sls herdado do PATH atual.
    return {
        file: 'sls',
        args: ['invoke', 'local', '-f', info.name, '--stage', info.stage, '--data', payload],
        descricao: `${path.join(info.cwd, 'sls')} invoke local -f ${info.name}`,
    };
}

function extrairRetornoOffline(stdout) {
    const partes = (stdout || '').split('---RETORNOOFFLINE---');
    const bruto = (partes[1] || '').trim();
    // Remove sequências ANSI que o serverless pode imprimir junto da resposta.
    return bruto.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function lambdaLocalNode(params, info, callback = () => {}) {
    // A ERP pode rodar em uma versão de Node diferente da lambda (ex.: ERP em 14, lambda em 20.x).
    // Resolvemos a versão alvo pelo .nvmrc da pasta da lambda e executamos o `sls` sob essa versão
    // via nvm, sem alterar o Node em que a ERP está rodando. O payload vai por variável de ambiente
    // (SLS_LOCAL_DATA) para evitar problemas de escape/segurança ao montar o comando do shell.
    const comandoExec = montaComandoSlsLocal(info, params.Payload);
    console.log(`Executando lambda local: ${comandoExec.descricao}`);

    const envExec = { ...process.env, SLS_LOCAL_DATA: params.Payload };

    execFile(comandoExec.file, comandoExec.args, {
        cwd: info.cwd,
        env: envExec,
        maxBuffer: 1024 * 500,
    }, (error, stdout, stderr) => {
        if (error) {
            const json = extrairRetornoOffline(stdout);
            if (!json) return callback(new Error(stderr));

            let response = JSON.parse(json);
            if (response.errorMessage && typeof response.errorMessage === 'object') {
                response = response.errorMessage;
            }
            return callback(new Error(response.message || response.errorMessage));
        }

        try {
            const json = extrairRetornoOffline(stdout) || '{}';
            return callback(null, { Payload: JSON.parse(json) });
        } catch (e) {
            e.message = `Erro ao fazer parse na resposta: ${e.message}\n\nResposta: ${stdout}`;
            return callback(e);
        }
    });
}

// java -cp target/api-dev.jar avanco.lambda.nfe.LambdaFunctionHandler
function lambdaLocalJava(params, info, callback = () => {}) {
    async.waterfall([
        (next) => {
            try {
                const doc = yaml.safeLoad(fs.readFileSync(path.join(info.cwd, 'serverless.yml'), 'utf8'));
                next(null, doc.functions[info.name].handler);
            } catch (e) {
                next(e);
            }
        },
        (classHandler, next) => {
            if (fs.existsSync(path.join(info.cwd, `target/${info.name}.jar`))) {
                return next(null, classHandler);
            }
            execFile('mvn', ['package'], {
                cwd: info.cwd,
                maxBuffer: 1024 * 500,
            }, (error) => {
                if (error) return next(error);
                next(null, classHandler);
            });
        },
        (classHandler, next) => {
            const paramsExec = ['-cp', `target/${info.name}.jar`, classHandler, params.Payload];
            let exec = 'java';
            if (info.stage === 'qualidade' && fs.existsSync(`/u/java/jdk1.8/bin/${exec}`)) {
                exec = `/u/java/jdk1.8/bin/${exec}`;
            }
            console.log(`Executando lambda local: ${path.join(info.cwd, exec)} ${paramsExec.join(' ')}`);

            const env = { ...process.env };
            let envFile;

            if (fs.existsSync(path.join(info.cwd, '../../config.js'))) {
                envFile = require(path.join(info.cwd, '../../config.js'))(info.stage);
                Object.assign(env, envFile.env);
            } else if (fs.existsSync(path.join(info.cwd, '../../env.js'))) {
                envFile = require(path.join(info.cwd, '../../env.js'))(info.stage);
                Object.assign(env, envFile);
            } else {
                return next(new Error('Arquivo de configuração da lambda (config.js|env.js) não encontrado!'));
            }

            Object.assign(env, envFile.env);

            execFile(exec, paramsExec, {
                cwd: info.cwd,
                env,
                maxBuffer: 1024 * 500,
            }, (error, stdout, stderr) => {
                if (error) return callback(new Error(stderr));
                try {
                    const response = (stdout.split('---RETORNOOFFLINE---')[1] || '').trim();
                    return next(null, { Payload: response });
                } catch (e) {
                    e.message = `Erro ao fazer parse na resposta: ${e.message}\n\nResposta: ${stdout}`;
                    return callback(e);
                }
            });
        },
    ], (err, result) => {
        callback(err, result);
    });
}
