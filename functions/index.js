const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");
require("dotenv").config();

initializeApp();

// 🔐 Configuração do Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_PASSWORD,
  },
});

// =====================================================
// ⏰ VERIFICA DESPESAS PRÓXIMAS E NO DIA DO VENCIMENTO
// =====================================================
exports.checkDueExpenses = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "America/Manaus",
  },
  async () => {
    const db = getFirestore();

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split("T")[0];
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;

      const expensesSnap = await db
        .collection("users")
        .doc(userId)
        .collection("expenses")
        .where("paid", "==", false)
        .get();

      if (expensesSnap.empty) continue;

      const userRecord = await getAuth().getUser(userId);
      const userEmail = userRecord.email;

      let dueTomorrow = [];
      let dueToday = [];

      expensesSnap.forEach((doc) => {
        const expense = doc.data();

        if (expense.dueDate === tomorrowStr) {
          dueTomorrow.push(expense);
        }

        if (expense.dueDate === todayStr) {
          dueToday.push(expense);
        }
      });

      // 🔔 1 DIA ANTES
      if (dueTomorrow.length > 0) {
        let message = "⚠️ Você tem despesas vencendo AMANHÃ:\n\n";

        dueTomorrow.forEach((expense) => {
          message += `• ${expense.description} - R$ ${expense.amount}\n`;
        });

        await transporter.sendMail({
          from: process.env.GMAIL_EMAIL,
          to: userEmail,
          subject: "⚠️ Despesa vence amanhã",
          text: message,
        });

        console.log("Aviso de vencimento amanhã enviado para:", userEmail);
      }

      // 🔴 NO DIA DO VENCIMENTO
      if (dueToday.length > 0) {
        let message = "🚨 Suas despesas vencem HOJE:\n\n";

        dueToday.forEach((expense) => {
          message += `• ${expense.description} - R$ ${expense.amount}\n`;
        });

        await transporter.sendMail({
          from: process.env.GMAIL_EMAIL,
          to: userEmail,
          subject: "🚨 Despesa vence HOJE",
          text: message,
        });

        console.log("Aviso de vencimento HOJE enviado para:", userEmail);
      }
    }
  }
);

// =====================================================
// 🎤 ENTRADA POR VOZ — Atalho iPhone (Siri Shortcuts)
// =====================================================

async function parseWithAI(text) {
  const prompt = `Você é um assistente financeiro. Analise o texto abaixo e extraia os dados da transação.

Texto: "${text}"

Responda APENAS com JSON válido, sem explicação, no formato:
{"type":"expense","amount":2.00,"description":"Pão","category":"alimentacao"}

Regras:
- type: "expense" para despesas (compras, gastos, pagamentos) ou "income" para receitas (salário, ganhos)
- amount: valor numérico em reais (converta valores escritos: "dois" = 2, "vinte e cinco" = 25, "meia bala" = 0.50)
- description: o que foi comprado/recebido, capitalizado, sem verbos e sem valores
- category para expense: alimentacao, transporte, moradia, lazer, saude, educacao, outros
- category para income: salario, freelance, investimentos, outros
- Se não identificar valor numérico, retorne: {"error":"sem valor"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  return JSON.parse(data.content[0].text.trim());
}

exports.voiceEntry = onRequest({ region: "us-central1", timeoutSeconds: 30 }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET, POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const params = req.method === "POST" ? req.body : req.query;
  const { uid, token, text } = params;

  if (!uid || !token || !text) {
    res.status(400).send("Erro: parâmetros uid, token e text são obrigatórios.");
    return;
  }

  const db = getFirestore();
  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists || userDoc.data().voiceToken !== token) {
    res.status(401).send("Erro: token inválido.");
    return;
  }

  let result;
  try {
    result = await parseWithAI(text);
  } catch {
    res.status(500).send("Erro ao interpretar o texto. Tente novamente.");
    return;
  }

  if (result.error || !result.amount || result.amount <= 0) {
    res.status(422).send(`Não entendi o valor em "${text}". Diga o valor, ex: "comprei pão dois reais".`);
    return;
  }

  const collectionName = result.type === "income" ? "incomes" : "expenses";
  const dateStr = new Date().toISOString().split("T")[0];

  const data = {
    description: result.description,
    amount: result.amount,
    category: result.category,
    date: dateStr,
    createdAt: new Date(),
  };

  if (result.type === "expense") {
    data.dueDate = dateStr;
    data.paid = false;
  }

  await db.collection("users").doc(uid).collection(collectionName).add(data);

  const typeLabel = result.type === "income" ? "Receita" : "Despesa";
  const valor = result.amount.toFixed(2).replace(".", ",");
  res.send(`${typeLabel} salva!\n${result.description} — R$ ${valor}`);
});
