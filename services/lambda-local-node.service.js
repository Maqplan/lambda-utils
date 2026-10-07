'use strict';

const execFile = require('child_process').execFile;
const path = require('path');
const fs = require('fs');

const MAX_BUFFER = 1024 * 500;

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

// Remove sequências ANSI que o serverless pode imprimir junto da resposta.
function limparAnsi(texto) {
    return (texto || '').replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

// Extrai o retorno real da invocação local a partir do stdout.
//
// Em execução local, uma lambda pode disparar outra (fire-and-forget): o `sls invoke` aninhado
// escreve seus próprios logs ("Executando lambda local...") e até seu próprio ---RETORNOOFFLINE---
// no MESMO stdout do processo pai. Por isso não dá para assumir que tudo após o primeiro marcador
// é JSON. O retorno real do pai é sempre o ÚLTIMO valor JSON (objeto/array) impresso no stdout.
// Varremos de trás para frente procurando o último JSON balanceado e válido.
function extrairRetornoOffline(stdout) {
    const texto = limparAnsi(stdout);

    for (let fim = texto.length; fim > 0; fim--) {
        const ch = texto[fim - 1];
        if (ch !== '}' && ch !== ']') continue;

        const abre = ch === '}' ? '{' : '[';
        let profundidade = 0;
        let dentroString = false;
        let escape = false;

        for (let ini = fim - 1; ini >= 0; ini--) {
            const c = texto[ini];

            if (dentroString) {
                if (escape) { escape = false; continue; }
                if (c === '\\') { escape = true; continue; }
                if (c === '"') dentroString = false;
                continue;
            }

            if (c === '"') { dentroString = true; continue; }
            if (c === ch) profundidade++;
            else if (c === abre) {
                profundidade--;
                if (profundidade === 0) {
                    const candidato = texto.slice(ini, fim);
                    try {
                        JSON.parse(candidato);
                        return candidato;
                    } catch (e) {
                        // não é um JSON válido terminando aqui; continua procurando mais atrás
                        break;
                    }
                }
            }
        }
    }

    return '';
}

// Invoca uma lambda Node localmente via `sls invoke local`.
// Contrato: invoke(info, payload) -> Promise<{ Payload: object }>
exports.invoke = (info, payload) => new Promise((resolve, reject) => {
    const comandoExec = montaComandoSlsLocal(info, payload);
    console.log(`Executando lambda local: ${comandoExec.descricao}`);

    const envExec = { ...process.env, SLS_LOCAL_DATA: payload };

    execFile(comandoExec.file, comandoExec.args, {
        cwd: info.cwd,
        env: envExec,
        maxBuffer: MAX_BUFFER,
    }, (error, stdout, stderr) => {
        if (error) {
            const json = extrairRetornoOffline(stdout);
            if (!json) return reject(new Error(stderr));

            let response = JSON.parse(json);
            if (response.errorMessage && typeof response.errorMessage === 'object') {
                response = response.errorMessage;
            }
            return reject(new Error(response.message || response.errorMessage));
        }

        try {
            const json = extrairRetornoOffline(stdout) || '{}';
            return resolve({ Payload: JSON.parse(json) });
        } catch (e) {
            e.message = `Erro ao fazer parse na resposta: ${e.message}\n\nResposta: ${stdout}`;
            return reject(e);
        }
    });
});

// Exporta auxiliares para teste.
exports.extrairRetornoOffline = extrairRetornoOffline;
exports.montaComandoSlsLocal = montaComandoSlsLocal;
exports.resolveVersaoNode = resolveVersaoNode;
