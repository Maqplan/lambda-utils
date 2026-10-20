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
// é JSON. O retorno real do pai é sempre o ÚLTIMO valor JSON impresso no stdout
// (`serverless invoke local` imprime `JSON.stringify(result)`), que pode ser objeto `{}`,
// array `[]` OU string `"..."` (ex.: assinarXml/autorizacao/consulta retornam XML como string).
// Varremos de trás para frente procurando o último valor JSON balanceado e válido.
function extrairRetornoOffline(stdout) {
    const texto = limparAnsi(stdout);

    for (let fim = texto.length; fim > 0; fim--) {
        const ch = texto[fim - 1];

        // Caso 1: objeto/array JSON terminando em '}' ou ']'.
        if (ch === '}' || ch === ']') {
            const candidato = extrairObjetoOuArray(texto, fim, ch);
            if (candidato !== null) return candidato;
            continue;
        }

        // Caso 2: string JSON terminando em '"' (retorno-string da lambda, ex.: XML assinada).
        if (ch === '"') {
            const candidato = extrairString(texto, fim);
            if (candidato !== null) return candidato;
            continue;
        }
    }

    return '';
}

// Dado que texto[fim-1] é '}' ou ']', tenta extrair o objeto/array balanceado que termina em `fim`.
// Retorna a substring (string JSON válida) ou null se não casar aqui.
function extrairObjetoOuArray(texto, fim, ch) {
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
                    return null;
                }
            }
        }
    }

    return null;
}

// Dado que texto[fim-1] é '"', procura a aspa de abertura não escapada e valida como string JSON.
// Retorna a substring (string JSON válida, ex.: "\"<NFe...>\"") ou null se não casar aqui.
function extrairString(texto, fim) {
    for (let ini = fim - 2; ini >= 0; ini--) {
        if (texto[ini] !== '"') continue;

        // Conta as barras invertidas imediatamente antes desta aspa; se for número ímpar, a aspa
        // está escapada e não é a abertura.
        let barras = 0;
        for (let k = ini - 1; k >= 0 && texto[k] === '\\'; k--) barras++;
        if (barras % 2 === 1) continue;

        const candidato = texto.slice(ini, fim);
        try {
            const valor = JSON.parse(candidato);
            if (typeof valor === 'string') return candidato;
            return null;
        } catch (e) {
            // aspa de abertura candidata não produziu string válida; continua procurando mais atrás
        }
    }

    return null;
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
