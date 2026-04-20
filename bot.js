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

// --- ENREGISTREMENT DES POLICES (À LA RACINE DU PROJET) ---
const fontRegular = path.join(__dirname, 'Roboto-Regular.ttf');
const fontSignature = path.join(__dirname, 'DancingScript.ttf');

if (fs.existsSync(fontRegular)) {
  registerFont(fontRegular, { family: 'DevisFont' });
} else {
  console.warn("⚠️ Attention: Roboto-Regular.ttf est absent de la racine.");
}

if (fs.existsSync(fontSignature)) {
  registerFont(fontSignature, { family: 'SignatureFont' });
} else {
  console.warn("⚠️ Attention: DancingScript.ttf est absent de la racine.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --- GESTION DES FICHIERS ---
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

if (!fs.existsSync(panelFile)) fs.writeFileSync(panelFile, JSON.stringify({ photoMessageId: null, modelMessageId: null, dashboardMessageId: null }, null, 2));
if (!fs.existsSync(statusFile)) fs.writeFileSync(statusFile, JSON.stringify({ photoStatuses: {}, modelStatuses: {} }, null, 2));

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));
const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// --- GÉNÉRATEUR DE DEVIS UTILISANT LE TEMPLATE ---
async function createComplexDevis(data, signatureName = null) {
  const templatePath = path.join(__dirname, 'devis_template.png');
  if (!fs.existsSync(templatePath)) throw new Error("Fichier devis_template.png introuvable !");
  
  const background = await loadImage(templatePath);
  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');

  // Dessiner l'image de fond (Template)
  ctx.drawImage(background, 0, 0);

  // Configuration du texte standard
  ctx.fillStyle = "#000000";
  ctx.font = "22px 'DevisFont'"; // Utilisation de la police enregistrée

  const dateStr = new Date().toLocaleDateString('fr-FR');

  // Remplissage des champs (Coordonnées basées sur devis_template.png)
  ctx.fillText(dateStr, 135, 145);                     
  ctx.fillText(`PRIME-${Math.floor(1000 + Math.random()*9000)}`, 135, 210); 
  ctx.fillText(data.client || "Client", 135, 260); 
  ctx.fillText(data.telephone || "N/A", 135, 315); 

  // Ligne de prestation dans le tableau
  ctx.font = "20px 'DevisFont'";
  ctx.fillText(dateStr, 140, 410);                    
  ctx.fillText(data.description || "Séance Photo", 255, 410); 
  ctx.fillText(`${data.prix} €`, 550, 410);           
  ctx.fillText(data.photos ? data.photos.toString() : "1", 705, 410); 
  ctx.fillText(`${data.prix} €`, 785, 410);           

  // Total
  ctx.font = "bold 26px 'DevisFont'";
  ctx.fillText(`${data.prix} €`, 550, 775);

  // --- SIGNATURES ---
  if (signatureName) {
    // Signature automatique du photographe (Côté gauche)
    ctx.font = "25px 'SignatureFont'";
    ctx.fillStyle = "#1a237e"; 
    ctx.fillText(data.photographe || "Prime Network", 120, 890);

    // Signature dynamique du client (Côté droit)
    ctx.font = "35px 'SignatureFont'";
    ctx.fillText(signatureName, 550, 890);
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
  return new EmbedBuilder().setTitle("📊 Dashboard").setColor("#2f3136").addFields({name:"📸 Photographes", value:`${pA}`, inline:true}, {name:"👠 Modèles", value:`${mA}`, inline:true}).setTimestamp();
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

// --- ÉVÉNEMENTS ---
client.once("ready", async () => {
  console.log(`✅ Bot opérationnel : ${client.user.tag}`);
  await refreshAll();
});

client.on("interactionCreate", async interaction => {
  const member = interaction.member;
  const username = member.nickname || interaction.user.username;

  // 1. COMMANDE /DEVIS
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {
    if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) return interaction.reply({ content: "❌ Accès réservé", flags: 64 });

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

    // Stockage limité des données dans l'ID du bouton
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${data.client.slice(0,15)}_${data.prix}_${data.photos}`).setLabel('Signer et Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuse`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({ content: `📄 Nouveau devis pour **${data.client}**`, files: [attachment], components: [row] });
  }

  // 2. BOUTONS
  if (interaction.isButton()) {
    const args = interaction.customId.split("_");
    const action = args[0];

    if (action === "sign") {
      await interaction.deferUpdate();
      const buffer = await createComplexDevis({
        client: args[1],
        prix: args[2],
        photos: args[3],
        photographe: "Service Prime"
      }, username); // Signature avec le nom du client qui clique

      const attachment = new AttachmentBuilder(buffer, { name: 'facture_signee.png' });
      return interaction.editReply({ content: `✅ Devis signé par **${username}**`, files: [attachment], components: [] });
    }

    if (action === "refuse") return interaction.update({ content: "❌ Devis refusé.", components: [], files: [] });

    // STATUTS DISPO
    if (interaction.customId.startsWith("dispo_")) {
      const isPhoto = interaction.channelId === PHOTO_CHANNEL_ID;
      const target = isPhoto ? photoStatuses : modelStatuses;
      target[username] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
      saveStatuses({ photoStatuses, modelStatuses });
      await refreshAll();
      return interaction.reply({ content: "Statut mis à jour", flags: 64 });
    }
  }

  // 3. WATERMARK
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {
    if (interaction.channelId !== WATERMARK_CHANNEL_ID) return interaction.reply({ content: "❌ Salon incorrect", flags: 64 });
    await interaction.deferReply();
    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position") || "southeast";
    const logoIdx = interaction.options.getString("logo") || "1";
    const watermarkPath = path.join(__dirname, logoIdx === "1" ? "watermark.png" : (logoIdx === "2" ? "watermark2.png" : "watermark3.png"));

    https.get(attach.url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", async () => {
        const input = Buffer.concat(chunks);
        const img = sharp(input);
        const meta = await img.metadata();
        const wMark = await sharp(watermarkPath).resize({ width: Math.floor(meta.width * 0.15) }).toBuffer();
        const out = await img.composite([{ input: wMark, gravity: pos }]).toBuffer();
        await interaction.editReply({ files: [new AttachmentBuilder(out, { name: 'resultat.png' })] });
      });
    });
  }
});

client.login(TOKEN);
