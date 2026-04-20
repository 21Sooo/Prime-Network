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

// --- ENREGISTREMENT DES POLICES ---
// Assure-toi que ces fichiers existent dans ton dossier /fonts sur GitHub
const fontRegular = path.join(__dirname, 'fonts', 'Roboto-Regular.ttf');
const fontSignature = path.join(__dirname, 'fonts', 'DancingScript.ttf');

if (fs.existsSync(fontRegular)) {
  registerFont(fontRegular, { family: 'DevisFont' });
}
if (fs.existsSync(fontSignature)) {
  registerFont(fontSignature, { family: 'SignatureFont' });
}

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

// --- GÉNÉRATEUR DE DEVIS ---
async function createComplexDevis(data, signatureName = null) {
  const templatePath = path.join(__dirname, 'devis_template.png');
  if (!fs.existsSync(templatePath)) throw new Error("Template introuvable !");
  
  const background = await loadImage(templatePath);
  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');

  // Dessin du fond
  ctx.drawImage(background, 0, 0);

  // Style de texte pour le contenu
  ctx.fillStyle = "#000000";
  ctx.font = "22px 'DevisFont'";

  const dateStr = new Date().toLocaleDateString('fr-FR');

  // Coordonnées (À AJUSTER selon ton image)
  ctx.fillText(dateStr, 135, 145);                     // Date
  ctx.fillText(`PRIME-${Math.floor(1000 + Math.random()*9000)}`, 135, 210); // N° Facture
  ctx.fillText(data.client || "Client Inconnu", 135, 260); // Facturé à
  ctx.fillText(data.telephone || "Non renseigné", 135, 315); // Adresse/Tel

  // Ligne de prestation dans le tableau
  ctx.font = "20px 'DevisFont'";
  ctx.fillText(dateStr, 140, 410);                    // Date
  ctx.fillText(data.description || "Prestation Photo", 255, 410); // Prestation
  ctx.fillText(`${data.prix} €`, 550, 410);           // Prix Unitaire
  ctx.fillText(data.photos ? data.photos.toString() : "1", 705, 410); // Quantité
  ctx.fillText(`${data.prix} €`, 785, 410);           // Total ligne

  // Total final
  ctx.font = "bold 26px 'DevisFont'";
  ctx.fillText(`${data.prix} €`, 550, 775);

  // --- SIGNATURES ---
  if (signatureName) {
    // Signature du Photographe (Automatique)
    ctx.font = "25px 'SignatureFont'";
    ctx.fillStyle = "#1a237e"; // Bleu encre
    ctx.fillText(data.photographe || "Le Photographe", 120, 890);

    // Signature du Client (Celle passée au clic sur Accepter)
    ctx.font = "35px 'SignatureFont'";
    ctx.fillText(signatureName, 550, 890);
  }

  return canvas.toBuffer();
}

// --- LOGIQUE DES DISPONIBILITÉS ---
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
  return new EmbedBuilder().setTitle("📊 Dashboard").setColor("#2f3136").addFields({name:"📸 Photo", value:`${pA}`, inline:true}, {name:"👠 Modèles", value:`${mA}`, inline:true}).setTimestamp();
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
  } catch (err) { console.error(`Erreur panel ${key}:`, err); }
}

async function refreshAll() {
  await updatePanel(PHOTO_CHANNEL_ID, generatePhotoEmbed(), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, generateModelEmbed(), "modelMessageId");
  await updatePanel(DASHBOARD_CHANNEL_ID, generateDashboardEmbed(), "dashboardMessageId");
}

// --- ÉVÉNEMENTS ---
client.once("ready", async () => {
  console.log(`✅ Bot lancé sur ${client.user.tag}`);
  await refreshAll();
});

client.on("interactionCreate", async interaction => {
  const member = interaction.member;
  const username = member.nickname || interaction.user.username;

  // 1. COMMANDE /DEVIS
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {
    if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) return interaction.reply({ content: "❌ Réservé aux photographes.", flags: 64 });

    const data = {
      client: interaction.options.getString('client'),
      telephone: interaction.options.getString('telephone'),
      photographe: username,
      photos: interaction.options.getInteger('photos') || 0,
      description: interaction.options.getString('description'),
      prix: interaction.options.getInteger('prix') || 0
    };

    const buffer = await createComplexDevis(data);
    const attachment = new AttachmentBuilder(buffer, { name: 'devis_attente.png' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`acc_${data.client}_${data.prix}_${data.photos}`).setLabel('Signer et Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuse`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({ content: `📄 Devis envoyé pour **${data.client}**`, files: [attachment], components: [row] });
  }

  // 2. INTERACTIONS BOUTONS
  if (interaction.isButton()) {
    const args = interaction.customId.split("_");
    const action = args[0];

    if (action === "acc") {
      await interaction.deferUpdate();
      const clientName = args[1];
      const prix = args[2];
      const photos = args[3];

      const buffer = await createComplexDevis({
        client: clientName,
        prix: prix,
        photos: photos,
        description: "Prestation Photo (Validée)",
        photographe: "Service Prime"
      }, username); // 'username' devient la signature ici

      const attachment = new AttachmentBuilder(buffer, { name: 'facture_signee.png' });
      return interaction.editReply({ content: `✅ Facture signée par **${username}**`, files: [attachment], components: [] });
    }

    if (action === "refuse") return interaction.update({ content: "❌ Devis refusé.", components: [], files: [] });

    // BOUTONS DISPO
    if (interaction.customId === "dispo_on" || interaction.customId === "dispo_off") {
      const isPhoto = interaction.channelId === PHOTO_CHANNEL_ID;
      const isModel = interaction.channelId === MODEL_CHANNEL_ID;

      if (isPhoto && !member.roles.cache.some(r => r.name === PHOTO_ROLE)) return interaction.reply({ content: "❌ Rôle manquant.", flags: 64 });
      if (isModel && !member.roles.cache.some(r => r.name === MODEL_ROLE)) return interaction.reply({ content: "❌ Rôle manquant.", flags: 64 });

      const target = isPhoto ? photoStatuses : modelStatuses;
      target[username] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
      
      saveStatuses({ photoStatuses, modelStatuses });
      await refreshAll();
      return interaction.reply({ content: "Statut mis à jour !", flags: 64 });
    }
  }

  // 3. COMMANDE /WATERMARK
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {
    if (interaction.channelId !== WATERMARK_CHANNEL_ID) return interaction.reply({ content: "❌ Mauvais salon.", flags: 64 });
    
    await interaction.deferReply();
    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position") || "southeast";
    const logoIdx = interaction.options.getString("logo") || "1";

    const watermarkFile = logoIdx === "1" ? "watermark.png" : (logoIdx === "2" ? "watermark2.png" : "watermark3.png");
    const watermarkPath = path.join(__dirname, watermarkFile);

    https.get(attach.url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", async () => {
        const inputBuffer = Buffer.concat(chunks);
        const image = sharp(inputBuffer);
        const meta = await image.metadata();

        const wMark = await sharp(watermarkPath)
          .resize({ width: Math.floor(meta.width * 0.15), fit: "inside" })
          .toBuffer();

        const output = await image.composite([{ input: wMark, gravity: pos }]).toBuffer();
        await interaction.editReply({ files: [new AttachmentBuilder(output, { name: 'watermarked.png' })] });
      });
    });
  }
});

client.login(TOKEN);
