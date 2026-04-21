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

// ================= FONTS =================
registerFont('./DancingScript.ttf', { family: 'Dancing' });
registerFont('./Roboto-Regular.ttf', { family: 'Roboto' });

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

const devisCache = new Map();

// ================= INIT =================
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
const savePanels = (d) => fs.writeFileSync(panelFile, JSON.stringify(d, null, 2));

const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (d) => fs.writeFileSync(statusFile, JSON.stringify(d, null, 2));

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

// ================= READY =================
client.once("ready", async () => {
  console.log("✅ Bot prêt");

  const panels = getPanels();
  const guild = await client.guilds.fetch(GUILD_ID);

  try {
    if (panels.photoMessageId) {
      const ch = await client.channels.fetch(PHOTO_CHANNEL_ID);
      const msg = await ch.messages.fetch(panels.photoMessageId);
      await msg.edit({ embeds: [await generateEmbed(guild, photoStatuses, "📸 Photographes", "#00bfff")], components: [buttons] });
    }
  } catch { panels.photoMessageId = null; }

  try {
    if (panels.modelMessageId) {
      const ch = await client.channels.fetch(MODEL_CHANNEL_ID);
      const msg = await ch.messages.fetch(panels.modelMessageId);
      await msg.edit({ embeds: [await generateEmbed(guild, modelStatuses, "👠 Modèles", "#ff69b4")], components: [buttons] });
    }
  } catch { panels.modelMessageId = null; }

  try {
    if (panels.dashboardMessageId) {
      const ch = await client.channels.fetch(DASHBOARD_CHANNEL_ID);
      const msg = await ch.messages.fetch(panels.dashboardMessageId);
      await msg.edit({ embeds: [generateDashboard()] });
    }
  } catch { panels.dashboardMessageId = null; }

  savePanels(panels);
});

// ================= DELETE =================
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

    const map = {
      "top-left": "northwest",
      "top-right": "northeast",
      "bottom-left": "southwest",
      "bottom-right": "southeast",
      "center": "center",
      "top-center": "north",
      "bottom-center": "south"
    };

    const gravity = map[pos] || "southeast";

    const res = await fetch(attach.url);
    const buffer = Buffer.from(await res.arrayBuffer());

    const img = sharp(buffer);
    const meta = await img.metadata();

    const wm = await sharp("./watermark.png")
      .resize({ width: Math.floor(meta.width * 0.06) })
      .toBuffer();

    const out = await img.composite([
      { input: wm, gravity: gravity, opacity: 0.8 }
    ]).toBuffer();

    return interaction.editReply({
      files: [new AttachmentBuilder(out, { name: "watermark.png" })]
    });
  }

  // ---------- DEVIS ----------
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {

    await interaction.deferReply();

    const data = {
      client: interaction.options.getString("client"),
      telephone: interaction.options.getString("telephone"),
      photographe: interaction.options.getString("photographe"),
      photos: interaction.options.getInteger("photos"),
      description: interaction.options.getString("description"),
      prix: interaction.options.getInteger("prix")
    };

    const id = Date.now().toString();
    devisCache.set(id, data);

    const canvas = createCanvas(900, 1100);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 900, 1100);

    ctx.fillStyle = "#000";
    ctx.font = "bold 40px Roboto";
    ctx.fillText("DEVIS", 50, 80);

    ctx.font = "20px Roboto";
    ctx.fillText(`Date : ${new Date().toLocaleDateString()}`, 50, 120);

    ctx.fillText(`Client : ${data.client}`, 50, 200);
    ctx.fillText(`Téléphone : ${data.telephone}`, 50, 230);
    ctx.fillText(`Photographe : ${data.photographe}`, 50, 260);
    ctx.fillText(`Photos : ${data.photos}`, 50, 290);

    ctx.fillText("Description :", 50, 340);

    let y = 380;
    let line = "";
    for (let word of data.description.split(" ")) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > 750) {
        ctx.fillText(line, 50, y);
        line = word + " ";
        y += 30;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, 50, y);

    ctx.font = "bold 30px Roboto";
    ctx.fillText(`TOTAL : $${data.prix}`, 50, 700);

    ctx.font = "20px Roboto";
    ctx.fillText("Signature client :", 50, 850);
    ctx.strokeRect(50, 870, 300, 100);

    const buffer = canvas.toBuffer();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${id}`).setLabel("Signer").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuse_${id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "devis.png" })],
      components: [row]
    });
  }

  // ---------- SIGNATURE ----------
  if (interaction.isButton()) {

    if (interaction.customId.startsWith("sign_")) {

      const id = interaction.customId.split("_")[1];
      const devis = devisCache.get(id);

      if (!devis) return interaction.reply({ content: "❌ Introuvable", flags: 64 });

      const name = interaction.member.nickname || interaction.user.username;
      const date = new Date().toLocaleDateString();

      const canvas = createCanvas(900, 1100);
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 900, 1100);

      ctx.font = "bold 40px Roboto";
      ctx.fillText("DEVIS SIGNÉ", 50, 80);

      ctx.font = "20px Roboto";
      ctx.fillText(`Client : ${devis.client}`, 50, 200);
      ctx.fillText(`TOTAL : $${devis.prix}`, 50, 260);

      ctx.font = "30px Dancing";
      ctx.fillText(name, 60, 900);

      ctx.font = "20px Roboto";
      ctx.fillText(`Signé le ${date}`, 60, 950);

      const buffer = canvas.toBuffer();

      devisCache.delete(id);

      return interaction.update({
        content: `✅ Signé par ${name}`,
        files: [new AttachmentBuilder(buffer, { name: "signed.png" })],
        components: []
      });
    }

    if (interaction.customId.startsWith("refuse_")) {
      await interaction.message.delete().catch(() => {});
      return;
    }
  }

});

client.login(TOKEN);
