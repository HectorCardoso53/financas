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

function inferCategory(description, type) {
  const lower = description.toLowerCase();
  if (type === "expense") {
    if (/mercado|supermercado|pão|comida|almoço|jantar|lanche|restaurante|pizza|hamburguer|açougue|hortifruti|leite|frango|carne|arroz|feijão|padaria|sorvete/.test(lower)) return "alimentacao";
    if (/uber|ônibus|onibus|metrô|metro|combustível|combustivel|gasolina|passagem|táxi|taxi|estacionamento|posto/.test(lower)) return "transporte";
    if (/aluguel|condomínio|condominio|luz|água|agua|internet|gás|gas|iptu|energia|conta/.test(lower)) return "moradia";
    if (/cinema|netflix|spotify|jogo|show|teatro|bar|balada|streaming/.test(lower)) return "lazer";
    if (/médico|medico|remédio|remedio|farmácia|farmacia|hospital|plano|dentista|consulta|exame/.test(lower)) return "saude";
    if (/curso|livro|escola|faculdade|material|apostila|mensalidade|aula/.test(lower)) return "educacao";
    return "outros";
  } else {
    if (/salário|salario/.test(lower)) return "salario";
    if (/freelance|bico|serviço|servico|trabalho|projeto/.test(lower)) return "freelance";
    if (/dividendo|investimento|rendimento|juros|fundo/.test(lower)) return "investimentos";
    return "outros";
  }
}

function extractAmount(lower) {
  const halfMatch = lower.match(/(\d+)\s*reais?\s*e\s*meio/);
  if (halfMatch) return { value: parseFloat(halfMatch[1]) + 0.5, matched: halfMatch[0] };

  const centsMatch = lower.match(/(\d+)\s*reais?\s*e\s*(\d+)\s*centavos?/);
  if (centsMatch) {
    return {
      value: parseFloat(centsMatch[1]) + parseFloat(centsMatch[2]) / 100,
      matched: centsMatch[0],
    };
  }

  const reaisMatch = lower.match(/(\d+(?:[,\.]\d{1,2})?)\s*(?:reais?|real)/);
  if (reaisMatch) return { value: parseFloat(reaisMatch[1].replace(",", ".")), matched: reaisMatch[0] };

  const numMatch = lower.match(/(\d+(?:[,\.]\d{1,2})?)/);
  if (numMatch) return { value: parseFloat(numMatch[1].replace(",", ".")), matched: numMatch[0] };

  return null;
}

function parseVoiceText(text) {
  const lower = text.toLowerCase().trim();

  const expenseWords = ["comprei", "gastei", "paguei", "debitou", "saiu", "devo"];
  const incomeWords = ["recebi", "ganhei", "entrou", "caiu"];

  let type = null;
  for (const word of expenseWords) {
    if (lower.includes(word)) { type = "expense"; break; }
  }
  if (!type) {
    for (const word of incomeWords) {
      if (lower.includes(word)) { type = "income"; break; }
    }
  }
  if (!type) return null;

  const extracted = extractAmount(lower);
  if (!extracted || extracted.value <= 0) return null;

  const { value: amount, matched: amountStr } = extracted;

  const triggerPattern = [...expenseWords, ...incomeWords].join("|");
  const escapedAmount = amountStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let description = lower
    .replace(new RegExp(`\\b(${triggerPattern})\\b`, "g"), "")
    .replace(new RegExp(escapedAmount, "i"), "")
    .replace(/\breais?\b/gi, "")
    .replace(/\b(de|do|da|no|na|nos|nas|num|numa|em|por|pro|pra|um|uma|o|a|os|as)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!description) description = type === "expense" ? "Despesa" : "Receita";
  description = description.charAt(0).toUpperCase() + description.slice(1);

  return { type, amount, description, category: inferCategory(description, type) };
}

exports.voiceEntry = onRequest({ region: "us-central1" }, async (req, res) => {
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
    res.status(400).json({ error: "Parâmetros obrigatórios: uid, token, text" });
    return;
  }

  const db = getFirestore();
  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists || userDoc.data().voiceToken !== token) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const result = parseVoiceText(text);
  if (!result) {
    res.status(422).json({ error: `Não entendi "${text}". Tente: comprei pão 2 reais` });
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
  res.json({
    ok: true,
    message: `${typeLabel} salva: ${result.description} — R$ ${result.amount.toFixed(2).replace(".", ",")}`,
  });
});
