'use strict';

const execFile = require('child_process').execFile;
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const async = require('async');

const MAX_BUFFER = 1024 * 500;

// Invoca uma lambda Java localmente (compila com mvn se necessário e executa via java -cp).
// Contrato: invoke(info, payload) -> Promise<{ Payload: string }>
exports.invoke = (info, payload) => new Promise((resolve, reject) => {
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
                maxBuffer: MAX_BUFFER,
            }, (error) => {
                if (error) return next(error);
                next(null, classHandler);
            });
        },
        (classHandler, next) => {
            const paramsExec = ['-cp', `target/${info.name}.jar`, classHandler, payload];
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
                maxBuffer: MAX_BUFFER,
            }, (error, stdout, stderr) => {
                if (error) return reject(new Error(stderr));
                try {
                    const response = (stdout.split('---RETORNOOFFLINE---')[1] || '').trim();
                    return next(null, { Payload: response });
                } catch (e) {
                    e.message = `Erro ao fazer parse na resposta: ${e.message}\n\nResposta: ${stdout}`;
                    return reject(e);
                }
            });
        },
    ], (err, result) => {
        if (err) return reject(err);
        resolve(result);
    });
});
