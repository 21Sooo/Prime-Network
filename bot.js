const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const { createCanvas, registerFont, loadImage } = require('canvas');
const sharp = require("sharp");
const fs = require("fs");
const https = require("https");
const path = require("path");

const TOKEN = process.env.TOKEN;

// --- CONFIGURATION DES IDS ---
const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";

const PHOTO_ROLE_NAME = "🎥・Prime Photographer";
const MODEL_ROLE_NAME = "👠・Prime Model";

// --- MÉMOIRE TEMPORAIRE (FIX DESCRIPTION BUG) ---
const devisCache = new Map();

// --- ENREGISTREMENT DES POLICES ---
const fontPath = path.join(__dirname, 'Roboto-Regular.ttf');
const sigPath = path.join(__dirname, 'DancingScript.ttf');
if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'PrimeFont' });
if (fs.existsSync(sigPath)) registerFont(sigPath, { family: 'SignatureFont' });

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// --- GESTION DES DONNÉES ---
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

if (!fs.existsSync(panelFile)) fs.writeFileSync(panelFile, JSON.stringify({ photoMessageId: null, modelMessageId: null, dashboardMessageId: null }, null, 2));
if (!fs.existsSync(statusFile)) fs.writeFileSync(statusFile, JSON.stringify({ photoStatuses: {}, modelStatuses: {} }, null, 2));

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));
const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// --- GÉNÉRATEUR PAGE BLANCHE ---
async function createPrimeDevis(data, signatureName = null) {
  const canvas = createCanvas(800, 1000);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 800, 1000);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 800, 150);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("PRIME NETWORK", 50, 70);
  ctx.font = "20px sans-serif";
  ctx.fillText("DEVIS & FACTURATION", 50, 110);

  ctx.fillStyle = "#000000";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`CLIENT : ${data.client || "Inconnu"}`, 50, 220);
  ctx.font = "18px sans-serif";
  ctx.fillText(`Tél : ${data.telephone || "/"} | Photos : ${data.photos || 0}`, 50, 260);

  ctx.fillRect(50, 300, 700, 2);
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("DESCRIPTION :", 50, 340);
  
  ctx.font = "16px sans-serif";
  const words = (data.description || "").split(' ');
  let line = '', yDesc = 370;
  for(let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > 680 && n > 0) {
      ctx.fillText(line, 50, yDesc);
      line = words[n] + ' ';
      yDesc += 25;
    } else { line = testLine; }
  }
  ctx.fillText(line, 50, yDesc);

  ctx.font = "bold 30px sans-serif";
  ctx.fillText(`TOTAL : ${data.prix || 0} €`, 50, 850);

  if (signatureName) {
    ctx.font = "45px 'SignatureFont', cursive";
    ctx.fillStyle = "#1a237e"; 
    ctx.fillText(signatureName, 450, 920);
    ctx.fillStyle = "#000000";
    ctx.font = "italic 14px sans-serif";
    ctx.fillText("Signé numériquement", 450, 950);
  }
  return canvas.toBuffer();
}

// --- LOGIQUE PANELS ---
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

function generatePhotoEmbed() {
  const desc = Object.entries(photoStatuses).map(([u, e]) => `• **${u}** → ${e}`).join("\n") || "_Aucun photographe_";
  return new EmbedBuilder().setTitle("📸 Planning Photographes").setColor("#00bfff").setDescription(desc).setTimestamp();
}

function generateModelEmbed() {
  const desc = Object.entries(modelStatuses).map(([u, e]) => `• **${u}** → ${e}`).join("\n") || "_Aucun modèle_";
  return new EmbedBuilder().setTitle("👠 Planning Modèles").setColor("#ff69b4").setDescription(desc).setTimestamp();
}

function generateDashboardEmbed() {
  const pA = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const mA = Object.values(modelStatuses).filter(s => s === "🟢").length;
  return new EmbedBuilder().setTitle("📊 Dashboard Global").setColor("#2f3136").addFields({name:"📸 Photos", value:`${pA}`, inline:true}, {name:"👠 Modèles", value:`${mA}`, inline:true}).setTimestamp();
}

async function updatePanel(channelId, embed, key) {
  try {
    const channel = await client.channels.fetch(channelId);
    const panels = getPanels();
    let msg;
    if (panels[key]) try { msg = await channel.messages.fetch(panels[key]); } catch { msg = null; }
    if (!msg) {
      msg = await channel.send({ embeds: [embed], components: key !== "dashboardMessageId" ? [dispoButtons] : [] });
      panels[key] = msg.id;
      savePanels(panels);
    } else await msg.edit({ embeds: [embed], components: key !== "dashboardMessageId" ? [dispoButtons] : [] });
  } catch (e) { console.log("Erreur Panel update"); }
}

async function refreshAll() {
  await updatePanel(PHOTO_CHANNEL_ID, generatePhotoEmbed(), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, generateModelEmbed(), "modelMessageId");
  await updatePanel(DASHBOARD_CHANNEL_ID, generateDashboardEmbed(), "dashboardMessageId");
}

client.once("ready", async () => {
  console.log(`✅ Bot en ligne ! Commandes /pingdispo & /pingindispo actives.`);
  await refreshAll();
});

client.on("interactionCreate", async interaction => {
  const member = interaction.member;
  const username = member.nickname || interaction.user.username;

  // --- COMMANDE DEVIS ---
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {
    await interaction.deferReply();
    const data = {
      client: interaction.options.getString('client'),
      telephone: interaction.options.getString('telephone'),
      photos: interaction.options.getInteger('photos'),
      description: interaction.options.getString('description'),
      prix: interaction.options.getInteger('prix'),
      photographe: username
    };

    const devisId = `devis_${Date.now()}`;
    devisCache.set(devisId, data);

    const buffer = await createPrimeDevis(data);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${devisId}`).setLabel('Signer').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('refuse').setLabel('Refuser').setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'devis.png' })], components: [row] });
  }

  // --- NOUVELLES COMMANDES PING ---
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "pingdispo" || interaction.commandName === "pingindispo") {
      const targetEmoji = interaction.commandName === "pingdispo" ? "🟢" : "🔴";
      const label = interaction.commandName === "pingdispo" ? "disponibles" : "indisponibles";
      
      // On récupère les IDs des membres qui ont le bon statut
      const guild = interaction.guild;
      const mentions = [];

      for (const [name, status] of Object.entries(photoStatuses)) {
        if (status === targetEmoji) {
          const m = guild.members.cache.find(mem => (mem.nickname || mem.user.username) === name);
          if (m) mentions.push(`<@${m.id}>`);
          else mentions.push(`**${name}**`);
        }
      }

      if (mentions.length === 0) return interaction.reply({ content: `Il n'y a aucun photographe ${label} pour le moment.`, flags: 64 });
      
      return interaction.reply({ content: `🔔 **Alerte Photographes ${label} :**\n${mentions.join(", ")}` });
    }
  }

  // --- GESTION BOUTONS ---
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("sign_devis_")) {
      const devisId = interaction.customId.replace("sign_", "");
      const cachedData = devisCache.get(devisId);
      if (!cachedData) return interaction.reply({ content: "❌ Devis expiré.", flags: 64 });

      const buffer = await createPrimeDevis(cachedData, username);
      await interaction.update({ content: `✅ Signé par **${username}**`, files: [new AttachmentBuilder(buffer, { name: 'facture.png' })], components: [] });
      return devisCache.delete(devisId);
    }

    if (interaction.customId === "refuse") return interaction.update({ content: "❌ Refusé.", components: [], files: [] });

    if (interaction.customId.startsWith("dispo_")) {
      const target = interaction.channelId === PHOTO_CHANNEL_ID ? photoStatuses : modelStatuses;
      target[username] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
      saveStatuses({ photoStatuses, modelStatuses });
      await refreshAll();
      return interaction.reply({ content: "Statut mis à jour.", flags: 64 });
    }
  }
  
  // --- WATERMARK ---
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {
    await interaction.deferReply();
    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position") || "southeast";
    const watermarkFile = "watermark.png";
    
    https.get(attach.url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", async () => {
        try {
          const input = Buffer.concat(chunks);
          const img = sharp(input);
          const meta = await img.metadata();
          const wMark = await sharp(path.join(__dirname, watermarkFile)).resize({ width: Math.floor(meta.width * 0.15) }).toBuffer();
          const out = await img.composite([{ input: wMark, gravity: pos }]).toBuffer();
          await interaction.editReply({ files: [new AttachmentBuilder(out, { name: 'prime.png' })] });
        } catch (e) { await interaction.editReply("Erreur."); }
      });
    });
  }
});

client.login(TOKEN);
