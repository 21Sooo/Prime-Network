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

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

// --- MÉMOIRE TEMPORAIRE ---
const devisCache = new Map();

// --- ENREGISTREMENT DES POLICES ---
const fontPath = path.join(__dirname, 'Roboto-Regular.ttf');
const sigPath = path.join(__dirname, 'DancingScript.ttf');

if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'PrimeFont' });
if (fs.existsSync(sigPath)) registerFont(sigPath, { family: 'SignatureFont' });

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --- GESTION DES FICHIERS DE DONNÉES ---
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

if (!fs.existsSync(panelFile)) fs.writeFileSync(panelFile, JSON.stringify({ photoMessageId: null, modelMessageId: null, dashboardMessageId: null }, null, 2));
if (!fs.existsSync(statusFile)) fs.writeFileSync(statusFile, JSON.stringify({ photoStatuses: {}, modelStatuses: {} }, null, 2));

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));
const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// --- GÉNÉRATEUR SUR PAGE BLANCHE (VERSION LISIBILITÉ AMÉLIORÉE) ---
async function createPrimeDevis(data, signatureName = null) {
  const canvas = createCanvas(800, 1000);
  const ctx = canvas.getContext('2d');

  // Fond Blanc
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 800, 1000);

  // En-tête (Rectangle Noir)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 800, 160);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 50px sans-serif"; 
  ctx.fillText("PRIME NETWORK", 50, 75);
  ctx.font = "24px sans-serif";
  ctx.fillText("DEVIS & FACTURATION OFFICIELLE", 50, 120);

  // Contenu (Noir)
  ctx.fillStyle = "#000000";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`CLIENT : ${data.client || "Inconnu"}`, 50, 230);
  
  ctx.font = "22px sans-serif";
  ctx.fillText(`Téléphone : ${data.telephone || "Non renseigné"}`, 50, 280);
  ctx.fillText(`Prestation : ${data.photos || 0} photo(s)`, 50, 320);

  // Ligne de séparation
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50, 360);
  ctx.lineTo(750, 360);
  ctx.stroke();

  // Zone Description
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("DESCRIPTION DÉTAILLÉE :", 50, 410);
  
  ctx.font = "20px sans-serif";
  const words = (data.description || "").split(' ');
  let line = '';
  let yDesc = 450;
  for(let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > 680 && n > 0) {
      ctx.fillText(line, 50, yDesc);
      line = words[n] + ' ';
      yDesc += 35; 
    } else { line = testLine; }
  }
  ctx.fillText(line, 50, yDesc);

  // Prix
  ctx.font = "bold 35px sans-serif";
  ctx.fillText(`TOTAL À RÉGLER : ${data.prix || 0} €`, 50, 850);

  // Signature
  if (signatureName) {
    ctx.font = "55px 'SignatureFont', cursive";
    ctx.fillStyle = "#1a237e"; 
    ctx.fillText(signatureName, 450, 920);
    
    ctx.fillStyle = "#000000";
    ctx.font = "italic 16px sans-serif";
    ctx.fillText("Signé numériquement le " + new Date().toLocaleDateString(), 450, 950);
  }

  return canvas.toBuffer();
}

// --- LOGIQUE PLANNING ---
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
    if (panels[key]) {
      try { msg = await channel.messages.fetch(panels[key]); } catch { msg = null; }
    }
    if (!msg) {
      msg = await channel.send({ embeds: [embed], components: key !== "dashboardMessageId" ? [dispoButtons] : [] });
      panels[key] = msg.id;
      savePanels(panels);
    } else {
      await msg.edit({ embeds: [embed], components: key !== "dashboardMessageId" ? [dispoButtons] : [] });
    }
  } catch (err) { console.error(err); }
}

async function refreshAll() {
  await updatePanel(PHOTO_CHANNEL_ID, generatePhotoEmbed(), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, generateModelEmbed(), "modelMessageId");
  await updatePanel(DASHBOARD_CHANNEL_ID, generateDashboardEmbed(), "dashboardMessageId");
}

// --- INTERACTIONS ---
client.once("ready", async () => {
  console.log(`✅ Bot Prime Network en ligne (Mode Lisibilité HD)`);
  await refreshAll();
});

client.on("interactionCreate", async interaction => {
  const member = interaction.member;
  const username = member.nickname || interaction.user.username;

  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {
    if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) return interaction.reply({ content: "❌ Réservé aux Photographes.", flags: 64 });
    
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

    return interaction.editReply({ 
        content: `📄 Nouveau devis généré pour **${data.client}**`, 
        files: [new AttachmentBuilder(buffer, { name: 'devis.png' })], 
        components: [row] 
    });
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("sign_devis_")) {
      const devisId = interaction.customId.replace("sign_", "");
      const cachedData = devisCache.get(devisId);

      if (!cachedData) return interaction.reply({ content: "❌ Erreur : Ce devis a expiré en mémoire.", flags: 64 });

      const buffer = await createPrimeDevis(cachedData, username);
      await interaction.update({ 
        content: `✅ Devis accepté et signé par **${username}**`, 
        files: [new AttachmentBuilder(buffer, { name: 'facture_signee.png' })], 
        components: [] 
      });
      
      return devisCache.delete(devisId);
    }
    
    if (interaction.customId === "refuse") return interaction.update({ content: "❌ Le client a refusé le devis.", components: [], files: [] });

    if (interaction.customId.startsWith("dispo_")) {
      const target = interaction.channelId === PHOTO_CHANNEL_ID ? photoStatuses : modelStatuses;
      target[username] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
      saveStatuses({ photoStatuses, modelStatuses });
      await refreshAll();
      return interaction.reply({ content: "Disponibilité mise à jour !", flags: 64 });
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {
    if (interaction.channelId !== WATERMARK_CHANNEL_ID) return interaction.reply({ content: "❌ Mauvais salon.", flags: 64 });
    await interaction.deferReply();
    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position") || "southeast";
    const logoChoice = interaction.options.getString("logo") || "1";
    const watermarkFile = logoChoice === "2" ? "watermark2.png" : (logoChoice === "3" ? "watermark3.png" : "watermark.png");
    
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
          await interaction.editReply({ files: [new AttachmentBuilder(out, { name: 'prime_photo.png' })] });
        } catch (e) {
          await interaction.editReply("❌ Erreur traitement image.");
        }
      });
    });
  }
});

client.login(TOKEN);
