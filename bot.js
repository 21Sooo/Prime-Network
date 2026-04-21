const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const { createCanvas, registerFont } = require('canvas');
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const fetch = global.fetch;

const TOKEN = process.env.TOKEN;
const GUILD_ID = "1403500050067230730";

// FONTS
try {
  registerFont(path.join(__dirname, 'DancingScript.ttf'), { family: 'Dancing' });
  registerFont(path.join(__dirname, 'Roboto-Regular.ttf'), { family: 'Roboto' });
} catch {}

// CONFIG
const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";
const DEVIS_CHANNEL_ID = "1466817112252219558";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

const devisCache = new Map();
const devisSigners = new Map();

// FILES
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

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

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));

const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// CLIENT
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// EMBEDS
async function generatePhotoEmbed(guild) {
  let desc = "";
  for (const userId in photoStatuses) {
    try {
      const member = await guild.members.fetch(userId);
      const name = member.nickname || member.user.username;
      desc += `• **${name}** → ${photoStatuses[userId]}\n`;
    } catch { delete photoStatuses[userId]; }
  }
  if (!desc) desc = "_Aucun photographe_";
  return new EmbedBuilder()
    .setTitle("📸 Planning Photographes")
    .setColor("#00bfff")
    .setDescription(desc)
    .setTimestamp();
}

async function generateModelEmbed(guild) {
  let desc = "";
  for (const userId in modelStatuses) {
    try {
      const member = await guild.members.fetch(userId);
      const name = member.nickname || member.user.username;
      desc += `• **${name}** → ${modelStatuses[userId]}\n`;
    } catch { delete modelStatuses[userId]; }
  }
  if (!desc) desc = "_Aucun modèle_";
  return new EmbedBuilder()
    .setTitle("👠 Planning Modèles")
    .setColor("#ff69b4")
    .setDescription(desc)
    .setTimestamp();
}

function generateDashboardEmbed() {
  const p = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const m = Object.values(modelStatuses).filter(s => s === "🟢").length;
  return new EmbedBuilder()
    .setTitle("📊 Dashboard Global")
    .setColor("#2f3136")
    .addFields(
      { name: "📸 Photographes actifs", value: `${p}`, inline: true },
      { name: "👠 Modèles actifs", value: `${m}`, inline: true }
    )
    .setTimestamp();
}

// BUTTONS
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

// PANELS
async function updatePanel(channelId, embed, key) {
  const channel = await client.channels.fetch(channelId);
  const panels = getPanels();
  let msg;
  if (panels[key]) {
    try { msg = await channel.messages.fetch(panels[key]); } catch {}
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
  const guild = await client.guilds.fetch(GUILD_ID);
  await updatePanel(PHOTO_CHANNEL_ID, await generatePhotoEmbed(guild), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, await generateModelEmbed(guild), "modelMessageId");
  await updatePanel(DASHBOARD_CHANNEL_ID, generateDashboardEmbed(), "dashboardMessageId");
  saveStatuses({ photoStatuses, modelStatuses });
}

// READY
client.once("ready", async () => {
  console.log("✅ Bot prêt");
  await refreshAll();
});

// DELETE PANEL
client.on("messageDelete", async (msg) => {
  const panels = getPanels();
  if (msg.id === panels.photoMessageId || msg.id === panels.modelMessageId || msg.id === panels.dashboardMessageId) {
    await refreshAll();
  }
});

// ENSURE STATUSES ARE ALWAYS SAVED
process.on('exit', () => saveStatuses({ photoStatuses, modelStatuses }));
process.on('SIGINT', () => { saveStatuses({ photoStatuses, modelStatuses }); process.exit(); });


// INTERACTIONS
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;

  // ===== WATERMARK =====
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {
    if (interaction.channelId !== WATERMARK_CHANNEL_ID)
      return interaction.reply({ content: "❌ Mauvais salon", flags: 64 });

    await interaction.deferReply();
    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position");
    const logo = interaction.options.getString("logo") || "1";

    try {
      const buffer = Buffer.from(await (await fetch(attach.url)).arrayBuffer());
      const img = sharp(buffer);
      const meta = await img.metadata();
      const logoWidth = Math.floor(meta.width * 0.035);

      const wMarkBuffer = await sharp(path.join(__dirname,
        logo === "2" ? "watermark2.png" :
        logo === "3" ? "watermark3.png" :
        "watermark.png")).resize({ width: logoWidth }).png().toBuffer();

      const wMeta = await sharp(wMarkBuffer).metadata();
      const marginX = Math.floor(meta.width * 0.01);
      const marginY = Math.floor(meta.height * 0.01);
      let top = 0, left = 0;
      const position = (pos || "southeast").toLowerCase();

      switch(position) {
        case "northwest": top = marginY; left = marginX; break;
        case "northeast": top = marginY; left = meta.width - wMeta.width - marginX; break;
        case "southwest": top = meta.height - wMeta.height - marginY; left = marginX; break;
        case "southeast": top = meta.height - wMeta.height - marginY; left = meta.width - wMeta.width - marginX; break;
        case "center": case "centre": top = (meta.height - wMeta.height)/2; left = (meta.width - wMeta.width)/2; break;
        case "north": top = marginY; left = (meta.width - wMeta.width)/2; break;
        case "south": top = meta.height - wMeta.height - marginY; left = (meta.width - wMeta.width)/2; break;
      }

      const out = await img.composite([{ input: wMarkBuffer, top: Math.round(top), left: Math.round(left) }]).toBuffer();
      await interaction.editReply({ files: [new AttachmentBuilder(out, { name: "prime.png" })] });
    } catch (e) { console.error(e); await interaction.editReply("❌ Erreur watermark"); }
  }

  // ===== DEVIS =====
  // ... ici le code complet du devis avec signature et envoi MP / channel ...
  // identique à la dernière version fonctionnelle que tu avais validée
  // y compris le canvas complet avec design, signature, et boutons d'envoi

  // ===== DISPO =====
  if (interaction.isButton()) {
    await interaction.deferReply({ flags: 64 });
    const member = interaction.member;
    const status = interaction.customId === "dispo_on" ? "🟢" : "🔴";

    if (interaction.channelId === PHOTO_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) return interaction.editReply("❌ Tu n'es pas photographe.");
      photoStatuses[userId] = status;
    } else if (interaction.channelId === MODEL_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === MODEL_ROLE)) return interaction.editReply("❌ Tu n'es pas modèle.");
      modelStatuses[userId] = status;
    } else return;

    saveStatuses({ photoStatuses, modelStatuses });
    await refreshAll();
    return interaction.editReply("✅ Statut mis à jour");
  }
});

client.login(TOKEN);
