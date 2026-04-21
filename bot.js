// ================= IMPORTS =================
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

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const GUILD_ID = "1403500050067230730";

const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

// ================= FILES =================
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

// ================= CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ================= EMBEDS =================
async function generateEmbed(guild, data, title, color) {
  let desc = "";

  for (const id in data) {
    try {
      const m = await guild.members.fetch(id);
      const name = m.nickname || m.user.username;
      desc += `• **${name}** → ${data[id]}\n`;
    } catch {
      delete data[id];
    }
  }

  if (!desc) desc = "_Aucun_";

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(desc)
    .setTimestamp();
}

function generateDashboard() {
  const p = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const m = Object.values(modelStatuses).filter(s => s === "🟢").length;

  return new EmbedBuilder()
    .setTitle("📊 Dashboard")
    .addFields(
      { name: "📸 Photographes dispo", value: `${p}`, inline: true },
      { name: "👠 Modèles dispo", value: `${m}`, inline: true }
    )
    .setColor("#2f3136");
}

// ================= PANELS =================
const buttons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

async function updatePanel(channelId, embed, key) {
  const channel = await client.channels.fetch(channelId);
  const panels = getPanels();

  let msg;
  if (panels[key]) {
    try { msg = await channel.messages.fetch(panels[key]); } catch {}
  }

  if (!msg) {
    msg = await channel.send({ embeds: [embed], components: key !== "dashboardMessageId" ? [buttons] : [] });
    panels[key] = msg.id;
    savePanels(panels);
  } else {
    await msg.edit({ embeds: [embed], components: key !== "dashboardMessageId" ? [buttons] : [] });
  }
}

async function refreshAll() {
  const guild = await client.guilds.fetch(GUILD_ID);

  await updatePanel(PHOTO_CHANNEL_ID, await generateEmbed(guild, photoStatuses, "📸 Photographes", "#00bfff"), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, await generateEmbed(guild, modelStatuses, "👠 Modèles", "#ff69b4"), "modelMessageId");
  await updatePanel(DASHBOARD_CHANNEL_ID, generateDashboard(), "dashboardMessageId");

  saveStatuses({ photoStatuses, modelStatuses });
}

// ================= AUTO RECREATE =================
client.on("messageDelete", async (msg) => {
  const panels = getPanels();

  if (
    msg.id === panels.photoMessageId ||
    msg.id === panels.modelMessageId ||
    msg.id === panels.dashboardMessageId
  ) {
    await refreshAll();
  }
});

// ================= READY =================
client.once("ready", async () => {
  console.log("✅ Bot prêt");
  await refreshAll();
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {

  const userId = interaction.user.id;

  // ---------- WATERMARK ----------
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {

    if (interaction.channelId !== WATERMARK_CHANNEL_ID)
      return interaction.reply({ content: "❌ Mauvais salon", flags: 64 });

    await interaction.deferReply();

    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position");
    const logo = interaction.options.getString("logo");

    const file =
      logo === "2" ? "watermark2.png" :
      logo === "3" ? "watermark3.png" :
      "watermark.png";

    const res = await fetch(attach.url);
    const buffer = Buffer.from(await res.arrayBuffer());

    const img = sharp(buffer);
    const meta = await img.metadata();

    const wm = await sharp(path.join(__dirname, file))
      .resize({ width: Math.floor(meta.width * 0.06) })
      .toBuffer();

    const out = await img.composite([{ input: wm, gravity: pos, opacity: 0.8 }]).toBuffer();

    return interaction.editReply({
      files: [new AttachmentBuilder(out, { name: "watermark.png" })]
    });
  }

  // ---------- DEVIS ----------
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {

    await interaction.deferReply();

    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 800, 1000);

    ctx.fillStyle = "#000";
    ctx.font = "30px sans-serif";

    ctx.fillText(`Client: ${interaction.options.getString("client")}`, 50, 100);
    ctx.fillText(`Téléphone: ${interaction.options.getString("telephone")}`, 50, 150);
    ctx.fillText(`Photos: ${interaction.options.getInteger("photos")}`, 50, 200);
    ctx.fillText(`Prix: $${interaction.options.getInteger("prix")}`, 50, 250);

    return interaction.editReply({
      files: [new AttachmentBuilder(canvas.toBuffer(), { name: "devis.png" })]
    });
  }

  // ---------- PING ----------
  if (interaction.isChatInputCommand()) {

    const build = (data, s) =>
      Object.entries(data)
        .filter(([_, v]) => v === s)
        .map(([id]) => `<@${id}>`)
        .join(" ") || null;

    if (interaction.commandName === "pingdispo_photo")
      return interaction.reply({ content: build(photoStatuses, "🟢") || "❌ Aucun" });

    if (interaction.commandName === "pingindispo_photo")
      return interaction.reply({ content: build(photoStatuses, "🔴") || "❌ Aucun" });

    if (interaction.commandName === "pingdispo_model")
      return interaction.reply({ content: build(modelStatuses, "🟢") || "❌ Aucun" });

    if (interaction.commandName === "pingindispo_model")
      return interaction.reply({ content: build(modelStatuses, "🔴") || "❌ Aucun" });
  }

  // ---------- BOUTONS ----------
  if (interaction.isButton()) {

    const member = interaction.member;
    const status = interaction.customId === "dispo_on" ? "🟢" : "🔴";

    if (interaction.channelId === PHOTO_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === PHOTO_ROLE))
        return interaction.reply({ content: "❌ Pas photographe", flags: 64 });

      photoStatuses[userId] = status;
    }

    else if (interaction.channelId === MODEL_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === MODEL_ROLE))
        return interaction.reply({ content: "❌ Pas modèle", flags: 64 });

      modelStatuses[userId] = status;
    }

    await refreshAll();
    return interaction.reply({ content: "✅ MAJ", flags: 64 });
  }
});

client.login(TOKEN);
