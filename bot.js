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

// --- POLICES ---
const fontPath = path.join(__dirname, 'Roboto-Regular.ttf');
const sigPath = path.join(__dirname, 'DancingScript.ttf');
if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'PrimeFont' });
if (fs.existsSync(sigPath)) registerFont(sigPath, { family: 'SignatureFont' });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- FICHIERS ---
const panelFile = "./panels.json";
const statusFile = "./statuses.json";
if (!fs.existsSync(panelFile)) fs.writeFileSync(panelFile, JSON.stringify({ photoMessageId: null, modelMessageId: null, dashboardMessageId: null }));
if (!fs.existsSync(statusFile)) fs.writeFileSync(statusFile, JSON.stringify({ photoStatuses: {}, modelStatuses: {} }));

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));
const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// --- GÉNÉRATEUR DE DEVIS (COORDONNÉES CALIBRÉES) ---
async function createPrimeDevis(data, signatureName = null) {
  const templatePath = path.join(__dirname, 'Prime Network Photography Services_page-0001.png');
  const background = await loadImage(templatePath);
  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(background, 0, 0);

  // Configuration texte
  ctx.fillStyle = "#000000"; // Texte en noir
  ctx.font = "24px 'PrimeFont', sans-serif";

  // --- ALIGNEMENT PRÉCIS ---
  // Informations Client
  ctx.fillText(data.client || "", 215, 320);      // Après "Nom/Prénom:"
  ctx.fillText(data.telephone || "", 180, 385);   // Après "Téléphone:"

  // Détails Prestation
  ctx.fillText(data.photos || "0", 260, 528);     // Après "Nombre de photos:"
  
  // Description (Commence sous l'étiquette)
  ctx.font = "20px 'PrimeFont', sans-serif";
  ctx.fillText(data.description || "", 50, 630);

  // Prix Total
  ctx.font = "bold 28px 'PrimeFont', sans-serif";
  ctx.fillText(`${data.prix || 0} €`, 280, 742);  // Après "Montant total (TTC):"

  // Signature
  if (signatureName) {
    ctx.font = "45px 'SignatureFont', cursive";
    ctx.fillStyle = "#1a237e"; // Bleu foncé type stylo
    ctx.fillText(signatureName, 80, 930);
  }

  return canvas.toBuffer();
}

// --- LOGIQUE PLANNING ---
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

function generatePhotoEmbed() {
  const desc = Object.entries(photoStatuses).map(([u, e]) => `• **${u}** → ${e}`).join("\n") || "_Vide_";
  return new EmbedBuilder().setTitle("📸 Planning Photographes").setColor("#00bfff").setDescription(desc);
}

function generateModelEmbed() {
  const desc = Object.entries(modelStatuses).map(([u, e]) => `• **${u}** → ${e}`).join("\n") || "_Vide_";
  return new EmbedBuilder().setTitle("👠 Planning Modèles").setColor("#ff69b4").setDescription(desc);
}

function generateDashboardEmbed() {
  const pA = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const mA = Object.values(modelStatuses).filter(s => s === "🟢").length;
  return new EmbedBuilder().setTitle("📊 Dashboard").setColor("#2f3136").addFields({name:"📸 Photos", value:`${pA}`, inline:true}, {name:"👠 Modèles", value:`${mA}`, inline:true});
}

async function updatePanel(channelId, embed, key) {
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
}

async function refreshAll() {
  await updatePanel(PHOTO_CHANNEL_ID, generatePhotoEmbed(), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, generateModelEmbed(), "modelMessageId");
  await updatePanel(DASHBOARD_CHANNEL_ID, generateDashboardEmbed(), "dashboardMessageId");
}

client.once("ready", () => {
  console.log("✅ Bot Prime Network Prêt !");
  refreshAll();
});

client.on("interactionCreate", async interaction => {
  const member = interaction.member;
  const username = member.nickname || interaction.user.username;

  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {
    if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) return interaction.reply({ content: "❌ Accès refusé", flags: 64 });
    await interaction.deferReply();
    const data = {
      client: interaction.options.getString('client'),
      telephone: interaction.options.getString('telephone'),
      photos: interaction.options.getInteger('photos'),
      description: interaction.options.getString('description'),
      prix: interaction.options.getInteger('prix')
    };
    const buffer = await createPrimeDevis(data);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${data.client.replace(/\s/g, '')}_${data.prix}_${data.photos}`).setLabel('Signer').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('refuse').setLabel('Refuser').setStyle(ButtonStyle.Danger)
    );
    return interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'devis.png' })], components: [row] });
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("sign_")) {
      const args = interaction.customId.split("_");
      const buffer = await createPrimeDevis({client: args[1], prix: args[2], photos: args[3]}, username);
      return interaction.update({ content: `✅ Signé par **${username}**`, files: [new AttachmentBuilder(buffer, { name: 'facture.png' })], components: [] });
    }
    if (interaction.customId === "refuse") return interaction.update({ content: "❌ Refusé", components: [], files: [] });
    if (interaction.customId.startsWith("dispo_")) {
      const target = interaction.channelId === PHOTO_CHANNEL_ID ? photoStatuses : modelStatuses;
      target[username] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
      saveStatuses({ photoStatuses, modelStatuses });
      await refreshAll();
      return interaction.reply({ content: "Mis à jour", flags: 64 });
    }
  }
});

client.login(TOKEN);
