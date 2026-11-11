'use strict';
/**
 * Resolução do nome da função para invocação cross-account.
 *
 * Arquivo idêntico entre a linha 1.x (AWS SDK v2) e a linha 2.x / branch main (AWS SDK v3).
 *
 * Quando LAMBDA_ACCOUNT_ID está definido, o nome simples da função é convertido em ARN completo
 * da conta onde as lambdas estão publicadas. Sem a variável, o nome simples é mantido e o SDK
 * resolve a função na conta das credenciais atuais (comportamento anterior).
 */
const REGION = 'us-east-1';

// Lido a cada chamada (e não no carregamento do módulo) para respeitar variáveis
// carregadas depois do require do pacote (ex.: dotenv).
function contaLambdas() {
    return (process.env.LAMBDA_ACCOUNT_ID || '').trim();
}

// Converte o nome simples da função em ARN completo, a menos que já seja um ARN.
function resolverFunctionName(nome) {
    const conta = contaLambdas();
    if (!conta || !nome || nome.startsWith('arn:')) return nome;
    return `arn:aws:lambda:${REGION}:${conta}:function:${nome}`;
}

exports.REGION = REGION;
exports.contaLambdas = contaLambdas;
exports.resolverFunctionName = resolverFunctionName;
