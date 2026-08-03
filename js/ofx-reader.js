/**
 * ofx-reader.js
 * Responsável por ler e interpretar arquivos OFX do Banco do Brasil.
 * Suporta tanto formato SGML (sem tags de fechamento) quanto XML.
 */

/**
 * Lê o conteúdo bruto do arquivo OFX e retorna o texto.
 * @param {File} arquivo - Objeto File do input
 * @returns {Promise<string>}
 */
export function lerOFX(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo) return reject(new Error("Nenhum arquivo selecionado."));

    const extensao = arquivo.name.split(".").pop().toLowerCase();
    if (extensao !== "ofx") return reject(new Error("Arquivo inválido. Selecione um arquivo .ofx"));

    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo. Tente novamente."));
    reader.readAsText(arquivo, "windows-1252");
  });
}

/**
 * Converte a data no formato OFX para YYYY-MM-DD.
 * Formato de entrada: 20260803000000[-3:BRT] ou 20260803000000
 * @param {string} dtposted
 * @returns {string} YYYY-MM-DD
 */
export function converterDataOFX(dtposted) {
  const match = String(dtposted).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) throw new Error(`Data OFX inválida: ${dtposted}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Extrai o valor de uma tag OFX dentro de um bloco de texto.
 * Funciona para SGML (sem fechamento) e XML (com fechamento).
 * @param {string} bloco
 * @param {string} tag
 * @returns {string}
 */
function extrairTag(bloco, tag) {
  const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
  const match = bloco.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Converte um bloco STMTTRN em objeto de transação JS.
 * @param {string} bloco - Conteúdo entre <STMTTRN> e </STMTTRN>
 * @returns {object|null}
 */
function parsearBloco(bloco) {
  const trntype = extrairTag(bloco, "TRNTYPE");
  const dtposted = extrairTag(bloco, "DTPOSTED");
  const trnamt = extrairTag(bloco, "TRNAMT");
  const fitid = extrairTag(bloco, "FITID");
  const name = extrairTag(bloco, "NAME");
  const memo = extrairTag(bloco, "MEMO");

  if (!fitid || !trnamt || !dtposted) return null;

  const valor = Math.abs(parseFloat(trnamt.replace(",", ".")));
  if (isNaN(valor) || valor <= 0) return null;

  const tipo = trntype.toUpperCase() === "CREDIT" ? "receita" : "despesa";

  let data;
  try {
    data = converterDataOFX(dtposted);
  } catch {
    return null;
  }

  // Remove pontos e barras do FITID para usar como ID Firestore
  const id = fitid.replace(/[.\\/\s]/g, "");

  return {
    id,
    tipo,
    valor,
    data,
    nome: name || "Sem nome",
    descricao: memo || name || "Sem descrição",
    trntype: trntype.toUpperCase(),
    origem: "Banco do Brasil",
    categoria: "",
    importado: true,
  };
}

/**
 * Extrai todas as transações do texto OFX.
 * @param {string} texto - Conteúdo bruto do arquivo OFX
 * @returns {object[]} Array de transações
 */
export function extrairTransacoes(texto) {
  if (!texto || texto.trim().length === 0) {
    throw new Error("Arquivo OFX vazio ou corrompido.");
  }

  // Tenta XML primeiro (com tags de fechamento)
  const regexXML = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let blocos = [];
  let match;

  while ((match = regexXML.exec(texto)) !== null) {
    blocos.push(match[1]);
  }

  // Fallback: formato SGML (sem tags de fechamento)
  if (blocos.length === 0) {
    const partes = texto.split(/<STMTTRN>/i).slice(1);
    blocos = partes.map((parte) => {
      const fimIdx = parte.search(/<\/STMTTRN>|<STMTTRN>/i);
      return fimIdx >= 0 ? parte.slice(0, fimIdx) : parte;
    });
  }

  if (blocos.length === 0) {
    throw new Error("Nenhuma movimentação encontrada no arquivo OFX.");
  }

  return blocos.map(parsearBloco).filter(Boolean);
}
