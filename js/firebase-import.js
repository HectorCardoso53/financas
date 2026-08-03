/**
 * firebase-import.js
 * Responsável por salvar transações OFX no Firestore,
 * evitando duplicidade usando o FITID como ID do documento.
 *
 * Estrutura no Firestore:
 *   users/{uid}/transacoes/{FITID}
 *
 * Preparado para futuramente receber transações de qualquer origem
 * (OFX, Open Finance, etc.) sem alterar o restante da aplicação.
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Salva uma única transação no Firestore.
 * Usa o campo `id` (FITID sanitizado) como ID do documento.
 * Se o documento já existir, ignora e retorna false.
 *
 * @param {string} uid - UID do usuário
 * @param {object} transacao - Objeto de transação do OFX
 * @param {object} db - Instância do Firestore
 * @returns {Promise<boolean>} true = salvo, false = ignorado
 */
export async function salvarFirestore(uid, transacao, db) {
  const ref = doc(db, "users", uid, "transacoes", transacao.id);
  const snap = await getDoc(ref);

  if (snap.exists()) return false;

  await setDoc(ref, {
    id: transacao.id,
    tipo: transacao.tipo,
    valor: transacao.valor,
    data: transacao.data,
    timestamp: new Date(`${transacao.data}T12:00:00`),
    nome: transacao.nome,
    descricao: transacao.descricao,
    trntype: transacao.trntype,
    origem: transacao.origem,
    categoria: transacao.categoria,
    importado: transacao.importado,
    criadoEm: new Date(),
  });

  return true;
}

/**
 * Importa uma lista de transações para o Firestore.
 * Retorna um resumo da operação.
 *
 * @param {string} uid
 * @param {object[]} transacoes
 * @param {object} db
 * @returns {Promise<{novas: number, ignoradas: number, receitas: number, despesas: number, totalReceitas: number, totalDespesas: number}>}
 */
export async function importarTransacoes(uid, transacoes, db) {
  let novas = 0;
  let ignoradas = 0;
  let totalReceitas = 0;
  let totalDespesas = 0;

  for (const transacao of transacoes) {
    try {
      const salvo = await salvarFirestore(uid, transacao, db);
      if (salvo) {
        novas++;
        if (transacao.tipo === "receita") totalReceitas += transacao.valor;
        else totalDespesas += transacao.valor;
      } else {
        ignoradas++;
      }
    } catch (err) {
      console.error(`Erro ao salvar transação ${transacao.id}:`, err);
      ignoradas++;
    }
  }

  return {
    total: transacoes.length,
    novas,
    ignoradas,
    totalReceitas,
    totalDespesas,
    saldo: totalReceitas - totalDespesas,
  };
}

/**
 * Carrega todas as transações OFX importadas do Firestore
 * e as converte para o formato interno (incomes/expenses).
 *
 * @param {string} uid
 * @param {object} db
 * @returns {Promise<{incomes: object[], expenses: object[]}>}
 */
export async function carregarTransacoesOFX(uid, db) {
  const ref = collection(db, "users", uid, "transacoes");
  const snap = await getDocs(query(ref, orderBy("timestamp", "desc")));

  const incomes = [];
  const expenses = [];

  snap.forEach((docSnap) => {
    const t = docSnap.data();
    const base = {
      id: docSnap.id,
      description: t.descricao || t.nome,
      amount: t.valor,
      category: t.categoria || "outros",
      date: t.data,
      createdAt: t.criadoEm,
      importado: true,
      origem: t.origem,
    };

    if (t.tipo === "receita") {
      incomes.push(base);
    } else {
      expenses.push({ ...base, paid: true });
    }
  });

  return { incomes, expenses };
}
