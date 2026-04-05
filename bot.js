const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const sharp = require("sharp");
const fs = require("fs");
const https = require("https");
const path = require("path");

const TOKEN = process.env.TOKEN;

const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== FILES =====
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

// INIT FILES
if (!fs.existsSync(panelFile)) {
  fs.writeFileSync(panelFile, JSON.stringify({
    photoMessageId: null,
    modelMessageId: null,
    dashboardMessageId: null
  }, null, 2));
}

if (!fs.existsSync(statusFile)) {
  fs.writeFileSync(statusFile, JSON.stringify({
    photoStatuses: {},
    modelStatuses: {}
  }, null, 2));
}

// ===== UTILS =====
const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));

const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

// ===== STATES =====
let { photoStatuses, modelStatuses } = getStatuses();

// ===== BUTTONS =====
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("dispo_on")
    .setLabel("🟢 Disponible")
    .setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setCustomId("dispo_off")
    .setLabel("🔴 Indisponible")
    .setStyle(ButtonStyle.Danger)
);

// ===== EMBEDS =====
function generatePhotoEmbed() {
  const available = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const unavailable = Object.values(photoStatuses).filter(s => s === "🔴").length;

  const description = Object.entries(photoStatuses)
    .map(([user, emoji]) => `• **${user}** → ${emoji}`)
    .join("\n") || "_Aucun photographe enregistré_";

  return new EmbedBuilder()
    .setTitle("📸 Planning Photographes")
    .setColor("#00bfff")
    .setDescription(description)
    .addFields(
      { name: "🟢 Disponibles", value: `${available}`, inline: true },
      { name: "🔴 Indisponibles", value: `${unavailable}`, inline: true }
    )
    .setFooter({ text: "Clique sur un bouton pour changer ton statut" })
    .setTimestamp();
}

function generateModelEmbed() {
  const available = Object.values(modelStatuses).filter(s => s === "🟢").length;
  const unavailable = Object.values(modelStatuses).filter(s => s === "🔴").length;

  const description = Object.entries(modelStatuses)
    .map(([user, emoji]) => `• **${user}** → ${emoji}`)
    .join("\n") || "_Aucun modèle enregistré_";

  return new EmbedBuilder()
    .setTitle("👠 Planning Modèles")
    .setColor("#ff69b4")
    .setDescription(description)
    .addFields(
      { name: "🟢 Disponibles", value: `${available}`, inline: true },
      { name: "🔴 Indisponibles", value: `${unavailable}`, inline: true }
    )
    .setFooter({ text: "Clique sur un bouton pour changer ton statut" })
    .setTimestamp();
}

function generateDashboardEmbed() {
  const photoAvailable = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const modelAvailable = Object.values(modelStatuses).filter(s => s === "🟢").length;

  return new EmbedBuilder()
    .setTitle("📊 Dashboard Global")
    .setColor("#2f3136")
    .setDescription("Vue d’ensemble des disponibilités")
    .addFields(
      { name: "📸 Photographes disponibles", value: `${photoAvailable}`, inline: true },
      { name: "👠 Modèles disponibles", value: `${modelAvailable}`, inline: true }
    )
    .setTimestamp();
}

// ===== PANELS =====
async function updatePanel(channelId, embed, key) {
  const channel = await client.channels.fetch(channelId);
  const panels = getPanels();

  let msg;

  if (panels[key]) {
    try {
      msg = await channel.messages.fetch(panels[key]);
    } catch {
      msg = null;
    }
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

// ===== READY =====
client.once("clientReady", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await refreshAll();
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async interaction => {

  // ===== BOUTONS =====
  if (interaction.isButton()) {
    const member = interaction.member;
    const name = member.nickname || interaction.user.username;

    // PHOTO
    if (interaction.channelId === PHOTO_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) {
        return interaction.reply({ content: "❌ Tu n'as pas le rôle photographe", flags: 64 });
      }

      photoStatuses[name] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
    }

    // MODEL
    if (interaction.channelId === MODEL_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === MODEL_ROLE)) {
        return interaction.reply({ content: "❌ Tu n'as pas le rôle model", flags: 64 });
      }

      modelStatuses[name] = interaction.customId === "dispo_on" ? "🟢" : "🔴";
    }

    saveStatuses({ photoStatuses, modelStatuses });
    await refreshAll();

    return interaction.reply({ content: "✅ Statut mis à jour", flags: 64 });
  }

  // ===== WATERMARK (inchangé) =====
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {

    if (interaction.channelId !== WATERMARK_CHANNEL_ID) {
      return interaction.reply({ content: "❌ Mauvais salon", flags: 64 });
    }

    await interaction.deferReply();

    const attachment = interaction.options.getAttachment("image");
    const position = interaction.options.getString("position");
    const logoChoice = interaction.options.getString("logo");

    let watermarkFile = "watermark.png";
    if (logoChoice === "2") watermarkFile = "watermark2.png";
    if (logoChoice === "3") watermarkFile = "watermark3.png";

    const watermarkPath = path.join(__dirname, watermarkFile);

    const inputPath = "./temp_input.jpg";
    const outputPath = "./temp_output.png";

    const file = fs.createWriteStream(inputPath);

    https.get(attachment.url, function(response) {
      response.pipe(file);

      file.on("finish", async () => {

        let gravity = "southeast";
        if(position === "center") gravity = "center";
        if(position === "bottom-left") gravity = "southwest";
        if(position === "top-right") gravity = "northeast";
        if(position === "top-left") gravity = "northwest";
        if(position === "top-center") gravity = "north";
        if(position === "bottom-center") gravity = "south";

        let sizeRatio = logoChoice === "3" ? 0.4 : 0.15;

        const image = sharp(inputPath);
        const metadata = await image.metadata();

        const resizedWatermark = await sharp(watermarkPath)
          .resize({
            width: Math.floor(metadata.width * sizeRatio),
            height: Math.floor(metadata.height * sizeRatio),
            fit: "inside"
          })
          .toBuffer();

        await image
          .composite([{ input: resizedWatermark, gravity }])
          .toFile(outputPath);

        await interaction.editReply({ files: [outputPath] });

        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
    });
  }
});

client.login(TOKEN);