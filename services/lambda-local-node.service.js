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
// `serverless invoke local` imprime o retorno da função como o ÚLTIMO valor JSON de nível
// superior no stdout, via `JSON.stringify(result, null, 4)`. Com essa indentação, o valor de
// topo começa na coluna 0 e o conteúdo aninhado fica recuado. Logs da própria função
// (ex.: console.log(event)) também caem no stdout, mas o retorno é sempre o ÚLTIMO bloco.
//
// Então, de trás para frente, pegamos a última linha que inicia um valor de topo ('{', '[' ou
// '"') e tentamos fazer JSON.parse do bloco dela até o fim; na falha, subimos para a candidata
// anterior. Isso cobre objeto, array e string (ex.: XML assinada / resposta SOAP) sem varredura
// caractere a caractere.
function extrairRetornoOffline(stdout) {
    const linhas = limparAnsi(stdout).replace(/\s+$/, '').split('\n');

    for (let i = linhas.length - 1; i >= 0; i--) {
        const inicio = linhas[i][0];
        if (inicio !== '{' && inicio !== '[' && inicio !== '"') continue;

        const bloco = linhas.slice(i).join('\n');
        try {
            JSON.parse(bloco);
            return bloco;
        } catch (e) {
            // bloco não é JSON válido começando aqui; tenta a candidata anterior
        }
    }

    return '';
}

// Invoca uma lambda Node localmente via `sls invoke local`.
// Contrato: invoke(info, payload) -> Promise<{ Payload: string }>
// O Payload é SEMPRE uma string (JSON/texto cru), igual ao serviço SDK e ao local-java,
// para os consumidores (ex.: tnfe-api) tratarem a resposta como texto sem precisar saber
// de onde a invocação veio.
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

        const json = extrairRetornoOffline(stdout) || '{}';
        // Retorna a string JSON crua (sem reserializar) para manter o contrato de Payload: string.
        // extrairRetornoOffline só retorna candidatos que já passaram por JSON.parse, então o texto é válido.
        return resolve({ Payload: json });
    });
});

// Exporta auxiliares para teste.
exports.extrairRetornoOffline = extrairRetornoOffline;
exports.montaComandoSlsLocal = montaComandoSlsLocal;
exports.resolveVersaoNode = resolveVersaoNode;
