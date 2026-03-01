const { onSchedule } = require("firebase-functions/v2/scheduler");
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