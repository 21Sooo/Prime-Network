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

// --- CONFIGURATION ---
const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

// Enregistrement de la police (Indispensable pour Railway)
const fontPath = path.join(__dirname, 'fonts', 'Roboto-Regular.ttf');
if (fs.existsSync(fontPath)) {
  registerFont(fontPath, { family: 'CustomFont' });
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== FILES =====
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

if (!fs.existsSync(panelFile)) fs.writeFileSync(panelFile, JSON.stringify({ photoMessageId: null, modelMessageId: null, dashboardMessageId: null }, null, 2));
if (!fs.existsSync(statusFile)) fs.writeFileSync(statusFile, JSON.stringify({ photoStatuses: {}, modelStatuses: {} }, null, 2));

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));
const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// ===== GÉNÉRATEUR DE DEVIS (TEMPLATE) =====
async function createComplexDevis(data, signature = null) {
  const templatePath = path.join(__dirname, 'devis_template.png');
  const background = await loadImage(templatePath);
  
  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');

  // Dessiner le template
  ctx.drawImage(background, 0, 0);

  // Configuration texte
  ctx.fillStyle = "#000000";
  ctx.font = "24px 'CustomFont'";

  const dateStr = new Date().toLocaleDateString('fr-FR');

  // Remplissage des champs (Coordonnées approximatives à ajuster selon ton image)
  ctx.fillText(dateStr, 135, 150);                     // Date
  ctx.fillText(`INV-${Math.floor(Math.random()*9000)}`, 135, 215); // N° Facture
  ctx.fillText(data.client, 135, 265);                 // Facturé à
  ctx.fillText(data.telephone || "N/A", 135, 320);    // Adresse/Tel

  // Tableau (Une seule ligne pour l'exemple simplifié)
  ctx.font = "20px 'CustomFont'";
  ctx.fillText(dateStr, 135, 415);                     // Date colonne 1
  ctx.fillText(data.description, 250, 415);            // Prestation
  ctx.fillText(`${data.prix} €`, 545, 415);            // Prix
  ctx.fillText(data.photos.toString(), 700, 415);      // Qté
  ctx.fillText(`${data.prix} €`, 780, 415);            // Total

  // Total en bas
  ctx.font = "bold 26px 'CustomFont'";
  ctx.fillText(`${data.prix} €`, 545, 775);

  // Signature si acceptée
  if (signature) {
    ctx.font = "italic 30px 'CustomFont'";
    ctx.fillStyle = "#00008B"; // Bleu foncé type stylo
    ctx.fillText(signature, 540, 900); // Signature client
    ctx.fillText(data.photographe, 110, 900); // Signature photographe automatique
  }

  return canvas.toBuffer();
}

// ===== INTERFACES =====
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

// (Les fonctions generatePhotoEmbed, generateModelEmbed, generateDashboardEmbed restent identiques à ton code original)
function generatePhotoEmbed() {
  const available = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const description = Object.entries(photoStatuses).map(([user, emoji]) => `• **${user}** → ${emoji}`).join("\n") || "_Aucun photographe_";
  return new EmbedBuilder().setTitle("📸 Planning Photographes").setColor("#00bfff").setDescription(description).setTimestamp();
}

function generateModelEmbed() {
  const available = Object.values(modelStatuses).filter(s => s === "🟢").length;
  const description = Object.entries(modelStatuses).map(([user, emoji]) => `• **${user}** → ${emoji}`).join("\n") || "_Aucun modèle_";
  return new EmbedBuilder().setTitle("👠 Planning Modèles").setColor("#ff69b4").setDescription(description).setTimestamp();
}

function generateDashboardEmbed() {
  const pA = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const mA = Object.values(modelStatuses).filter(s => s === "🟢").length;
  return new EmbedBuilder().setTitle("📊 Dashboard").setColor("#2f3136").addFields({name:"📸 Photo", value:`${pA}`, inline:true}, {name:"👠 Modèles", value:`${mA}`, inline:true}).setTimestamp();
}

async function updatePanel(channelId, embed, key) {
  const channel = await client.channels.fetch(channelId);
  const panels = getPanels();
  let msg;
  try { if (panels[key]) msg = await channel.messages.fetch(panels[key]); } catch { msg = null; }

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

// ===== EVENTS =====
client.once("ready", async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  await refreshAll();
});

client.on("interactionCreate", async interaction => {
  const member = interaction.member;
  const name = member.nickname || interaction.user.username;

  // --- COMMANDE DEVIS ---
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {
    if (!member.roles.cache.some(role => role.name === PHOTO_ROLE)) return interaction.reply({ content: "❌ Accès refusé", flags: 64 });

    const data = {
      client: interaction.options.getString('client'),
      telephone: interaction.options.getString('telephone'),
      photographe: name,
      photos: interaction.options.getInteger('photos'),
      description: interaction.options.getString('description'),
      prix: interaction.options.getInteger('prix')
    };

    const buffer = await createComplexDevis(data);
    const attachment = new AttachmentBuilder(buffer, { name: 'devis_attente.png' });

    // Stockage temporaire des données dans le CustomID (attention limite 100 char)
    // Pour un vrai système, il faudrait une base de données
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${data.client}_${data.prix}_${data.photos}`).setLabel('Signer et Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuse`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({ content: `📄 Nouveau devis pour **${data.client}**`, files: [attachment], components: [row] });
  }

  // --- BOUTONS ---
  if (interaction.isButton()) {
    const [action, cName, cPrix, cPhotos] = interaction.customId.split("_");

    if (action === "accept") {
      await interaction.deferUpdate();
      // On regénère l'image avec la signature
      const buffer = await createComplexDevis({
        client: cName,
        prix: cPrix,
        photos: cPhotos,
        description: "Prestation Photo", // Simplifié pour le bouton
        photographe: "Prime Network"
      }, name); // 'name' est la signature du client qui clique

      const attachment = new AttachmentBuilder(buffer, { name: 'devis_signe.png' });
      return interaction.editReply({ content: `✅ Devis signé par **${name}**`, files: [attachment], components: [] });
    }

    if (action === "refuse") return interaction.update({ content: "❌ Devis refusé.", components: [], files: [] });

    // Statuts
    if (interaction.channelId === PHOTO_CHANNEL_ID || interaction.channelId === MODEL_CHANNEL_ID) {
      if (interaction.channelId === PHOTO_CHANNEL_ID && !member.roles.cache.some(r => r.name === PHOTO_ROLE)) return interaction.reply({ content: "❌ Rôle manquant", flags: 64 });
      if (interaction.channelId === MODEL_CHANNEL_ID && !member.roles.cache.some(r => r.name === MODEL_ROLE)) return interaction.reply({ content: "❌ Rôle manquant", flags: 64 });

      const target = interaction.channelId === PHOTO_CHANNEL_ID ? photoStatuses : modelStatuses;
      target[name] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
      saveStatuses({ photoStatuses, modelStatuses });
      await refreshAll();
      return interaction.reply({ content: "Statut mis à jour", flags: 64 });
    }
  }

  // --- WATERMARK (Gardé du code précédent) ---
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {
     // ... (Recopier ici ton code Sharp précédent si nécessaire)
     // Il fonctionne déjà bien, pense juste à bien gérer les fichiers temporaires
  }
});

client.login(TOKEN);
